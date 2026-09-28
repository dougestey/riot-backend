import { describe, expect, it } from 'vitest'

import { parseCSV, parseFacebookJSON, parseICS } from '@/lib/ingestion/parsers'

const context = { cityId: 7, timezone: 'America/Halifax' }

describe('event import parsers', () => {
  it('parses an iCalendar event', () => {
    const result = parseICS(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:facebook-123',
        'DTSTART:20261010T220000Z',
        'DTEND:20261011T010000Z',
        'SUMMARY:Live Show',
        'LOCATION:The Hall',
        'URL:https://facebook.com/events/123',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
      context,
    )
    expect(result.errors).toEqual([])
    expect(result.events[0]).toMatchObject({
      externalId: 'facebook-123',
      title: 'Live Show',
      cityId: 7,
      locationText: 'The Hall',
    })
  })

  it('honors recurrence exclusions', () => {
    const result = parseICS(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:series-1',
        'DTSTART:20261010T220000Z',
        'DTEND:20261010T230000Z',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE:20261011T220000Z',
        'SUMMARY:Three Night Show',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
      context,
    )
    expect(result.events.map((event) => event.startDateTime)).toEqual([
      '2026-10-10T22:00:00.000Z',
      '2026-10-12T22:00:00.000Z',
    ])
  })

  it('keeps the original occurrence identity when an override moves it', () => {
    const result = parseICS(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:moved-series',
        'DTSTART:20261010T220000Z',
        'DTEND:20261010T230000Z',
        'RRULE:FREQ=DAILY;COUNT=2',
        'SUMMARY:Series',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:moved-series',
        'RECURRENCE-ID:20261011T220000Z',
        'DTSTART:20261012T230000Z',
        'DTEND:20261013T000000Z',
        'SUMMARY:Moved Series',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
      context,
    )
    expect(result.events.find((event) => event.title === 'Moved Series')).toMatchObject({
      externalId: 'moved-series:2026-10-11T22:00:00.000Z',
      startDateTime: '2026-10-12T23:00:00.000Z',
    })
  })

  it('requires offset-aware CSV timestamps', () => {
    const result = parseCSV(
      'title,start,end,location\nShow,2026-10-10T19:00:00-03:00,2026-10-10T22:00:00-03:00,Hall',
      context,
    )
    expect(result.errors).toEqual([])
    expect(result.events[0].source).toBe('csv')

    const invalid = parseCSV('title,start\nShow,2026-10-10 19:00', context)
    expect(invalid.events).toEqual([])
    expect(invalid.errors[0].row).toBe(2)
  })

  it('parses supported Facebook export structures and skips declined events', () => {
    const result = parseFacebookJSON(
      JSON.stringify({
        event_responses: {
          events_joined: [{ name: 'Joined Show', start_timestamp: 1791673200 }],
          events_declined: [{ name: 'Declined Show', start_timestamp: 1791673200 }],
        },
      }),
      context,
    )
    expect(result.events).toHaveLength(1)
    expect(result.events[0].title).toBe('Joined Show')
  })
})
