import 'dotenv/config'

import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

import config from '../payload.config'

type WPVenue = {
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

type WPCategory = {
  id: number
  name?: string
  slug?: string
  description?: string
  parent?: number
}

type WPEvent = {
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

type EventsFile = { events: WPEvent[] }
type VenuesFile = { venues: WPVenue[] }
type CategoriesFile = { categories: WPCategory[] }
type ImportDataFile = Partial<EventsFile & VenuesFile & CategoriesFile>

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
}

function decodeEntities(input: string): string {
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

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined
  const normalized = decodeEntities(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function parseWPDate(value?: string | null): string | undefined {
  if (!value || value.startsWith('0000-00-00')) return undefined
  const iso = value.replace(' ', 'T')
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function normalizeStatus(value?: string): 'draft' | 'published' | 'cancelled' | 'postponed' {
  if (value === 'publish') return 'published'
  if (value === 'cancelled') return 'cancelled'
  if (value === 'postponed') return 'postponed'
  return 'draft'
}

async function readJsonFile<T>(url: URL): Promise<T> {
  const raw = await readFile(fileURLToPath(url), 'utf8')
  return JSON.parse(raw) as T
}

function extractImageUrl(value: unknown): string | undefined {
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

function extensionFromMime(mimeType?: string): string {
  if (!mimeType) return '.jpg'
  const lower = mimeType.toLowerCase()
  if (lower.includes('png')) return '.png'
  if (lower.includes('webp')) return '.webp'
  if (lower.includes('gif')) return '.gif'
  if (lower.includes('svg')) return '.svg'
  if (lower.includes('avif')) return '.avif'
  return '.jpg'
}

function extensionFromUrl(url: string, mimeType?: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    if (ext.length > 0 && ext.length <= 5) return ext
  } catch {
    // Ignore parse failures and fallback to mime.
  }
  return extensionFromMime(mimeType)
}

async function getOrCreateMediaFromUrl({
  payload,
  imageUrl,
  eventId,
  eventTitle,
  mediaBySourceUrl,
}: {
  payload: Awaited<ReturnType<typeof getPayload>>
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

async function loadImportData(importsDirUrl: URL): Promise<{
  events: WPEvent[]
  venues: WPVenue[]
  categories: WPCategory[]
  files: string[]
}> {
  const importsDirPath = fileURLToPath(importsDirUrl)
  if (!existsSync(importsDirPath)) {
    throw new Error(`Imports directory not found: ${importsDirPath}`)
  }

  const entries = await readdir(importsDirPath, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  if (files.length === 0) {
    throw new Error(`No JSON files found in imports directory: ${importsDirPath}`)
  }

  const events: WPEvent[] = []
  const venues: WPVenue[] = []
  const categories: WPCategory[] = []

  for (const fileName of files) {
    const fileUrl = new URL(fileName, importsDirUrl)
    const parsed = await readJsonFile<ImportDataFile>(fileUrl)

    if (Array.isArray(parsed.events)) events.push(...parsed.events)
    if (Array.isArray(parsed.venues)) venues.push(...parsed.venues)
    if (Array.isArray(parsed.categories)) categories.push(...parsed.categories)
  }

  return { events, venues, categories, files }
}

async function runImport() {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const nowIso = new Date().toISOString()

  const importsDirUrl = new URL('../../imports/', import.meta.url)
  const importData = await loadImportData(importsDirUrl)
  const mediaBySourceUrl = new Map<string, number>()

  const venueByExternalId = new Map<string, number>()
  const categoryByExternalId = new Map<string, number>()

  // Merge dedicated venues export + embedded event venues.
  const allVenues = new Map<number, WPVenue>()
  for (const venue of importData.venues ?? []) {
    allVenues.set(venue.id, venue)
  }
  for (const event of importData.events ?? []) {
    if (event.venue?.id) allVenues.set(event.venue.id, event.venue)
  }

  let createdVenues = 0
  let updatedVenues = 0
  for (const venue of allVenues.values()) {
    const externalId = String(venue.id)
    const existing = await payload.find({
      collection: 'venues',
      where: { 'sync.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
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
      })
      venueByExternalId.set(externalId, updated.id)
      updatedVenues += 1
    } else {
      const created = await payload.create({
        collection: 'venues',
        data,
      })
      venueByExternalId.set(externalId, created.id)
      createdVenues += 1
    }
  }

  const categoriesByExternalId = new Map<string, WPCategory>()
  for (const category of importData.categories ?? []) {
    categoriesByExternalId.set(String(category.id), category)
  }
  for (const event of importData.events ?? []) {
    for (const category of event.categories ?? []) {
      categoriesByExternalId.set(String(category.id), category)
    }
  }

  let createdCategories = 0
  let updatedCategories = 0
  for (const [externalId, category] of categoriesByExternalId.entries()) {
    const existing = await payload.find({
      collection: 'categories',
      where: { 'sync.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
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
      })
      categoryByExternalId.set(externalId, updated.id)
      updatedCategories += 1
    } else {
      const created = await payload.create({
        collection: 'categories',
        data,
      })
      categoryByExternalId.set(externalId, created.id)
      createdCategories += 1
    }
  }

  // Second pass for category parent relations.
  for (const [externalId, category] of categoriesByExternalId.entries()) {
    const currentId = categoryByExternalId.get(externalId)
    const parentExternalId = category.parent ? String(category.parent) : undefined
    const parentId = parentExternalId ? categoryByExternalId.get(parentExternalId) : undefined
    if (!currentId) continue

    await payload.update({
      collection: 'categories',
      id: currentId,
      data: { parent: parentId ?? null },
    })
  }

  let createdEvents = 0
  let updatedEvents = 0
  let reusedMedia = 0
  let createdMedia = 0
  for (const event of importData.events ?? []) {
    const externalId = String(event.id)
    const existing = await payload.find({
      collection: 'events',
      where: { 'sync.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
    })

    const venueId = event.venue?.id ? venueByExternalId.get(String(event.venue.id)) : undefined
    const categoryIds = (event.categories ?? [])
      .map((category) => categoryByExternalId.get(String(category.id)))
      .filter((id): id is number => typeof id === 'number')

    const startDateTime = parseWPDate(event.start_date)
    if (!startDateTime) {
      console.warn(`Skipping event ${externalId}: missing or invalid start_date`)
      continue
    }

    const sourceImageUrl = extractImageUrl(event.imageUrl) ?? extractImageUrl(event.image)
    const mediaResult = sourceImageUrl
      ? await getOrCreateMediaFromUrl({
          payload,
          imageUrl: sourceImageUrl,
          eventId: event.id,
          eventTitle: cleanText(event.title),
          mediaBySourceUrl,
        })
      : undefined
    const featuredImage = mediaResult?.id

    if (mediaResult?.created) {
      createdMedia += 1
    } else if (mediaResult?.id) {
      reusedMedia += 1
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
      venue: venueId,
      website: cleanText(event.website),
      featuredImage,
      categories: categoryIds,
      status: normalizeStatus(event.status),
      featured: Boolean(event.featured),
      sync: {
        source: 'wordpress' as const,
        externalId,
        lastSyncedAt: parseWPDate(event.modified) ?? nowIso,
      },
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'events',
        id: existing.docs[0].id,
        data,
      })
      updatedEvents += 1
    } else {
      await payload.create({
        collection: 'events',
        data,
      })
      createdEvents += 1
    }
  }

  console.log('Import complete:')
  console.log(`- Files loaded: ${importData.files.join(', ')}`)
  console.log(`- Venues: ${createdVenues} created, ${updatedVenues} updated`)
  console.log(`- Categories: ${createdCategories} created, ${updatedCategories} updated`)
  console.log(`- Events: ${createdEvents} created, ${updatedEvents} updated`)
  console.log(`- Media: ${createdMedia} created, ${reusedMedia} reused`)
}

runImport()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import failed:', error)
    process.exit(1)
  })
