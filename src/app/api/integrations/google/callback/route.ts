import { timingSafeEqual } from 'node:crypto'

import { requireUser } from '@/lib/auth'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { exchangeGoogleCode } from '@/lib/google-calendar'

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state)
      return Response.json({ error: 'Missing OAuth code or state' }, { status: 400 })

    const [idValue, nonce] = state.split('.')
    const id = Number(idValue)
    if (!Number.isInteger(id) || !nonce)
      return Response.json({ error: 'Invalid OAuth state' }, { status: 400 })

    const connection = await req.payload.findByID({
      collection: 'oauth-connections',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const ownerId = typeof connection.owner === 'object' ? connection.owner.id : connection.owner
    if (ownerId !== user.id || connection.provider !== 'google') {
      return Response.json({ error: 'OAuth connection not found' }, { status: 404 })
    }
    if (
      !connection.encryptedOAuthState ||
      !connection.stateExpiresAt ||
      new Date(connection.stateExpiresAt) < new Date()
    ) {
      return Response.json({ error: 'OAuth state expired' }, { status: 400 })
    }

    const stored = JSON.parse(decryptSecret(connection.encryptedOAuthState)) as {
      nonce: string
      verifier: string
    }
    if (!equalSecret(stored.nonce, nonce)) {
      return Response.json({ error: 'OAuth state mismatch' }, { status: 400 })
    }

    const credentials = await exchangeGoogleCode(code, stored.verifier)
    await req.payload.update({
      collection: 'oauth-connections',
      id,
      data: {
        encryptedCredentials: encryptSecret(JSON.stringify(credentials)),
        encryptedOAuthState: null,
        stateExpiresAt: null,
        grantedScopes: [
          'https://www.googleapis.com/auth/calendar.events.readonly',
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        ],
      },
      overrideAccess: true,
      req,
    })

    return Response.json({ connectionId: id, status: 'authorized' })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Google authorization failed' },
      { status: 400 },
    )
  }
}
