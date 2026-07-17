import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerEndpoint } from '@/endpoints/register'

const mockCreate = vi.fn()
const mockLogin = vi.fn()
const mockLogError = vi.fn()

const authConfig: {
  cookies: {
    domain?: string
    sameSite: 'Lax' | 'None' | 'Strict'
    secure: boolean
  }
  tokenExpiration: number
} = {
  cookies: {
    domain: undefined,
    sameSite: 'Lax',
    secure: false,
  },
  tokenExpiration: 604800,
}

const payload = {
  collections: {
    users: {
      config: { auth: authConfig },
    },
  },
  config: { cookiePrefix: 'payload' },
  create: mockCreate,
  logger: { error: mockLogError },
  login: mockLogin,
}

function makeRequest(body: unknown): PayloadRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    payload,
  } as unknown as PayloadRequest
}

function makeInvalidJSONRequest(): PayloadRequest {
  return {
    json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
    payload,
  } as unknown as PayloadRequest
}

async function handle(req: PayloadRequest) {
  return registerEndpoint.handler(req)
}

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authConfig.cookies.domain = undefined
    authConfig.cookies.sameSite = 'Lax'
    authConfig.cookies.secure = false
    mockCreate.mockResolvedValue({ id: 42 })
    mockLogin.mockResolvedValue({
      exp: 1_800_000_000,
      token: 'test-token',
      user: { email: 'new@example.com', id: 42, roles: ['attendee'] },
    })
  })

  it('creates an attendee, logs in, and returns a Payload-configured cookie', async () => {
    const req = makeRequest({
      email: '  New@Example.COM ',
      firstName: ' Jane ',
      lastName: ' Doe ',
      password: 'password123',
    })

    const response = await handle(req)

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      exp: 1_800_000_000,
      message: 'Registration successful',
      token: 'test-token',
      user: { email: 'new@example.com', id: 42, roles: ['attendee'] },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      collection: 'users',
      data: {
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        password: 'password123',
        roles: ['attendee'],
      },
      overrideAccess: true,
      req,
    })
    expect(mockLogin).toHaveBeenCalledWith({
      collection: 'users',
      data: { email: 'new@example.com', password: 'password123' },
      req,
    })

    const cookie = response.headers.get('set-cookie')
    expect(cookie).toContain('payload-token=test-token')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly=true')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })

  it('uses Payload cookie security rules for cross-site cookies', async () => {
    authConfig.cookies.domain = '.example.com'
    authConfig.cookies.sameSite = 'None'

    const response = await handle(
      makeRequest({ email: 'new@example.com', password: 'password123' }),
    )
    const cookie = response.headers.get('set-cookie')

    expect(cookie).toContain('Domain=.example.com')
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure=true')
  })

  it.each([
    { body: {}, message: 'Email and password are required' },
    { body: { email: 'not-an-email', password: 'password123' }, message: 'Invalid email format' },
    {
      body: { email: 'new@example.com', password: 'short' },
      message: 'Password must be at least 8 characters',
    },
    { body: [], message: 'Invalid JSON body' },
  ])('rejects invalid input: $message', async ({ body, message }) => {
    const response = await handle(makeRequest(body))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ errors: [{ message }] })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const response = await handle(makeInvalidJSONRequest())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ errors: [{ message: 'Invalid JSON body' }] })
  })

  it('does not expose account-creation errors', async () => {
    mockCreate.mockRejectedValue(new Error('duplicate key users_email_unique'))

    const response = await handle(
      makeRequest({ email: 'existing@example.com', password: 'password123' }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      errors: [{ message: 'Unable to create account with the provided details' }],
    })
    expect(JSON.stringify(body)).not.toContain('duplicate key')
    expect(mockLogError).toHaveBeenCalledWith({
      err: expect.any(Error),
      msg: 'Self-registration failed',
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('does not expose auto-login errors', async () => {
    mockLogin.mockRejectedValue(new Error('database connection details'))

    const response = await handle(
      makeRequest({ email: 'new@example.com', password: 'password123' }),
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      errors: [{ message: 'Account created, but sign-in failed. Please log in.' }],
    })
    expect(JSON.stringify(body)).not.toContain('database connection')
    expect(mockLogError).toHaveBeenCalledWith({
      err: expect.any(Error),
      msg: 'Self-registration auto-login failed',
    })
  })
})
