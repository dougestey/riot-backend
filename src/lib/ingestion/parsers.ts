import { createHash } from 'node:crypto'

import ical, { type VEvent } from 'node-ical'
import { parse as parseCSVRows } from 'csv-parse/sync'
import { unzipSync } from 'fflate'

import type { IngestionSource, NormalizedEvent } from './types'

export type ParserContext = {
  cityId: number
  timezone: string
  source?: IngestionSource
}

export type ParseResult = {
  events: NormalizedEvent[]
  errors: Array<{ row?: number; message: string }>
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const MAX_IMPORT_EVENTS = 2_000
const MAX_ZIP_ENTRIES = 100

function externalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return undefined
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function icalEvent(
  item: VEvent,
  context: ParserContext,
  startOverride?: Date,
): NormalizedEvent | undefined {
  const start = startOverride || dateValue(item.start)
  const title = textValue(item.summary)
  const uid = textValue(item.uid)
  if (!start || !title || !uid) return undefined

  const originalStart = dateValue(item.start)
  const duration =
    originalStart && dateValue(item.end)
      ? Math.max(0, dateValue(item.end)!.getTime() - originalStart.getTime())
      : undefined
  const end = duration !== undefined ? new Date(start.getTime() + duration) : undefined
  const allDay = item.datetype === 'date'
  const source = context.source || 'ical'
  const recurrenceIdentity = dateValue(item.recurrenceid) || startOverride
  const occurrenceId = recurrenceIdentity ? `${uid}:${recurrenceIdentity.toISOString()}` : uid

  return {
    source,
    externalId: occurrenceId,
    title,
    description: textValue(item.description),
    startDateTime: start.toISOString(),
    endDateTime: end?.toISOString(),
    timezone:
      (typeof item.start === 'object' && item.start && 'tz' in item.start
        ? textValue(item.start.tz)
        : undefined) || context.timezone,
    isAllDay: allDay,
    canonicalUrl: textValue(item.url),
    locationText: textValue(item.location),
    cityId: context.cityId,
    cancelled: item.status === 'CANCELLED',
    sourceUpdatedAt: dateValue(item.lastmodified)?.toISOString(),
  }
}

export function parseICS(input: string, context: ParserContext): ParseResult {
  if (Buffer.byteLength(input) > MAX_IMPORT_BYTES) {
    return { events: [], errors: [{ message: 'ICS file exceeds 10 MB' }] }
  }

  const parsed = ical.sync.parseICS(input)
  const events: NormalizedEvent[] = []
  const errors: ParseResult['errors'] = []
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const windowEnd = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)

  for (const item of Object.values(parsed)) {
    if (!item || item.type !== 'VEVENT') continue
    const calendarEvent = item as VEvent
    const base = icalEvent(calendarEvent, context)
    if (!base) {
      errors.push({ message: 'Skipped VEVENT without UID, title, or start date' })
      continue
    }

    if (calendarEvent.rrule) {
      const remaining = Math.max(0, MAX_IMPORT_EVENTS - events.length)
      const occurrences = ical
        .expandRecurringEvent(calendarEvent, {
          from: windowStart,
          to: windowEnd,
          excludeExdates: true,
          includeOverrides: true,
        })
        .slice(0, Math.min(500, remaining))
      for (const occurrence of occurrences) {
        const normalized = icalEvent(occurrence.event, context, occurrence.start)
        if (normalized) events.push(normalized)
      }
    } else {
      events.push(base)
    }

    if (events.length >= MAX_IMPORT_EVENTS) {
      errors.push({ message: `Import limited to ${MAX_IMPORT_EVENTS} events` })
      break
    }
  }

  return { events, errors }
}

type CSVRecord = Record<string, string | undefined>

function csvDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) return undefined
  return date.toISOString()
}

export function parseCSV(input: string, context: ParserContext): ParseResult {
  if (Buffer.byteLength(input) > MAX_IMPORT_BYTES) {
    return { events: [], errors: [{ message: 'CSV file exceeds 10 MB' }] }
  }

  let rows: CSVRecord[]
  try {
    rows = parseCSVRows(input, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      max_record_size: 256_000,
      to: MAX_IMPORT_EVENTS + 1,
    })
  } catch (error) {
    return {
      events: [],
      errors: [{ message: error instanceof Error ? error.message : 'Invalid CSV' }],
    }
  }

  const events: NormalizedEvent[] = []
  const errors: ParseResult['errors'] = []
  rows.slice(0, MAX_IMPORT_EVENTS).forEach((row, index) => {
    const rowNumber = index + 2
    const title = textValue(row.title || row['event name'])
    const startDateTime = csvDate(row.start || row['start date'])
    if (!title || !startDateTime) {
      errors.push({
        row: rowNumber,
        message: 'Each row requires title and an ISO-8601 start timestamp with an offset',
      })
      return
    }
    const externalId =
      textValue(row.id || row['external id']) ||
      externalHash([title, startDateTime, row.end, row.location])
    events.push({
      source: 'csv',
      externalId,
      title,
      startDateTime,
      endDateTime: csvDate(row.end || row['end date']),
      timezone: textValue(row.timezone) || context.timezone,
      isAllDay: /^(true|yes|1)$/i.test(row['all day'] || ''),
      description: textValue(row.description),
      canonicalUrl: textValue(row.url || row.website),
      locationText: textValue(row.location),
      cityId: context.cityId,
    })
  })

  return { events, errors }
}

