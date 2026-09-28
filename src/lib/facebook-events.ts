import type { NormalizedEvent } from './ingestion/types'

const DEFAULT_GRAPH_VERSION = 'v26.0'
const EVENT_FIELDS = [
  'id',
  'name',
  'description',
  'start_time',
  'end_time',
  'timezone',
  'place',
  'cover',
  'owner',
  'ticket_uri',
  'is_canceled',
  'is_online',
].join(',')

export type FacebookGraphEvent = {
  id: string
  name?: string
  description?: string
  start_time?: string
  end_time?: string
  timezone?: string
  ticket_uri?: string
  is_canceled?: boolean
  place?: {
    name?: string
    id?: string
    location?: { city?: string; latitude?: number; longitude?: number }
  }
  cover?: { source?: string }
}

function graphURL(path: string): URL {
  const version = process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION
  return new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`)
}

async function graphGET<T>(path: string, accessToken: string, fields = EVENT_FIELDS): Promise<T> {
  const url = graphURL(path)
  url.searchParams.set('fields', fields)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json()) as T & { error?: { message?: string; code?: number } }
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `Facebook Graph failed (${response.status})`)
    Object.assign(error, { status: response.status, graphCode: body.error?.code })
    throw error
  }
  return body
}

export async function getFacebookEvent(eventId: string, accessToken: string) {
  return graphGET<FacebookGraphEvent>(encodeURIComponent(eventId), accessToken)
}

export async function getAuthorizedUserEvents(accessToken: string) {
  return graphGET<{ data: FacebookGraphEvent[] }>('me/events', accessToken)
}

export function mapFacebookEvent(
  event: FacebookGraphEvent,
  cityId: number,
): NormalizedEvent | undefined {
  if (!event.id || !event.name || !event.start_time) return undefined
  return {
    source: 'facebook',
    externalId: event.id,
    title: event.name,
    description: event.description,
    startDateTime: new Date(event.start_time).toISOString(),
    endDateTime: event.end_time ? new Date(event.end_time).toISOString() : undefined,
    timezone: event.timezone || 'UTC',
    locationText: event.place?.name,
    canonicalUrl: `https://www.facebook.com/events/${event.id}`,
    cityId,
    cancelled: Boolean(event.is_canceled),
  }
}

export function facebookEventsFeatureStatus() {
  const enabled = process.env.FACEBOOK_EVENTS_ENABLED === 'true'
  const configured = Boolean(
    process.env.META_FACEBOOK_EVENT_TEST_TOKEN && process.env.META_FACEBOOK_TEST_EVENT_ID,
  )
  return {
    enabled: enabled && configured,
    configured,
    reason:
      enabled && configured
        ? undefined
        : 'Direct Facebook Events requires a successful Marketing Partner production probe',
  }
}

export async function runFacebookFeasibilityProbe() {
  const accessToken = process.env.META_FACEBOOK_EVENT_TEST_TOKEN
  const eventId = process.env.META_FACEBOOK_TEST_EVENT_ID
  if (!accessToken || !eventId) {
    return {
      success: false,
      knownEventReadable: false,
      userEventsReadable: false,
      reason: 'META_FACEBOOK_EVENT_TEST_TOKEN and META_FACEBOOK_TEST_EVENT_ID are required',
    }
  }

  let knownEventReadable = false
  let userEventsReadable = false
  let knownEventError: string | undefined
  let userEventsError: string | undefined
  try {
    knownEventReadable = Boolean((await getFacebookEvent(eventId, accessToken)).id)
  } catch (error) {
    knownEventError = error instanceof Error ? error.message : 'Unknown Graph error'
  }
  try {
    const userEvents = await getAuthorizedUserEvents(accessToken)
    userEventsReadable = Array.isArray(userEvents.data)
  } catch (error) {
    userEventsError = error instanceof Error ? error.message : 'Unknown Graph error'
  }
  return {
    success: knownEventReadable && userEventsReadable,
    knownEventReadable,
    userEventsReadable,
    knownEventError,
    userEventsError,
    testedAt: new Date().toISOString(),
    requirement: 'Token must belong to a non-app-role production ambassador',
  }
}
