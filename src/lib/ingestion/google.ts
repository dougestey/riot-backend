import type { PayloadRequest } from 'payload'

import { fetchGoogleEvents, googleAccessToken } from '@/lib/google-calendar'

import { cancelIngestedEvent, ingestNormalizedEvent } from './core'

export async function syncGoogleConnection(req: PayloadRequest, connectionId: number) {
  let connection = await req.payload.findByID({
    collection: 'oauth-connections',
    id: connectionId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (connection.provider !== 'google' || connection.status !== 'active') {
    throw new Error('Google connection is not active')
  }
  if (!connection.encryptedCredentials) throw new Error('Google credentials are missing')
  const ownerId = typeof connection.owner === 'object' ? connection.owner.id : connection.owner
  const cityId = typeof connection.city === 'object' ? connection.city.id : connection.city
  const owner = await req.payload.findByID({
    collection: 'users',
    id: ownerId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const allowedCities = (owner.assignedCities || []).map((city) =>
    String(typeof city === 'object' ? city.id : city),
  )
  if (
    !owner.roles.includes('admin') &&
    !owner.roles.includes('editor') &&
    (!owner.roles.includes('ambassador') || !allowedCities.includes(String(cityId)))
  ) {
    await req.payload.update({
      collection: 'oauth-connections',
      id: connection.id,
      data: { status: 'revoked', lastError: 'Owner is no longer authorized for this city' },
      overrideAccess: true,
      req,
    })
    throw new Error('Connection owner is no longer authorized for this city')
  }

  try {
    const token = await googleAccessToken(connection.encryptedCredentials)
    let result
    try {
      result = await fetchGoogleEvents(connection, token.credentials.accessToken!)
    } catch (error) {
      if ((error as { status?: number }).status !== 410 || !connection.syncToken) throw error
      connection = await req.payload.update({
        collection: 'oauth-connections',
        id: connection.id,
        data: { syncToken: null },
        overrideAccess: true,
        req,
      })
      result = await fetchGoogleEvents(connection, token.credentials.accessToken!)
    }

    const counts = { created: 0, updated: 0, review: 0, failed: 0 }
    const scope = `connection-${connection.id}`
    for (const externalId of result.cancellations) {
      await cancelIngestedEvent(req, 'google-calendar', externalId, cityId, scope)
    }
    for (const event of result.events) {
      const ingestion = await ingestNormalizedEvent(req, {
        event,
        connection: connection.id,
        submittedBy: ownerId,
        scope,
        sourcePayload: { provider: 'google-calendar', calendarId: connection.calendarId },
      })
      if (ingestion.state === 'created') counts.created++
      else if (ingestion.state === 'updated') counts.updated++
      else if (ingestion.state === 'needs-review') counts.review++
      else counts.failed++
    }

    await req.payload.update({
      collection: 'oauth-connections',
      id: connection.id,
      data: {
        encryptedCredentials: token.encryptedCredentials,
        syncToken: result.nextSyncToken || connection.syncToken,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        status: 'active',
      },
      overrideAccess: true,
      req,
    })
    return { seen: result.events.length, ...counts }
  } catch (error) {
    const providerError = error as { status?: number; googleReason?: string }
    const definitiveAuthFailure =
      providerError.status === 401 ||
      (providerError.status === 403 &&
        ['authError', 'insufficientPermissions', 'forbidden'].includes(
          providerError.googleReason || '',
        ))
    await req.payload.update({
      collection: 'oauth-connections',
      id: connection.id,
      data: {
        status: definitiveAuthFailure ? 'revoked' : 'active',
        lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown sync error',
      },
      overrideAccess: true,
      req,
    })
    throw error
  }
}
