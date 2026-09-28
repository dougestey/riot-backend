import { requireUser } from '@/lib/auth'
import { pollInstagramVenue } from '@/lib/ingestion/instagram'

export async function POST(request: Request) {
  try {
    const { req } = await requireUser(request, ['admin', 'editor'])
    const body = (await request.json()) as { venueId?: number }
    if (!body.venueId) return Response.json({ error: 'venueId is required' }, { status: 400 })
    return Response.json(await pollInstagramVenue(req, body.venueId))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Instagram poll failed' },
      { status: 400 },
    )
  }
}
