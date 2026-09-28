import { createHash } from 'node:crypto'

import type { PayloadRequest, Where } from 'payload'

import type { Event, IngestionRecord } from '@/payload-types'

import type { IngestionInput, IngestionSource, NormalizationError, NormalizedEvent } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function makeSourceKey(
  source: IngestionSource,
  externalId: string,
  cityId?: number,
  scope?: string,
): string {
  return [source, cityId, scope, externalId.trim()].filter((value) => value !== undefined).join(':')
}

export function safeExternalURL(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function eventFingerprint(event: NormalizedEvent): string {
  return stableHash({
    title: normalizeTitle(event.title),
    start: new Date(event.startDateTime).toISOString(),
    venue: event.venueId ?? null,
    city: event.cityId,
  })
}

export function validateNormalizedEvent(event: NormalizedEvent): NormalizationError[] {
  const errors: NormalizationError[] = []
  if (!event.externalId.trim())
    errors.push({ field: 'externalId', message: 'External ID is required' })
  if (!event.title.trim()) errors.push({ field: 'title', message: 'Title is required' })
  if (!Number.isInteger(event.cityId)) errors.push({ field: 'cityId', message: 'City is required' })

  const start = new Date(event.startDateTime)
  if (Number.isNaN(start.getTime())) {
    errors.push({ field: 'startDateTime', message: 'Start date must be a valid ISO timestamp' })
  }
  if (event.endDateTime) {
    const end = new Date(event.endDateTime)
    if (Number.isNaN(end.getTime())) {
      errors.push({ field: 'endDateTime', message: 'End date must be a valid ISO timestamp' })
    } else if (!Number.isNaN(start.getTime()) && end < start) {
      errors.push({ field: 'endDateTime', message: 'End date cannot precede start date' })
    }
  }
  if (
    event.confidence !== undefined &&
    (event.confidence < 0 || event.confidence > 1 || !Number.isFinite(event.confidence))
  ) {
    errors.push({ field: 'confidence', message: 'Confidence must be between 0 and 1' })
  }
  return errors
}

export function textToLexical(text?: string): Event['description'] | undefined {
  if (!text?.trim()) return undefined
  return {
    root: {
      type: 'root',
      children: text
        .trim()
        .split(/\n{2,}/)
        .map((paragraph) => ({
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'text',
              version: 1,
              text: paragraph.replace(/\s*\n\s*/g, ' '),
              format: 0,
              mode: 'normal',
              style: '',
              detail: 0,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
        })),
      direction: null,
      format: '' as const,
      indent: 0,
      version: 1,
    },
  } as Event['description']
}

export async function cancelIngestedEvent(
  req: PayloadRequest,
  source: IngestionSource,
  externalId: string,
  cityId: number,
  scope?: string,
): Promise<boolean> {
  const sourceKey = makeSourceKey(source, externalId, cityId, scope)
  const events = await req.payload.find({
    collection: 'events',
    where: { 'sync.sourceKey': { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  if (!events.docs[0]) return false
  const records = await req.payload.find({
    collection: 'ingestion-records',
    where: { sourceKey: { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  if (records.docs[0]) {
    const priorPayload =
      records.docs[0].normalizedPayload && typeof records.docs[0].normalizedPayload === 'object'
        ? records.docs[0].normalizedPayload
        : {}
    const priorEvidence =
      records.docs[0].extractionEvidence && typeof records.docs[0].extractionEvidence === 'object'
        ? records.docs[0].extractionEvidence
        : {}
    await req.payload.update({
      collection: 'ingestion-records',
      id: records.docs[0].id,
      data: {
        status: 'event-created',
        normalizedPayload: { ...priorPayload, cancelled: true },
        extractionEvidence: {
          ...priorEvidence,
          sourceCancellation: {
            previousStatus: events.docs[0].status,
            cancelledAt: new Date().toISOString(),
          },
        },
        processedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })
  }
  await req.payload.update({
    collection: 'events',
    id: events.docs[0].id,
    data: {
      status: 'cancelled',
      sync: { ...events.docs[0].sync, lastSyncedAt: new Date().toISOString() },
    },
    overrideAccess: true,
    req,
  })
  return true
}

function slugFor(event: NormalizedEvent, sourceKey: string): string {
  const base =
    normalizeTitle(event.title).replace(/\s+/g, '-').slice(0, 70).replace(/^-|-$/g, '') || 'event'
  return `${base}-${stableHash(sourceKey).slice(0, 8)}`
}

function relationID(value: number | Event | null | undefined): number | undefined {
  if (typeof value === 'number') return value
  return value?.id
}

async function findDuplicateCandidates(
  req: PayloadRequest,
  event: NormalizedEvent,
): Promise<number[]> {
  const start = new Date(event.startDateTime)
  const where: Where = {
    and: [
      { city: { equals: event.cityId } },
      { startDateTime: { greater_than_equal: new Date(start.getTime() - DAY_MS).toISOString() } },
      { startDateTime: { less_than_equal: new Date(start.getTime() + DAY_MS).toISOString() } },
    ],
  }
  const candidates = await req.payload.find({
    collection: 'events',
    where,
    depth: 0,
    limit: 50,
    overrideAccess: true,
    req,
  })
  const normalizedTitle = normalizeTitle(event.title)
  return candidates.docs
    .filter((candidate) => normalizeTitle(candidate.title) === normalizedTitle)
    .map((candidate) => candidate.id)
}

export async function ingestNormalizedEvent(
  req: PayloadRequest,
  input: IngestionInput,
): Promise<{
  event?: Event
  recordId: number
  state: 'created' | 'updated' | 'needs-review' | 'failed'
}> {
  const { event } = input
  const sourceKey = makeSourceKey(event.source, event.externalId, event.cityId, input.scope)
  const canonicalUrl = safeExternalURL(event.canonicalUrl)
  const payloadHash = stableHash({ event, sourcePayload: input.sourcePayload })
  const errors = validateNormalizedEvent(event)

  const existingRecords = await req.payload.find({
    collection: 'ingestion-records',
    where: { sourceKey: { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const existingRecord = existingRecords.docs[0]
  const baseRecord = {
    source: event.source,
    sourceKey,
    externalId: event.externalId,
    canonicalUrl,
    city: event.cityId,
    venue: event.venueId,
    submittedBy: input.submittedBy,
    connection: input.connection,
    normalizedPayload: event,
    sourcePayload: input.sourcePayload,
    payloadHash,
    confidence: event.confidence,
    model: event.model,
    extractionEvidence: event.extractionEvidence,
    sourceUpdatedAt: event.sourceUpdatedAt,
    errors,
  } as const

  let record: IngestionRecord
  if (existingRecord) {
    record = await req.payload.update({
      collection: 'ingestion-records',
      id: existingRecord.id,
      data: {
        ...baseRecord,
        status: errors.length > 0 ? 'failed' : 'processing',
      },
      overrideAccess: true,
      req,
    })
  } else {
    try {
      record = await req.payload.create({
        collection: 'ingestion-records',
        data: {
          ...baseRecord,
          status: errors.length > 0 ? 'failed' : 'processing',
        },
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
      record = await req.payload.update({
        collection: 'ingestion-records',
        id: winner.docs[0].id,
        data: {
          ...baseRecord,
          status: errors.length > 0 ? 'failed' : 'processing',
        },
        overrideAccess: true,
        req,
      })
    }
  }

  if (errors.length > 0) return { recordId: record.id, state: 'failed' }

  const exactEvents = await req.payload.find({
    collection: 'events',
    where: { 'sync.sourceKey': { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const existingEvent = exactEvents.docs[0]
  const previousPayload =
    existingRecord?.normalizedPayload && typeof existingRecord.normalizedPayload === 'object'
      ? (existingRecord.normalizedPayload as { cancelled?: boolean })
      : undefined
  const reactivatingSourceCancellation =
    existingEvent?.status === 'cancelled' && previousPayload?.cancelled === true && !event.cancelled
  const sourceManagedCancellation =
    existingEvent?.status === 'cancelled' &&
    (previousPayload?.cancelled === true || event.cancelled)

  if (
    existingEvent &&
    existingEvent.status !== 'draft' &&
    !sourceManagedCancellation &&
    !reactivatingSourceCancellation &&
    !event.cancelled
  ) {
    await req.payload.update({
      collection: 'ingestion-records',
      id: record.id,
      data: {
        status: 'needs-review',
        linkedEvent: existingEvent.id,
        errors: [{ message: 'Changes to an editorially managed event require editor review' }],
        processedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })
    return { event: existingEvent, recordId: record.id, state: 'needs-review' }
  }
  const duplicateCandidates = existingEvent ? [] : await findDuplicateCandidates(req, event)

  if (duplicateCandidates.length > 0) {
    await req.payload.update({
      collection: 'ingestion-records',
      id: record.id,
      data: {
        status: 'needs-review',
        duplicateCandidates,
        processedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })
    return { recordId: record.id, state: 'needs-review' }
  }

  const eventData: Partial<Event> & Pick<Event, 'title' | 'startDateTime'> = {
    title: event.title.trim(),
    slug: existingEvent?.slug || slugFor(event, sourceKey),
    description: textToLexical(event.description),
    startDateTime: new Date(event.startDateTime).toISOString(),
    endDateTime: event.endDateTime ? new Date(event.endDateTime).toISOString() : undefined,
    isAllDay: Boolean(event.isAllDay),
    timezone: event.timezone || 'UTC',
    venue: event.venueId,
    city: event.cityId,
    website: canonicalUrl,
    featuredImage: event.featuredImageId,
    sync: {
      source: event.source,
      externalId: event.externalId,
      sourceKey,
      externalUrl: canonicalUrl,
      ingestionRecord: record.id,
      lastSyncedAt: new Date().toISOString(),
    },
  }

  let savedEvent: Event
  if (existingEvent) {
    savedEvent = await req.payload.update({
      collection: 'events',
      id: existingEvent.id,
      data: {
        ...eventData,
        ...(event.cancelled
          ? { status: 'cancelled' as const }
          : reactivatingSourceCancellation
            ? { status: 'draft' as const }
            : {}),
      },
      overrideAccess: true,
      req,
    })
  } else {
    try {
      savedEvent = await req.payload.create({
        collection: 'events',
        data: {
          ...eventData,
          status: event.cancelled ? 'cancelled' : 'draft',
          featured: false,
        },
        overrideAccess: true,
        req,
      })
    } catch (error) {
      const winner = await req.payload.find({
        collection: 'events',
        where: { 'sync.sourceKey': { equals: sourceKey } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
      })
      if (!winner.docs[0]) throw error
      savedEvent = await req.payload.update({
        collection: 'events',
        id: winner.docs[0].id,
        data: {
          ...eventData,
          ...(event.cancelled
            ? { status: 'cancelled' as const }
            : reactivatingSourceCancellation
              ? { status: 'draft' as const }
              : {}),
        },
        overrideAccess: true,
        req,
      })
    }
  }

  await req.payload.update({
    collection: 'ingestion-records',
    id: record.id,
    data: {
      status: 'event-created',
      linkedEvent: savedEvent.id,
      duplicateCandidates: [],
      processedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  })

  return {
    event: savedEvent,
    recordId: record.id,
    state: relationID(existingRecord?.linkedEvent)
      ? 'updated'
      : existingEvent
        ? 'updated'
        : 'created',
  }
}
