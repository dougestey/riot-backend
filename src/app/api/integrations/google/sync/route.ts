import { requireUser } from '@/lib/auth'
import { syncGoogleConnection } from '@/lib/ingestion/google'

export async function POST(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const body = (await request.json()) as { connectionId?: number }
    if (!body.connectionId)
      return Response.json({ error: 'connectionId is required' }, { status: 400 })

    const connection = await req.payload.findByID({
      collection: 'oauth-connections',
      id: body.connectionId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const ownerId = typeof connection.owner === 'object' ? connection.owner.id : connection.owner
    if (ownerId !== user.id && !user.roles.includes('admin')) {
      return Response.json({ error: 'Connection not found' }, { status: 404 })
    }

    const result = await syncGoogleConnection(req, connection.id)
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Calendar sync failed' },
      { status: 400 },
    )
  }
}
