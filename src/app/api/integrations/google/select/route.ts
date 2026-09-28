import { requireUser } from '@/lib/auth'
import { googleAccessToken, listGoogleCalendars } from '@/lib/google-calendar'

export async function POST(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const body = (await request.json()) as { connectionId?: number; calendarId?: string }
    if (!body.connectionId || !body.calendarId) {
      return Response.json({ error: 'connectionId and calendarId are required' }, { status: 400 })
    }
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
    if (!connection.encryptedCredentials) {
      return Response.json({ error: 'Connection is not authorized' }, { status: 409 })
    }

    const token = await googleAccessToken(connection.encryptedCredentials)
    const calendars = await listGoogleCalendars(token.credentials.accessToken!)
    const calendar = calendars.find((candidate) => candidate.id === body.calendarId)
    if (!calendar) return Response.json({ error: 'Calendar is not accessible' }, { status: 404 })

    await req.payload.update({
      collection: 'oauth-connections',
      id: connection.id,
      data: {
        calendarId: calendar.id,
        calendarName: calendar.summary || calendar.id,
        encryptedCredentials: token.encryptedCredentials,
        syncToken: null,
        status: 'active',
        lastError: null,
      },
      overrideAccess: true,
      req,
    })
    return Response.json({ connectionId: connection.id, calendar })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to select calendar' },
      { status: 400 },
    )
  }
}
