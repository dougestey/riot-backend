import { extname } from 'node:path'

import type { BasePayload } from 'payload'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WPVenue = {
  id: number
  venue?: string
  slug?: string
  description?: string
  address?: string
  city?: string
  country?: string
  province?: string
  state?: string
  stateprovince?: string
  zip?: string
  geo_lat?: number
  geo_lng?: number
  website?: string
  phone?: string
  modified?: string
}

export type WPCategory = {
  id: number
  name?: string
  slug?: string
  description?: string
  parent?: number
}

export type WPEvent = {
  id: number
  title?: string
  slug?: string
  status?: string
  start_date?: string
  end_date?: string
  timezone?: string
  all_day?: boolean
  website?: string
  featured?: boolean
  image?: unknown
  imageUrl?: unknown
  is_virtual?: boolean
  virtual_url?: string | null
  categories?: WPCategory[]
  venue?: WPVenue | null
  modified?: string
}

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

export const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
}

export function decodeEntities(input: string): string {
  let output = input

  for (const [entity, value] of Object.entries(NAMED_ENTITIES)) {
    output = output.split(entity).join(value)
  }

  output = output.replace(/&#(\d+);/g, (_match, code) => {
    const codePoint = Number(code)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
  })

  output = output.replace(/&#x([a-fA-F0-9]+);/g, (_match, hex) => {
    const codePoint = Number.parseInt(hex, 16)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
  })

  return output
}

export function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined
  const normalized = decodeEntities(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export function parseWPDate(value?: string | null): string | undefined {
  if (!value || value.startsWith('0000-00-00')) return undefined
  const iso = value.replace(' ', 'T')
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export function normalizeStatus(value?: string): 'draft' | 'published' | 'cancelled' | 'postponed' {
  if (value === 'publish') return 'published'
  if (value === 'cancelled') return 'cancelled'
  if (value === 'postponed') return 'postponed'
  return 'draft'
}

export function extractImageUrl(value: unknown): string | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item)
      if (found) return found
    }
    return undefined
  }

  if (typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const candidateKeys = [
    'imageUrl',
    'url',
    'source_url',
    'guid',
    'thumbnail',
    'medium',
    'large',
    'full',
    'original',
  ]

  for (const key of candidateKeys) {
    const found = extractImageUrl(record[key])
    if (found) return found
  }

  for (const nested of Object.values(record)) {
    const found = extractImageUrl(nested)
    if (found) return found
  }

  return undefined
}

export function extensionFromMime(mimeType?: string): string {
  if (!mimeType) return '.jpg'
  const lower = mimeType.toLowerCase()
  if (lower.includes('png')) return '.png'
  if (lower.includes('webp')) return '.webp'
  if (lower.includes('gif')) return '.gif'
  if (lower.includes('svg')) return '.svg'
  if (lower.includes('avif')) return '.avif'
  return '.jpg'
}

export function extensionFromUrl(url: string, mimeType?: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (ext.length > 0 && ext.length <= 5) return ext
  } catch {
    // Ignore parse failures and fallback to mime.
  }
  return extensionFromMime(mimeType)
}

// ---------------------------------------------------------------------------
// Payload-dependent: media
// ---------------------------------------------------------------------------

export async function getOrCreateMediaFromUrl({
  payload,
  imageUrl,
  eventId,
  eventTitle,
  mediaBySourceUrl,
}: {
  payload: BasePayload
  imageUrl: string
  eventId: number
  eventTitle?: string
  mediaBySourceUrl: Map<string, number>
}): Promise<{ id: number; created: boolean } | undefined> {
  const cached = mediaBySourceUrl.get(imageUrl)
  if (cached) return { id: cached, created: false }

  const existingMedia = await payload.find({
    collection: 'media',
    where: { credit: { equals: imageUrl } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existingMedia.docs[0]) {
    mediaBySourceUrl.set(imageUrl, existingMedia.docs[0].id)
    return { id: existingMedia.docs[0].id, created: false }
  }

  let response: Response
  try {
    response = await fetch(imageUrl)
  } catch (error) {
    console.warn(`Unable to fetch image for event ${eventId}: ${imageUrl}`, error)
    return undefined
  }

  if (!response.ok) {
    console.warn(`Image request failed for event ${eventId}: ${imageUrl} (${response.status})`)
    return undefined
  }

  const mimeType = response.headers.get('content-type') ?? 'image/jpeg'
  const arrayBuffer = await response.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)
  if (bytes.length === 0) {
    console.warn(`Empty image payload for event ${eventId}: ${imageUrl}`)
    return undefined
  }

  const extension = extensionFromUrl(imageUrl, mimeType)
  const filename = `wp-event-${eventId}${extension}`

  const createdMedia = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: {
      alt: eventTitle ? `${eventTitle} image` : `Event ${eventId} image`,
      credit: imageUrl,
      tags: ['wordpress-import'],
    },
    file: {
      data: bytes,
      mimetype: mimeType,
      name: filename,
      size: bytes.length,
    },
  })

  mediaBySourceUrl.set(imageUrl, createdMedia.id)
  return { id: createdMedia.id, created: true }
}

