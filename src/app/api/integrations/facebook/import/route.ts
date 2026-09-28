import { requireUser, userCanAccessCity } from '@/lib/auth'
import {
  facebookEventsFeatureStatus,
  getFacebookEvent,
  mapFacebookEvent,
} from '@/lib/facebook-events'
import { ingestNormalizedEvent } from '@/lib/ingestion/core'

export async function POST(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const feature = facebookEventsFeatureStatus()
    if (!feature.enabled) {
      return Response.json({ error: feature.reason }, { status: 503 })
    }
    const body = (await request.json()) as { eventId?: string; cityId?: number }
    if (!body.eventId || !body.cityId || !userCanAccessCity(user, body.cityId)) {
      return Response.json(
        { error: 'Valid eventId and assigned cityId are required' },
        { status: 400 },
      )
    }

    const graphEvent = await getFacebookEvent(
      body.eventId,
      process.env.META_FACEBOOK_EVENT_TEST_TOKEN!,
    )
    const event = mapFacebookEvent(graphEvent, body.cityId)
    if (!event) return Response.json({ error: 'Facebook event is incomplete' }, { status: 422 })

    const result = await ingestNormalizedEvent(req, {
      event,
      submittedBy: user.id,
      scope: `user-${user.id}`,
      sourcePayload: { graphEvent },
    })
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Facebook import failed' },
      { status: 400 },
    )
  }
}
