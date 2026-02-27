import { describe, it, expect } from 'vitest'

import {
  decodeEntities,
  cleanText,
  parseWPDate,
  normalizeStatus,
  extractImageUrl,
  extensionFromUrl,
  extensionFromMime,
  NAMED_ENTITIES,
} from '@/lib/wordpress'

// ---------------------------------------------------------------------------
// decodeEntities
// ---------------------------------------------------------------------------

describe('decodeEntities', () => {
  it('decodes all named entities', () => {
    for (const [entity, expected] of Object.entries(NAMED_ENTITIES)) {
      expect(decodeEntities(entity)).toBe(expected)
    }
  })

  it('decodes numeric character references', () => {
    expect(decodeEntities('&#169;')).toBe('©')
    expect(decodeEntities('&#8212;')).toBe('—')
  })

  it('decodes hex character references', () => {
    expect(decodeEntities('&#xA9;')).toBe('©')
    expect(decodeEntities('&#x2014;')).toBe('—')
  })

  it('handles mixed entities in one string', () => {
    expect(decodeEntities('Tom &amp; Jerry &#8212; &#x26; friends')).toBe('Tom & Jerry — & friends')
  })

  it('returns plain strings unchanged', () => {
    expect(decodeEntities('Hello world')).toBe('Hello world')
  })
})

// ---------------------------------------------------------------------------
// cleanText
// ---------------------------------------------------------------------------

describe('cleanText', () => {
  it('returns undefined for null/undefined/empty', () => {
    expect(cleanText(null)).toBeUndefined()
    expect(cleanText(undefined)).toBeUndefined()
    expect(cleanText('')).toBeUndefined()
  })

  it('returns undefined for whitespace-only strings', () => {
    expect(cleanText('   ')).toBeUndefined()
    expect(cleanText('\t\n')).toBeUndefined()
  })

  it('trims whitespace', () => {
    expect(cleanText('  hello  ')).toBe('hello')
  })

  it('decodes entities and trims', () => {
    expect(cleanText(' Rock &amp; Roll ')).toBe('Rock & Roll')
  })
})

// ---------------------------------------------------------------------------
// parseWPDate
// ---------------------------------------------------------------------------

describe('parseWPDate', () => {
  it('parses WP-format dates (space separator)', () => {
    const result = parseWPDate('2026-03-15 19:00:00')
    expect(result).toBeDefined()
    expect(new Date(result!).getFullYear()).toBe(2026)
  })

  it('parses ISO-format dates', () => {
    const result = parseWPDate('2026-03-15T19:00:00')
    expect(result).toBeDefined()
  })

  it('returns undefined for null/undefined', () => {
    expect(parseWPDate(null)).toBeUndefined()
    expect(parseWPDate(undefined)).toBeUndefined()
  })

  it('returns undefined for 0000-00-00 dates', () => {
    expect(parseWPDate('0000-00-00 00:00:00')).toBeUndefined()
  })

  it('returns undefined for invalid date strings', () => {
    expect(parseWPDate('not-a-date')).toBeUndefined()
  })

  it('returns an ISO string', () => {
    const result = parseWPDate('2026-03-15 19:00:00')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------

describe('normalizeStatus', () => {
  it('maps "publish" to "published"', () => {
    expect(normalizeStatus('publish')).toBe('published')
  })

  it('passes through "cancelled"', () => {
    expect(normalizeStatus('cancelled')).toBe('cancelled')
  })

  it('passes through "postponed"', () => {
    expect(normalizeStatus('postponed')).toBe('postponed')
  })

  it('defaults to "draft" for unknown values', () => {
    expect(normalizeStatus('pending')).toBe('draft')
    expect(normalizeStatus('trash')).toBe('draft')
    expect(normalizeStatus(undefined)).toBe('draft')
  })
})

// ---------------------------------------------------------------------------
// extractImageUrl
// ---------------------------------------------------------------------------

describe('extractImageUrl', () => {
  it('returns undefined for falsy values', () => {
    expect(extractImageUrl(null)).toBeUndefined()
    expect(extractImageUrl(undefined)).toBeUndefined()
    expect(extractImageUrl('')).toBeUndefined()
    expect(extractImageUrl(0)).toBeUndefined()
  })

  it('returns a plain string URL', () => {
    expect(extractImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg')
  })

  it('extracts from an object with url key', () => {
    expect(extractImageUrl({ url: 'https://example.com/img.png' })).toBe(
      'https://example.com/img.png',
    )
  })

  it('extracts from nested image object', () => {
    expect(
      extractImageUrl({
        sizes: { full: { source_url: 'https://example.com/full.jpg' } },
      }),
    ).toBe('https://example.com/full.jpg')
  })

  it('extracts first URL from an array', () => {
    expect(extractImageUrl([null, { url: 'https://example.com/first.jpg' }])).toBe(
      'https://example.com/first.jpg',
    )
  })

  it('returns undefined for non-string primitives', () => {
    expect(extractImageUrl(42)).toBeUndefined()
    expect(extractImageUrl(true)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extensionFromMime
// ---------------------------------------------------------------------------

describe('extensionFromMime', () => {
  it('returns .jpg for undefined', () => {
    expect(extensionFromMime(undefined)).toBe('.jpg')
  })

  it('maps known mime types', () => {
    expect(extensionFromMime('image/png')).toBe('.png')
    expect(extensionFromMime('image/webp')).toBe('.webp')
    expect(extensionFromMime('image/gif')).toBe('.gif')
    expect(extensionFromMime('image/svg+xml')).toBe('.svg')
    expect(extensionFromMime('image/avif')).toBe('.avif')
  })

  it('defaults to .jpg for unknown mime', () => {
    expect(extensionFromMime('image/jpeg')).toBe('.jpg')
    expect(extensionFromMime('application/octet-stream')).toBe('.jpg')
  })
})

// ---------------------------------------------------------------------------
// extensionFromUrl
// ---------------------------------------------------------------------------

describe('extensionFromUrl', () => {
  it('extracts extension from URL path', () => {
    expect(extensionFromUrl('https://example.com/photo.png')).toBe('.png')
    expect(extensionFromUrl('https://example.com/photo.webp')).toBe('.webp')
  })

  it('falls back to mime type when URL has no extension', () => {
    expect(extensionFromUrl('https://example.com/photo', 'image/png')).toBe('.png')
  })

  it('falls back to .jpg when neither URL nor mime provides extension', () => {
    expect(extensionFromUrl('https://example.com/photo')).toBe('.jpg')
  })

  it('handles URLs with query strings', () => {
    expect(extensionFromUrl('https://example.com/photo.png?w=300')).toBe('.png')
  })

  it('falls back gracefully on malformed URLs', () => {
    expect(extensionFromUrl('not a url at all')).toBe('.jpg')
  })
})
