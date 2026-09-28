import {
  parseCSV,
  parseFacebookJSON,
  parseFacebookZIP,
  parseICS,
  type ParseResult,
} from './parsers'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function parseEventUpload(
  file: File,
  context: { cityId: number; timezone: string },
): Promise<ParseResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { events: [], errors: [{ message: 'Upload exceeds 10 MB' }] }
  }
  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (name.endsWith('.zip')) return parseFacebookZIP(bytes, context)
  const text = Buffer.from(bytes).toString('utf8')
  if (name.endsWith('.ics') || file.type === 'text/calendar') return parseICS(text, context)
  if (name.endsWith('.csv') || file.type === 'text/csv') return parseCSV(text, context)
  if (name.endsWith('.json') || file.type === 'application/json') {
    return parseFacebookJSON(text, context)
  }
  return { events: [], errors: [{ message: 'Supported formats are ICS, JSON, ZIP, and CSV' }] }
}
