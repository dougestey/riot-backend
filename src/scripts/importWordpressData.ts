import 'dotenv/config'

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

import config from '../payload.config'
import {
  type WPCategory,
  type WPEvent,
  type WPVenue,
  cleanText,
  extractImageUrl,
  getOrCreateMediaFromUrl,
  upsertCategory,
  upsertEvent,
  upsertVenue,
} from '../lib/wordpress'

type EventsFile = { events: WPEvent[] }
type VenuesFile = { venues: WPVenue[] }
type CategoriesFile = { categories: WPCategory[] }
type ImportDataFile = Partial<EventsFile & VenuesFile & CategoriesFile>

async function readJsonFile<T>(url: URL): Promise<T> {
  const raw = await readFile(fileURLToPath(url), 'utf8')
  return JSON.parse(raw) as T
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
    const existingVenues = await payload.find({
      collection: 'venues',
      where: { 'sync.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
    })
    const wasExisting = existingVenues.docs.length > 0

    const venueId = await upsertVenue(payload, venue, nowIso)
    venueByExternalId.set(externalId, venueId)

    if (wasExisting) {
      updatedVenues += 1
    } else {
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
    const existingCategories = await payload.find({
      collection: 'categories',
      where: { 'sync.externalId': { equals: externalId } },
      limit: 1,
      depth: 0,
    })
    const wasExisting = existingCategories.docs.length > 0

    const categoryId = await upsertCategory(payload, category, nowIso)
    categoryByExternalId.set(externalId, categoryId)

    if (wasExisting) {
      updatedCategories += 1
    } else {
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
    const venueId = event.venue?.id ? venueByExternalId.get(String(event.venue.id)) : undefined
    const categoryIds = (event.categories ?? [])
      .map((category) => categoryByExternalId.get(String(category.id)))
      .filter((id): id is number => typeof id === 'number')

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
    const featuredImageId = mediaResult?.id

    if (mediaResult?.created) {
      createdMedia += 1
    } else if (mediaResult?.id) {
      reusedMedia += 1
    }

    let result: { action: 'created' | 'updated' }
    try {
      result = await upsertEvent(payload, event, {
        venueId,
        categoryIds,
        featuredImageId,
        nowIso,
      })
    } catch (error) {
      console.warn(`Skipping event ${externalId}: ${error}`)
      continue
    }

    if (result.action === 'updated') {
      updatedEvents += 1
    } else {
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
