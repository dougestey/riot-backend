import type { Endpoint } from 'payload'
import { generatePayloadCookie } from 'payload/shared'

const errorResponse = (message: string, status: number) =>
  Response.json({ errors: [{ message }] }, { status })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const registerEndpoint: Endpoint = {
  path: '/register',
  method: 'post',
  handler: async (req) => {
    const { payload } = req

    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    if (!isRecord(body)) {
      return errorResponse('Invalid JSON body', 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : undefined
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : undefined

    // Validate required fields
    if (!email || !password) {
      return errorResponse('Email and password are required', 400)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format', 400)
    }

    // Validate password strength (min 8 chars)
    if (password.length < 8) {
      return errorResponse('Password must be at least 8 characters', 400)
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
        req,
      })
    } catch (err) {
      payload.logger.error({ err, msg: 'Self-registration failed' })
      return errorResponse('Unable to create account with the provided details', 400)
    }

    // Auto-login and return user with cookie
    try {
      const loginResult = await payload.login({
        collection: 'users',
        data: { email, password },
        req,
      })
      const authConfig = payload.collections.users.config.auth

      if (!authConfig || !loginResult.token) {
        throw new Error('Login completed without an auth configuration or token')
      }

      const cookie = generatePayloadCookie({
        collectionAuthConfig: authConfig,
        cookiePrefix: payload.config.cookiePrefix,
        token: loginResult.token,
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
            'Set-Cookie': cookie,
          },
        },
      )
    } catch (err) {
      payload.logger.error({ err, msg: 'Self-registration auto-login failed' })
      return errorResponse('Account created, but sign-in failed. Please log in.', 500)
    }
  },
}