// ---------------------------------------------------------------------------
// Upsert functions
// ---------------------------------------------------------------------------

export async function upsertVenue(
  payload: BasePayload,
  venue: WPVenue,
  nowIso: string,
): Promise<number> {
  const externalId = String(venue.id)

  const existing = await payload.find({
    collection: 'venues',
    where: { 'sync.externalId': { equals: externalId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const data = {
    name: cleanText(venue.venue) ?? `Venue ${externalId}`,
    slug: cleanText(venue.slug) ?? `venue-${externalId}`,
    address: {
      street: cleanText(venue.address),
      city: cleanText(venue.city),
      state: cleanText(venue.province ?? venue.stateprovince ?? venue.state),
      zip: cleanText(venue.zip),
      country: cleanText(venue.country) ?? 'Canada',
    },
    coordinates:
      typeof venue.geo_lng === 'number' && typeof venue.geo_lat === 'number'
        ? ([venue.geo_lng, venue.geo_lat] as [number, number])
        : undefined,
    website: cleanText(venue.website),
    phone: cleanText(venue.phone),
    sync: {
      externalId,
      lastSyncedAt: parseWPDate(venue.modified) ?? nowIso,
    },
  }

  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: 'venues',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return updated.id
  }

  const created = await payload.create({
    collection: 'venues',
    data,
    overrideAccess: true,
  })
  return created.id
}

export async function upsertCategory(
  payload: BasePayload,
  category: WPCategory,
  nowIso: string,
): Promise<number> {
  const externalId = String(category.id)

  const existing = await payload.find({
    collection: 'categories',
    where: { 'sync.externalId': { equals: externalId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const data = {
    name: cleanText(category.name) ?? `Category ${externalId}`,
    slug: cleanText(category.slug) ?? `category-${externalId}`,
    description: cleanText(category.description),
    sync: {
      externalId,
      lastSyncedAt: nowIso,
    },
  }

  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: 'categories',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return updated.id
  }

  const created = await payload.create({
    collection: 'categories',
    data,
    overrideAccess: true,
  })
  return created.id
}

export async function upsertEvent(
  payload: BasePayload,
  event: WPEvent,
  opts: {
    venueId?: number
    categoryIds: number[]
    featuredImageId?: number
    nowIso: string
  },
): Promise<{ id: number; action: 'created' | 'updated' }> {
  const externalId = String(event.id)

  const existing = await payload.find({
    collection: 'events',
    where: { 'sync.externalId': { equals: externalId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const startDateTime = parseWPDate(event.start_date)
  if (!startDateTime) {
    throw new Error(`Missing or invalid start_date for event ${externalId}`)
  }

  const data = {
    title: cleanText(event.title) ?? `Event ${externalId}`,
    slug: cleanText(event.slug) ?? `event-${externalId}`,
    isVirtual: Boolean(event.is_virtual),
    virtualUrl: cleanText(event.virtual_url),
    startDateTime,
    endDateTime: parseWPDate(event.end_date),
    isAllDay: Boolean(event.all_day),
    timezone: cleanText(event.timezone) ?? 'America/Halifax',
    venue: opts.venueId,
    website: cleanText(event.website),
    featuredImage: opts.featuredImageId,
    categories: opts.categoryIds,
    status: normalizeStatus(event.status),
    featured: Boolean(event.featured),
    sync: {
      source: 'wordpress' as const,
      externalId,
      lastSyncedAt: parseWPDate(event.modified) ?? opts.nowIso,
    },
  }

  if (existing.docs[0]) {
    const updated = await payload.update({
      collection: 'events',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return { id: updated.id, action: 'updated' }
  }

  const created = await payload.create({
    collection: 'events',
    data,
    overrideAccess: true,
  })
  return { id: created.id, action: 'created' }
}
