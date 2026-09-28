import { requireUser } from '@/lib/auth'
import { googleAccessToken, listGoogleCalendars } from '@/lib/google-calendar'

export async function GET(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const id = Number(new URL(request.url).searchParams.get('connectionId'))
    if (!Number.isInteger(id))
      return Response.json({ error: 'Invalid connection' }, { status: 400 })

    const connection = await req.payload.findByID({
      collection: 'oauth-connections',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const ownerId = typeof connection.owner === 'object' ? connection.owner.id : connection.owner
    if (ownerId !== user.id && !user.roles.includes('admin')) {
      return Response.json({ error: 'Connection not found' }, { status: 404 })
    }
    if (!connection.encryptedCredentials) {
      return Response.json({ error: 'Connection is not authorized' }, { status: 409 })
    }

    const token = await googleAccessToken(connection.encryptedCredentials)
    if (token.encryptedCredentials !== connection.encryptedCredentials) {
      await req.payload.update({
        collection: 'oauth-connections',
        id,
        data: { encryptedCredentials: token.encryptedCredentials },
        overrideAccess: true,
        req,
      })
    }
    const calendars = await listGoogleCalendars(token.credentials.accessToken!)
    return Response.json({ calendars })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to list calendars' },
      { status: 400 },
    )
  }
}