function facebookEvent(value: unknown, context: ParserContext): NormalizedEvent | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const title = textValue(record.name || record.title)
  const startTimestamp = record.start_timestamp ?? record.start_time
  const start =
    typeof startTimestamp === 'number' ? new Date(startTimestamp * 1000) : dateValue(startTimestamp)
  if (!title || !start || Number.isNaN(start.getTime())) return undefined

  const endTimestamp = record.end_timestamp ?? record.end_time
  const end =
    typeof endTimestamp === 'number' ? new Date(endTimestamp * 1000) : dateValue(endTimestamp)
  const place =
    record.place && typeof record.place === 'object'
      ? textValue((record.place as Record<string, unknown>).name)
      : textValue(record.place)
  const explicitId = textValue(record.id || record.event_id)

  return {
    source: 'facebook-export',
    externalId: explicitId || externalHash([title, start.toISOString(), place]),
    title,
    description: textValue(record.description),
    startDateTime: start.toISOString(),
    endDateTime: end?.toISOString(),
    timezone: textValue(record.timezone) || context.timezone,
    canonicalUrl: textValue(record.url || record.event_url),
    locationText: place,
    cityId: context.cityId,
  }
}

function collectFacebookArrays(value: unknown, output: unknown[], key = ''): void {
  if (Array.isArray(value)) {
    if (!/declined/i.test(key)) output.push(...value)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    if (/events?|joined|interested|invited/i.test(childKey)) {
      collectFacebookArrays(child, output, childKey)
    }
  }
}

export function parseFacebookJSON(input: string, context: ParserContext): ParseResult {
  if (Buffer.byteLength(input) > MAX_IMPORT_BYTES) {
    return { events: [], errors: [{ message: 'JSON file exceeds 10 MB' }] }
  }
  try {
    const parsed = JSON.parse(input) as unknown
    const candidates: unknown[] = []
    collectFacebookArrays(parsed, candidates)
    const events = candidates
      .map((candidate) => facebookEvent(candidate, context))
      .filter((event): event is NormalizedEvent => Boolean(event))
      .slice(0, MAX_IMPORT_EVENTS)
    return {
      events,
      errors: events.length === 0 ? [{ message: 'No supported Facebook events found' }] : [],
    }
  } catch {
    return { events: [], errors: [{ message: 'Invalid JSON file' }] }
  }
}

export function parseFacebookZIP(input: Uint8Array, context: ParserContext): ParseResult {
  if (input.byteLength > MAX_IMPORT_BYTES) {
    return { events: [], errors: [{ message: 'ZIP file exceeds 10 MB' }] }
  }
  try {
    assertSafeZip(input)
    const files = unzipSync(input, {
      filter: (file) => /\.json$/i.test(file.name) && /event/i.test(file.name),
    })
    const entries = Object.entries(files).slice(0, MAX_ZIP_ENTRIES)
    const aggregate: ParseResult = { events: [], errors: [] }
    let expandedBytes = 0
    for (const [name, bytes] of entries) {
      expandedBytes += bytes.byteLength
      if (expandedBytes > MAX_IMPORT_BYTES) {
        aggregate.errors.push({ message: 'Expanded ZIP content exceeds 10 MB' })
        break
      }
      const parsed = parseFacebookJSON(Buffer.from(bytes).toString('utf8'), context)
      aggregate.events.push(...parsed.events)
      aggregate.errors.push(
        ...parsed.errors.map((error) => ({ ...error, message: `${name}: ${error.message}` })),
      )
      if (aggregate.events.length >= MAX_IMPORT_EVENTS) break
    }
    aggregate.events = aggregate.events.slice(0, MAX_IMPORT_EVENTS)
    return aggregate
  } catch {
    return { events: [], errors: [{ message: 'Invalid or unsupported ZIP file' }] }
  }
}

function assertSafeZip(input: Uint8Array): void {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  let entries = 0
  let totalExpanded = 0
  let foundDirectory = false

  for (let offset = 0; offset <= bytes.length - 46; offset++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue
    foundDirectory = true
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const expandedSize = bytes.readUInt32LE(offset + 24)
    const filenameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const nameStart = offset + 46
    const nameEnd = nameStart + filenameLength
    if (nameEnd > bytes.length) throw new Error('Invalid ZIP directory')
    const name = bytes.subarray(nameStart, nameEnd).toString('utf8')

    if (/\.json$/i.test(name) && /event/i.test(name)) {
      entries++
      totalExpanded += expandedSize
      if (
        entries > MAX_ZIP_ENTRIES ||
        expandedSize > MAX_IMPORT_BYTES ||
        totalExpanded > MAX_IMPORT_BYTES ||
        (compressedSize > 0 && expandedSize / compressedSize > 100)
      ) {
        throw new Error('ZIP expansion limits exceeded')
      }
    }
    offset = nameEnd + extraLength + commentLength - 1
  }
  if (!foundDirectory) throw new Error('ZIP central directory is missing')
}
