import { requireUser, userCanAccessCity } from '@/lib/auth'
import {
  cancelIngestedEvent,
  ingestNormalizedEvent,
  makeSourceKey,
  stableHash,
} from '@/lib/ingestion/core'
import { parseEventUpload } from '@/lib/ingestion/uploads'

export async function POST(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const form = await request.formData()
    const file = form.get('file')
    const cityId = Number(form.get('cityId'))
    if (!(file instanceof File) || !Number.isInteger(cityId)) {
      return Response.json({ error: 'file and cityId are required' }, { status: 400 })
    }
    if (!userCanAccessCity(user, cityId)) {
      return Response.json({ error: 'City is not assigned to this user' }, { status: 403 })
    }

    const city = await req.payload.findByID({
      collection: 'cities',
      id: cityId,
      depth: 0,
      overrideAccess: false,
      user,
      req,
    })
    const parsed = await parseEventUpload(file, { cityId, timezone: city.timezone })
    const scope = `upload-${stableHash([user.id, cityId, file.name.toLowerCase()]).slice(0, 16)}`
    const counts = { created: 0, updated: 0, review: 0, failed: parsed.errors.length }
    const records: number[] = []
    const importedSourceKeys = new Set<string>()

    for (const event of parsed.events) {
      importedSourceKeys.add(makeSourceKey(event.source, event.externalId, cityId, scope))
      const result = await ingestNormalizedEvent(req, {
        event,
        submittedBy: user.id,
        scope,
        sourcePayload: {
          filename: file.name,
          format: file.type || file.name.split('.').pop(),
          scope,
        },
      })
      records.push(result.recordId)
      if (result.state === 'created') counts.created++
      else if (result.state === 'updated') counts.updated++
      else if (result.state === 'needs-review') counts.review++
      else counts.failed++
    }

    if (file.name.toLowerCase().endsWith('.ics')) {
      const priorRecords = await req.payload.find({
        collection: 'ingestion-records',
        where: {
          and: [
            { source: { equals: 'ical' } },
            { city: { equals: cityId } },
            { submittedBy: { equals: user.id } },
          ],
        },
        depth: 0,
        limit: 5_000,
        overrideAccess: true,
        req,
      })
      const prefix = makeSourceKey('ical', '', cityId, scope)
      for (const record of priorRecords.docs) {
        if (
          !record.sourceKey.startsWith(prefix) ||
          importedSourceKeys.has(record.sourceKey) ||
          !record.linkedEvent
        ) {
          continue
        }
        await cancelIngestedEvent(req, 'ical', record.externalId, cityId, scope)
      }
    }

    return Response.json({
      filename: file.name,
      seen: parsed.events.length,
      records,
      errors: parsed.errors,
      ...counts,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 400 },
    )
  }
}
