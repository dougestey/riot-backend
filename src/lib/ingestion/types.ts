export const INGESTION_SOURCES = [
  'facebook',
  'google-calendar',
  'ical',
  'facebook-export',
  'csv',
  'instagram',
  'wordpress',
] as const

export type IngestionSource = (typeof INGESTION_SOURCES)[number]

export type NormalizedEvent = {
  externalId: string
  source: IngestionSource
  title: string
  startDateTime: string
  cityId: number
  endDateTime?: string
  timezone?: string
  isAllDay?: boolean
  description?: string
  canonicalUrl?: string
  locationText?: string
  venueId?: number
  featuredImageId?: number
  sourceUpdatedAt?: string
  cancelled?: boolean
  confidence?: number
  model?: string
  extractionEvidence?: Record<string, unknown>
}

export type NormalizationError = {
  field?: string
  message: string
}

export type IngestionInput = {
  event: NormalizedEvent
  sourcePayload?: Record<string, unknown>
  submittedBy?: number
  connection?: number
  scope?: string
}
