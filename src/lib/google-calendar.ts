import { createHash, randomBytes } from 'node:crypto'

import type { OauthConnection, User } from '@/payload-types'

import { decryptSecret, encryptSecret } from './crypto'
import type { NormalizedEvent } from './ingestion/types'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_API_URL = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

export type GoogleCredentials = {
  accessToken?: string
  refreshToken: string
  expiresAt?: number
}

type GoogleEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  updated?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  recurringEventId?: string
  originalStartTime?: { date?: string; dateTime?: string; timeZone?: string }
}

export function googleOAuthSettings() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are required')
  }
  return { clientId, clientSecret, redirectUri }
}

export function createPKCE() {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildGoogleAuthorizationURL(state: string, challenge: string): string {
  const { clientId, redirectUri } = googleOAuthSettings()
  const url = new URL(GOOGLE_AUTH_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: GOOGLE_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

async function tokenRequest(values: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json()) as Record<string, unknown>
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`)
  return body
}

export async function exchangeGoogleCode(
  code: string,
  verifier: string,
): Promise<GoogleCredentials> {
  const { clientId, clientSecret, redirectUri } = googleOAuthSettings()
  const body = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  })
  if (typeof body.refresh_token !== 'string') {
    throw new Error('Google did not return a refresh token')
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: typeof body.access_token === 'string' ? body.access_token : undefined,
    expiresAt:
      typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : undefined,
  }
}

export async function googleAccessToken(
  encryptedCredentials: string,
): Promise<{ credentials: GoogleCredentials; encryptedCredentials: string }> {
  const credentials = JSON.parse(decryptSecret(encryptedCredentials)) as GoogleCredentials
  if (credentials.accessToken && (credentials.expiresAt || 0) > Date.now() + 60_000) {
    return { credentials, encryptedCredentials }
  }

  const { clientId, clientSecret } = googleOAuthSettings()
  const body = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  })
  if (typeof body.access_token !== 'string') throw new Error('Google token refresh failed')
  const refreshed: GoogleCredentials = {
    ...credentials,
    accessToken: body.access_token,
    expiresAt:
      Date.now() + (typeof body.expires_in === 'number' ? body.expires_in * 1000 : 3600_000),
  }
  return { credentials: refreshed, encryptedCredentials: encryptSecret(JSON.stringify(refreshed)) }
}

async function googleGET<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GOOGLE_API_URL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: { errors?: Array<{ reason?: string }> } }
      | undefined
    const error = new Error(`Google Calendar request failed (${response.status})`)
    Object.assign(error, {
      status: response.status,
      googleReason: body?.error?.errors?.[0]?.reason,
    })
    throw error
  }
  return (await response.json()) as T
}

export async function listGoogleCalendars(accessToken: string) {
  const result = await googleGET<{
    items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }>
  }>('/users/me/calendarList?minAccessRole=reader', accessToken)
  return result.items || []
}

export async function fetchGoogleEvents(
  connection: OauthConnection,
  accessToken: string,
): Promise<{ events: NormalizedEvent[]; cancellations: string[]; nextSyncToken?: string }> {
  if (!connection.calendarId) throw new Error('A calendar must be selected before syncing')
  const cityId = typeof connection.city === 'object' ? connection.city.id : connection.city
  if (!cityId) throw new Error('Connection city is missing')

  const events: NormalizedEvent[] = []
  const cancellations: string[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '2500',
    })
    if (connection.syncToken) params.set('syncToken', connection.syncToken)
    else {
      params.set('timeMin', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      params.set('timeMax', new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString())
    }
    if (pageToken) params.set('pageToken', pageToken)
    const page = await googleGET<{
      items?: GoogleEvent[]
      nextPageToken?: string
      nextSyncToken?: string
    }>(
      `/calendars/${encodeURIComponent(connection.calendarId)}/events?${params.toString()}`,
      accessToken,
    )

    for (const item of page.items || []) {
      if (!item.id) continue
      const occurrence = item.originalStartTime?.dateTime || item.originalStartTime?.date
      const sourceId = `${connection.calendarId}:${occurrence ? `${item.id}:${occurrence}` : item.id}`
      if (item.status === 'cancelled') {
        cancellations.push(sourceId)
        continue
      }
      if (!item.start) continue
      const allDay = Boolean(item.start.date)
      const startValue = item.start.dateTime || item.start.date
      if (!startValue) continue
      const start = allDay ? `${startValue}T00:00:00.000Z` : new Date(startValue).toISOString()
      const endValue = item.end?.dateTime || item.end?.date
      events.push({
        source: 'google-calendar',
        externalId: sourceId,
        title: item.summary || 'Untitled calendar event',
        description: item.description,
        locationText: item.location,
        canonicalUrl: item.htmlLink,
        startDateTime: start,
        endDateTime: endValue
          ? allDay
            ? `${endValue}T00:00:00.000Z`
            : new Date(endValue).toISOString()
          : undefined,
        timezone: item.start.timeZone || 'UTC',
        isAllDay: allDay,
        cityId,
        cancelled: item.status === 'cancelled',
        sourceUpdatedAt: item.updated,
      })
    }
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken || nextSyncToken
  } while (pageToken)

  return { events, cancellations, nextSyncToken }
}

export function connectionOwnerID(connection: OauthConnection): number {
  return typeof connection.owner === 'object' ? connection.owner.id : connection.owner
}

export function userID(user: User): number {
  return user.id
}
