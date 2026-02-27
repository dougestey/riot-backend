import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route module
// ---------------------------------------------------------------------------

const mockUpsertVenue = vi.fn()
const mockUpsertCategory = vi.fn()
const mockUpsertEvent = vi.fn()
const mockGetOrCreateMediaFromUrl = vi.fn()

vi.mock('@/lib/wordpress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wordpress')>()
  return {
    ...actual,
    upsertVenue: (...args: unknown[]) => mockUpsertVenue(...args),
    upsertCategory: (...args: unknown[]) => mockUpsertCategory(...args),
    upsertEvent: (...args: unknown[]) => mockUpsertEvent(...args),
    getOrCreateMediaFromUrl: (...args: unknown[]) => mockGetOrCreateMediaFromUrl(...args),
  }
})

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({}),
}))

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

import { POST } from '@/app/api/webhooks/wordpress/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'test-webhook-secret-123'

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/webhooks/wordpress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function validEvent() {
  return {
    event: {
      id: 123,
      title: 'Jazz Night',
      slug: 'jazz-night',
      status: 'publish',
      start_date: '2026-03-15 19:00:00',
      end_date: '2026-03-15 22:00:00',
      timezone: 'America/Halifax',
      venue: {
        id: 42,
        venue: 'The Carleton',
        slug: 'the-carleton',
      },
      categories: [{ id: 5, name: 'Music', slug: 'music' }],
      image: { url: 'https://example.com/image.jpg' },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/wordpress', () => {
  beforeEach(() => {
    process.env.WORDPRESS_WEBHOOK_SECRET = SECRET
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.WORDPRESS_WEBHOOK_SECRET
  })

  // -- Auth ---------------------------------------------------------------

  describe('authentication', () => {
    it('returns 401 when X-Webhook-Secret header is missing', async () => {
      const res = await POST(makeRequest(validEvent()))

      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 401 when secret is wrong', async () => {
      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': 'wrong-secret' }))

      expect(res.status).toBe(401)
    })

    it('returns 401 when env var is not set', async () => {
      delete process.env.WORDPRESS_WEBHOOK_SECRET

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(401)
    })
  })

  // -- Validation ---------------------------------------------------------

  describe('validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new Request('http://localhost:3000/api/webhooks/wordpress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': SECRET,
        },
        body: 'not json {{{',
      })

      const res = await POST(req)

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid JSON')
    })

    it('returns 400 when event.id is missing', async () => {
      const body = { event: { start_date: '2026-03-15 19:00:00' } }
      const res = await POST(makeRequest(body, { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/missing required fields/i)
    })

    it('returns 400 when event.start_date is missing', async () => {
      const body = { event: { id: 123 } }
      const res = await POST(makeRequest(body, { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(400)
    })

    it('returns 400 when event is missing entirely', async () => {
      const res = await POST(makeRequest({}, { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(400)
    })
  })

  // -- Success path -------------------------------------------------------

  describe('successful processing', () => {
    it('returns 200 with full event data', async () => {
      mockUpsertVenue.mockResolvedValue(42)
      mockUpsertCategory.mockResolvedValue(5)
      mockGetOrCreateMediaFromUrl.mockResolvedValue({ id: 10, created: true })
      mockUpsertEvent.mockResolvedValue({ id: 300, action: 'created' })

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.venue).toEqual({ id: 42 })
      expect(json.categories).toEqual([{ wpId: 5, id: 5 }])
      expect(json.media).toEqual({ id: 10, created: true })
      expect(json.event).toEqual({ id: 300, action: 'created' })
    })

    it('calls upsertVenue, upsertCategory, and upsertEvent', async () => {
      mockUpsertVenue.mockResolvedValue(42)
      mockUpsertCategory.mockResolvedValue(5)
      mockUpsertEvent.mockResolvedValue({ id: 1, action: 'created' })

      await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(mockUpsertVenue).toHaveBeenCalledOnce()
      expect(mockUpsertCategory).toHaveBeenCalledOnce()
      expect(mockUpsertEvent).toHaveBeenCalledOnce()
    })

    it('processes event without venue or categories', async () => {
      mockUpsertEvent.mockResolvedValue({ id: 1, action: 'created' })

      const body = {
        event: {
          id: 123,
          title: 'Simple Event',
          start_date: '2026-03-15 19:00:00',
        },
      }
      const res = await POST(makeRequest(body, { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(mockUpsertVenue).not.toHaveBeenCalled()
      expect(mockUpsertCategory).not.toHaveBeenCalled()
    })
  })

  // -- Partial failures ---------------------------------------------------

  describe('partial failure tolerance', () => {
    it('still saves event when venue upsert fails', async () => {
      mockUpsertVenue.mockRejectedValue(new Error('DB timeout'))
      mockUpsertCategory.mockResolvedValue(5)
      mockUpsertEvent.mockResolvedValue({ id: 300, action: 'created' })

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.venue.error).toBe('DB timeout')
      expect(json.event).toEqual({ id: 300, action: 'created' })
    })

    it('still saves event when category upsert fails', async () => {
      mockUpsertVenue.mockResolvedValue(42)
      mockUpsertCategory.mockRejectedValue(new Error('Category error'))
      mockUpsertEvent.mockResolvedValue({ id: 300, action: 'created' })

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.categories[0].error).toBe('Category error')
    })

    it('still saves event when media fetch fails', async () => {
      mockUpsertVenue.mockResolvedValue(42)
      mockUpsertCategory.mockResolvedValue(5)
      mockGetOrCreateMediaFromUrl.mockRejectedValue(new Error('Fetch error'))
      mockUpsertEvent.mockResolvedValue({ id: 300, action: 'created' })

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.media.error).toBe('Fetch error')
    })
  })

  // -- Event upsert failure -----------------------------------------------

  describe('event upsert failure', () => {
    it('returns 422 when event upsert throws', async () => {
      mockUpsertVenue.mockResolvedValue(42)
      mockUpsertCategory.mockResolvedValue(5)
      mockUpsertEvent.mockRejectedValue(new Error('Event save failed'))

      const res = await POST(makeRequest(validEvent(), { 'X-Webhook-Secret': SECRET }))

      expect(res.status).toBe(422)
      const json = await res.json()
      expect(json.error).toMatch(/event upsert failed/i)
      expect(json.details).toBeDefined()
    })
  })
})
