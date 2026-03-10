import type { Endpoint } from 'payload'

export const registerEndpoint: Endpoint = {
  path: '/register',
  method: 'post',
  handler: async (req) => {
    const { payload } = req

    let body: Record<string, unknown>
    try {
      body = (await req.json?.()) as Record<string, unknown>
    } catch {
      return Response.json({ errors: [{ message: 'Invalid JSON body' }] }, { status: 400 })
    }

    const { email, password, firstName, lastName } = body as {
      email?: string
      password?: string
      firstName?: string
      lastName?: string
    }

    // Validate required fields
    if (!email || !password) {
      return Response.json(
        { errors: [{ message: 'Email and password are required' }] },
        { status: 400 },
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return Response.json({ errors: [{ message: 'Invalid email format' }] }, { status: 400 })
    }

    // Validate password strength (min 8 chars)
    if (password.length < 8) {
      return Response.json(
        { errors: [{ message: 'Password must be at least 8 characters' }] },
        { status: 400 },
      )
    }

    // Check if email already exists
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      return Response.json(
        { errors: [{ message: 'An account with this email already exists' }] },
        { status: 400 },
      )
    }

    // Create the user with attendee role only
    try {
      await payload.create({
        collection: 'users',
        data: {
          email,
          password,
          roles: ['attendee'],
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
        },
        overrideAccess: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user'
      return Response.json({ errors: [{ message }] }, { status: 400 })
    }

    // Auto-login and return user with cookie
    try {
      const loginResult = await payload.login({
        collection: 'users',
        data: { email, password },
        req,
      })

      return Response.json(
        {
          message: 'Registration successful',
          user: loginResult.user,
          token: loginResult.token,
          exp: loginResult.exp,
        },
        {
          status: 201,
          headers: {
            'Set-Cookie': `payload-token=${loginResult.token}; Path=/; HttpOnly; SameSite=${process.env.COOKIE_SAMESITE || 'Lax'}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}${process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : ''}; Max-Age=${60 * 60 * 24 * 7}`,
          },
        },
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Registration succeeded but auto-login failed'
      return Response.json({ errors: [{ message }] }, { status: 500 })
    }
  },
}
