import { randomBytes } from 'node:crypto'

import { requireUser, userCanAccessCity } from '@/lib/auth'
import { encryptSecret } from '@/lib/crypto'
import { buildGoogleAuthorizationURL, createPKCE } from '@/lib/google-calendar'

export async function POST(request: Request) {
  try {
    const { req, user } = await requireUser(request)
    const body = (await request.json()) as { cityId?: number; label?: string }
    if (!body.cityId || !userCanAccessCity(user, body.cityId)) {
      return Response.json({ error: 'Invalid or unauthorized city' }, { status: 403 })
    }

    const connection = await req.payload.create({
      collection: 'oauth-connections',
      data: {
        owner: user.id,
        city: body.cityId,
        label: body.label?.trim() || 'RIOT intake calendar',
        provider: 'google',
        status: 'pending',
      },
      overrideAccess: true,
      req,
    })
    const nonce = randomBytes(32).toString('base64url')
    const state = `${connection.id}.${nonce}`
    const { verifier, challenge } = createPKCE()

    await req.payload.update({
      collection: 'oauth-connections',
      id: connection.id,
      data: {
        encryptedOAuthState: encryptSecret(JSON.stringify({ nonce, verifier })),
        stateExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
      overrideAccess: true,
      req,
    })

    return Response.json({
      connectionId: connection.id,
      authorizationUrl: buildGoogleAuthorizationURL(state, challenge),
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to start Google authorization' },
      { status: 400 },
    )
  }
}
