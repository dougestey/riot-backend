import type { PayloadRequest } from 'payload'

import { discoverInstagramAccount, type InstagramMedia } from '@/lib/instagram'
import { extractEventFromImage, type VisionEventExtraction } from '@/lib/openai-vision'

import { ingestNormalizedEvent, makeSourceKey, stableHash } from './core'
import { snapshotInstagramMedia } from './media'

async function saveReviewRecord(
  req: PayloadRequest,
  input: {
    media: InstagramMedia
    extraction?: VisionEventExtraction
    model?: string
    cityId: number
    venueId: number
    status: 'needs-review' | 'skipped' | 'failed'
    error?: string
  },
) {
  const sourceKey = makeSourceKey('instagram', input.media.id, input.cityId)
  const records = await req.payload.find({
    collection: 'ingestion-records',
    where: { sourceKey: { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const data = {
    source: 'instagram' as const,
    sourceKey,
    externalId: input.media.id,
    canonicalUrl: input.media.permalink,
    city: input.cityId,
    venue: input.venueId,
    status: input.status,
    normalizedPayload: input.extraction || {},
    sourcePayload: {
      caption: input.media.caption,
      mediaType: input.media.media_type,
      timestamp: input.media.timestamp,
      permalink: input.media.permalink,
    },
    payloadHash: stableHash({ media: input.media, extraction: input.extraction }),
    confidence: input.extraction?.confidence,
    model: input.model,
    extractionEvidence: input.extraction ? { evidence: input.extraction.evidence } : undefined,
    processedAt: new Date().toISOString(),
    errors: input.error ? [{ message: input.error.slice(0, 2_000) }] : [],
  }
  if (records.docs[0]) {
    return req.payload.update({
      collection: 'ingestion-records',
      id: records.docs[0].id,
      data,
      overrideAccess: true,
      req,
    })
  }
  try {
    return await req.payload.create({
      collection: 'ingestion-records',
      data,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    const winner = await req.payload.find({
      collection: 'ingestion-records',
      where: { sourceKey: { equals: sourceKey } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
    if (!winner.docs[0]) throw error
    return req.payload.update({
      collection: 'ingestion-records',
      id: winner.docs[0].id,
      data,
      overrideAccess: true,
      req,
    })
  }
}

export async function pollInstagramVenue(req: PayloadRequest, venueId: number) {
  const venue = await req.payload.findByID({
    collection: 'venues',
    id: venueId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (!venue.instagram?.monitoringEnabled || !venue.instagram.username) {
    throw new Error('Instagram monitoring is not enabled for this venue')
  }
  const cityId = venue.city && typeof venue.city === 'object' ? venue.city.id : venue.city
  if (!cityId) throw new Error('Venue must have a normalized city')
  const city = await req.payload.findByID({
    collection: 'cities',
    id: cityId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  try {
    const account = await discoverInstagramAccount(venue.instagram.username)
    const counts = { seen: 0, created: 0, review: 0, skipped: 0, failed: 0 }
    for (const media of account.media?.data || []) {
      counts.seen++
      const sourceKey = makeSourceKey('instagram', media.id, cityId)
      const existing = await req.payload.find({
        collection: 'ingestion-records',
        where: {
          and: [
            { sourceKey: { equals: sourceKey } },
            { status: { in: ['event-created', 'skipped'] } },
          ],
        },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
      })
      if (existing.docs[0]) {
        counts.skipped++
        continue
      }

      try {
        const snapshot = await snapshotInstagramMedia(req, media)
        const { extraction, model } = await extractEventFromImage({
          image: snapshot.image,
          mimeType: snapshot.mimeType,
          caption: media.caption,
          venueName: venue.name,
          cityName: city.name,
          timezone: city.timezone,
        })
        if (!extraction.isEvent) {
          await saveReviewRecord(req, {
            media,
            extraction,
            model,
            cityId,
            venueId,
            status: 'skipped',
          })
          counts.skipped++
          continue
        }
        if (!extraction.title || !extraction.startDateTime || extraction.confidence < 0.65) {
          await saveReviewRecord(req, {
            media,
            extraction,
            model,
            cityId,
            venueId,
            status: 'needs-review',
            error: 'Required event details are missing or confidence is below 0.65',
          })
          counts.review++
          continue
        }

        const result = await ingestNormalizedEvent(req, {
          event: {
            source: 'instagram',
            externalId: media.id,
            title: extraction.title,
            startDateTime: extraction.startDateTime,
            endDateTime: extraction.endDateTime || undefined,
            timezone: extraction.timezone || city.timezone,
            description: extraction.description || media.caption,
            canonicalUrl: extraction.ticketUrl || media.permalink,
            cityId,
            venueId,
            featuredImageId: snapshot.id,
            confidence: extraction.confidence,
            model,
            extractionEvidence: { evidence: extraction.evidence },
            sourceUpdatedAt: media.timestamp,
          },
          sourcePayload: {
            caption: media.caption,
            mediaType: media.media_type,
            permalink: media.permalink,
          },
        })
        if (result.state === 'created' || result.state === 'updated') counts.created++
        else if (result.state === 'needs-review') counts.review++
        else counts.failed++
      } catch (error) {
        await saveReviewRecord(req, {
          media,
          cityId,
          venueId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Instagram processing failed',
        })
        counts.failed++
      }
    }

    await req.payload.update({
      collection: 'venues',
      id: venue.id,
      data: {
        instagram: {
          ...venue.instagram,
          accountId: account.id,
          username: account.username,
          status: 'active',
          lastCheckedAt: new Date().toISOString(),
          lastError: null,
        },
      },
      overrideAccess: true,
      req,
    })
    return counts
  } catch (error) {
    await req.payload.update({
      collection: 'venues',
      id: venue.id,
      data: {
        instagram: {
          ...venue.instagram,
          status: 'error',
          lastCheckedAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown error',
        },
      },
      overrideAccess: true,
      req,
    })
    throw error
  }
}
