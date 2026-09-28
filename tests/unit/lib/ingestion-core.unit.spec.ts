import { describe, expect, it } from 'vitest'

import {
  eventFingerprint,
  makeSourceKey,
  normalizeTitle,
  stableHash,
  textToLexical,
  validateNormalizedEvent,
} from '@/lib/ingestion/core'
import type { NormalizedEvent } from '@/lib/ingestion/types'

const event: NormalizedEvent = {
  source: 'ical',
  externalId: 'uid-1',
  title: 'Live Music at The Hall',
  startDateTime: '2026-10-01T22:00:00.000Z',
  cityId: 4,
  venueId: 12,
}

describe('ingestion normalization', () => {
  it('creates namespaced source keys', () => {
    expect(makeSourceKey('google-calendar', ' abc ', 7)).toBe('google-calendar:7:abc')
    expect(makeSourceKey('ical', 'uid-1', 7, 'upload-user-a')).not.toBe(
      makeSourceKey('ical', 'uid-1', 7, 'upload-user-b'),
    )
  })

  it('normalizes titles for duplicate matching', () => {
    expect(normalizeTitle('  Café—LIVE! ')).toBe('cafe live')
  })

  it('creates stable fingerprints independent of optional payload fields', () => {
    expect(eventFingerprint({ ...event, description: 'one' })).toBe(
      eventFingerprint({ ...event, description: 'two' }),
    )
    expect(stableHash({ b: 2 })).toHaveLength(64)
  })

  it('validates required values and date ordering', () => {
    expect(validateNormalizedEvent(event)).toEqual([])
    expect(
      validateNormalizedEvent({
        ...event,
        title: '',
        endDateTime: '2026-09-01T22:00:00.000Z',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title' }),
        expect.objectContaining({ field: 'endDateTime' }),
      ]),
    )
  })

  it('converts plain text to a Lexical document', () => {
    const document = textToLexical('First paragraph\n\nSecond paragraph')
    expect(document?.root.children).toHaveLength(2)
  })
})
