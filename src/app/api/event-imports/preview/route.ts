import { requireUser, userCanAccessCity } from '@/lib/auth'
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
    const result = await parseEventUpload(file, { cityId, timezone: city.timezone })
    return Response.json({
      filename: file.name,
      total: result.events.length,
      errors: result.errors,
      events: result.events.slice(0, 100),
      truncated: result.events.length > 100,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to preview import' },
      { status: 400 },
    )
  }
}
