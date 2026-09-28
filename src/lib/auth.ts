import config from '@payload-config'
import { APIError, createLocalReq, getPayload } from 'payload'

import type { User } from '@/payload-types'

export async function requireUser(
  request: Request,
  roles: Array<User['roles'][number]> = ['admin', 'editor', 'ambassador'],
) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })

  if (!user || !roles.some((role) => user.roles?.includes(role))) {
    throw new APIError('Unauthorized', 401)
  }

  const req = await createLocalReq({ user }, payload)
  return { payload, req, user }
}

export function userCanAccessCity(user: User, cityId: number): boolean {
  if (user.roles?.includes('admin') || user.roles?.includes('editor')) return true
  return (
    user.roles?.includes('ambassador') &&
    (user.assignedCities || []).some(
      (city) => String(typeof city === 'object' ? city.id : city) === String(cityId),
    )
  )
}
