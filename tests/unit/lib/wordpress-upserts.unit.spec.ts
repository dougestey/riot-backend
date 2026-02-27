import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BasePayload } from 'payload'

import {
  type WPVenue,
  type WPCategory,
  type WPEvent,
  upsertVenue,
  upsertCategory,
  upsertEvent,
  getOrCreateMediaFromUrl,
} from '@/lib/wordpress'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockPayload() {
  return {
    find: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as BasePayload & {
    find: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

const NOW = '2026-03-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// upsertVenue
// ---------------------------------------------------------------------------

describe('upsertVenue', () => {
  let payload: ReturnType<typeof mockPayload>

  const venue: WPVenue = {
    id: 42,
    venue: 'The Carleton',
    slug: 'the-carleton',
    address: '1685 Argyle St',
    city: 'Halifax',
    province: 'Nova Scotia',
    country: 'Canada',
    geo_lat: 44.6454,
    geo_lng: -63.5737,
  }

  beforeEach(() => {
    payload = mockPayload()
  })

  it('creates a new venue when none exists', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 100 })

    const id = await upsertVenue(payload, venue, NOW)

    expect(id).toBe(100)
    expect(payload.create).toHaveBeenCalledOnce()
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'venues',
        overrideAccess: true,
      }),
    )
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('updates an existing venue', async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 50 }] })
    payload.update.mockResolvedValue({ id: 50 })

    const id = await upsertVenue(payload, venue, NOW)

    expect(id).toBe(50)
    expect(payload.update).toHaveBeenCalledOnce()
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'venues',
        id: 50,
        overrideAccess: true,
      }),
    )
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('uses externalId from venue.id', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 1 })

    await upsertVenue(payload, venue, NOW)

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { 'sync.externalId': { equals: '42' } },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// upsertCategory
// ---------------------------------------------------------------------------

describe('upsertCategory', () => {
  let payload: ReturnType<typeof mockPayload>

  const category: WPCategory = {
    id: 5,
    name: 'Music',
    slug: 'music',
  }

  beforeEach(() => {
    payload = mockPayload()
  })

  it('creates a new category when none exists', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 200 })

    const id = await upsertCategory(payload, category, NOW)

    expect(id).toBe(200)
    expect(payload.create).toHaveBeenCalledOnce()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('updates an existing category', async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 10 }] })
    payload.update.mockResolvedValue({ id: 10 })

    const id = await upsertCategory(payload, category, NOW)

    expect(id).toBe(10)
    expect(payload.update).toHaveBeenCalledOnce()
    expect(payload.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// upsertEvent
// ---------------------------------------------------------------------------

describe('upsertEvent', () => {
  let payload: ReturnType<typeof mockPayload>

  const event: WPEvent = {
    id: 123,
    title: 'Jazz Night',
    slug: 'jazz-night',
    status: 'publish',
    start_date: '2026-03-15 19:00:00',
    end_date: '2026-03-15 22:00:00',
    timezone: 'America/Halifax',
  }

  const opts = {
    venueId: 42,
    categoryIds: [5, 6],
    featuredImageId: 10,
    nowIso: NOW,
  }

  beforeEach(() => {
    payload = mockPayload()
  })

  it('creates a new event when none exists', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 300 })

    const result = await upsertEvent(payload, event, opts)

    expect(result).toEqual({ id: 300, action: 'created' })
    expect(payload.create).toHaveBeenCalledOnce()
  })

  it('updates an existing event', async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 55 }] })
    payload.update.mockResolvedValue({ id: 55 })

    const result = await upsertEvent(payload, event, opts)

    expect(result).toEqual({ id: 55, action: 'updated' })
    expect(payload.update).toHaveBeenCalledOnce()
  })

  it('throws when start_date is missing', async () => {
    const badEvent: WPEvent = { ...event, start_date: undefined }

    await expect(upsertEvent(payload, badEvent, opts)).rejects.toThrow(
      /missing or invalid start_date/i,
    )
  })

  it('throws when start_date is invalid', async () => {
    const badEvent: WPEvent = { ...event, start_date: '0000-00-00 00:00:00' }

    await expect(upsertEvent(payload, badEvent, opts)).rejects.toThrow(
      /missing or invalid start_date/i,
    )
  })

  it('sets status to "published" for WP "publish"', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 1 })

    await upsertEvent(payload, event, opts)

    const createCall = payload.create.mock.calls[0][0]
    expect(createCall.data.status).toBe('published')
  })

  it('sets sync.source to "wordpress"', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 1 })

    await upsertEvent(payload, event, opts)

    const createCall = payload.create.mock.calls[0][0]
    expect(createCall.data.sync.source).toBe('wordpress')
    expect(createCall.data.sync.externalId).toBe('123')
  })
})

// ---------------------------------------------------------------------------
// getOrCreateMediaFromUrl
// ---------------------------------------------------------------------------

describe('getOrCreateMediaFromUrl', () => {
  let payload: ReturnType<typeof mockPayload>
  let mediaBySourceUrl: Map<string, number>

  const imageUrl = 'https://example.com/image.jpg'

  beforeEach(() => {
    payload = mockPayload()
    mediaBySourceUrl = new Map()
  })

  it('returns cached result from in-memory map', async () => {
    mediaBySourceUrl.set(imageUrl, 99)

    const result = await getOrCreateMediaFromUrl({
      payload,
      imageUrl,
      eventId: 1,
      mediaBySourceUrl,
    })

    expect(result).toEqual({ id: 99, created: false })
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('returns existing media from database lookup', async () => {
    payload.find.mockResolvedValue({ docs: [{ id: 88 }] })

    const result = await getOrCreateMediaFromUrl({
      payload,
      imageUrl,
      eventId: 1,
      mediaBySourceUrl,
    })

    expect(result).toEqual({ id: 88, created: false })
    expect(mediaBySourceUrl.get(imageUrl)).toBe(88)
  })

  it('fetches and creates new media when not cached or in DB', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    payload.create.mockResolvedValue({ id: 77 })

    const mockResponse = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const result = await getOrCreateMediaFromUrl({
      payload,
      imageUrl,
      eventId: 1,
      eventTitle: 'Test Event',
      mediaBySourceUrl,
    })

    expect(result).toEqual({ id: 77, created: true })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
        overrideAccess: true,
      }),
    )
    expect(mediaBySourceUrl.get(imageUrl)).toBe(77)

    vi.unstubAllGlobals()
  })

  it('returns undefined when fetch fails', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await getOrCreateMediaFromUrl({
      payload,
      imageUrl,
      eventId: 1,
      mediaBySourceUrl,
    })

    expect(result).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('returns undefined when fetch returns non-OK status', async () => {
    payload.find.mockResolvedValue({ docs: [] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    const result = await getOrCreateMediaFromUrl({
      payload,
      imageUrl,
      eventId: 1,
      mediaBySourceUrl,
    })

    expect(result).toBeUndefined()

    vi.unstubAllGlobals()
  })
})
