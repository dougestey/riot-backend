import { timingSafeEqual } from 'node:crypto'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  type WPEvent,
  cleanText,
  extractImageUrl,
  getOrCreateMediaFromUrl,
  upsertCategory,
  upsertEvent,
  upsertOrganizer,
  upsertVenue,
} from '@/lib/wordpress'

function verifySecret(header: string | null): boolean {
  const expected = process.env.WORDPRESS_WEBHOOK_SECRET
  if (!expected || !header) return false

  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  // Auth
  if (!verifySecret(request.headers.get('x-webhook-secret'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: { event?: WPEvent }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = body.event
  if (!event?.id || !event?.start_date) {
    return Response.json(
      { error: 'Missing required fields: event.id and event.start_date' },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const nowIso = new Date().toISOString()
  const mediaBySourceUrl = new Map<string, number>()

  const result: {
    venue?: { id: number; error?: string }
    categories: Array<{ wpId: number; id?: number; error?: string }>
    organizers: Array<{ wpId: number; id?: number; error?: string }>
    media?: { id: number; created: boolean; error?: string }
    event?: { id: number; action: 'created' | 'updated'; error?: string }
  } = { categories: [], organizers: [] }

  // Upsert venue (tolerates failure)
  let venueId: number | undefined
  if (event.venue?.id) {
    try {
      venueId = await upsertVenue(payload, event.venue, nowIso)
      result.venue = { id: venueId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Webhook: venue upsert failed for WP venue ${event.venue.id}:`, message)
      result.venue = { id: event.venue.id, error: message }
    }
  }

  // Upsert categories (tolerates individual failures)
  const categoryIds: number[] = []
  for (const cat of event.categories ?? []) {
    try {
      const catId = await upsertCategory(payload, cat, nowIso)
      categoryIds.push(catId)
      result.categories.push({ wpId: cat.id, id: catId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Webhook: category upsert failed for WP category ${cat.id}:`, message)
      result.categories.push({ wpId: cat.id, error: message })
    }
  }

  // Upsert organizers (tolerates individual failures)
  const organizerIds: number[] = []
  for (const org of event.organizers ?? []) {
    try {
      const orgId = await upsertOrganizer(payload, org, nowIso)
      organizerIds.push(orgId)
      result.organizers.push({ wpId: org.id, id: orgId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Webhook: organizer upsert failed for WP organizer ${org.id}:`, message)
      result.organizers.push({ wpId: org.id, error: message })
    }
  }

  // Fetch/create media (tolerates failure)
  let featuredImageId: number | undefined
  const sourceImageUrl = extractImageUrl(event.imageUrl) ?? extractImageUrl(event.image)
  if (sourceImageUrl) {
    try {
      const mediaResult = await getOrCreateMediaFromUrl({
        payload,
        imageUrl: sourceImageUrl,
        eventId: event.id,
        eventTitle: cleanText(event.title),
        mediaBySourceUrl,
      })
      if (mediaResult) {
        featuredImageId = mediaResult.id
        result.media = { id: mediaResult.id, created: mediaResult.created }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Webhook: media fetch failed for event ${event.id}:`, message)
      result.media = { id: 0, created: false, error: message }
    }
  }

  // Upsert event
  try {
    const eventResult = await upsertEvent(payload, event, {
      venueId,
      categoryIds,
      organizerIds,
      featuredImageId,
      nowIso,
    })
    result.event = eventResult
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Webhook: event upsert failed for WP event ${event.id}:`, message)
    return Response.json(
      { error: `Event upsert failed: ${message}`, details: result },
      { status: 422 },
    )
  }

  return Response.json({ ok: true, ...result })
}
