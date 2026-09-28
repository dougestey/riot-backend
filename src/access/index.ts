import type { Access, FieldAccess, Where } from 'payload'

/**
 * Access control: Only admins
 */
export const isAdmin: Access = ({ req: { user } }) => {
  return user?.roles?.includes('admin') ?? false
}

/**
 * Access control: Editors or admins
 */
export const isEditorOrAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  return user.roles?.includes('admin') || user.roles?.includes('editor')
}

export const isAmbassadorOrEditor: Access = ({ req: { user } }) => {
  if (!user) return false
  return (
    user.roles?.includes('admin') ||
    user.roles?.includes('editor') ||
    user.roles?.includes('ambassador')
  )
}

/**
 * Access control: Any authenticated user
 */
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Access control: Admins or the user themselves (row-level)
 * Returns a query constraint for non-admins
 */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.roles?.includes('admin')) return true
  return { id: { equals: user.id } }
}

/**
 * Access control: Admins or the owner of the row (by relationship field)
 * Use for junction/ownership collections (e.g. saved-events where user owns the row)
 */
export const isAdminOrOwner =
  (ownerField: string): Access =>
  ({ req: { user } }) => {
    if (!user) return false
    if (user.roles?.includes('admin')) return true
    return { [ownerField]: { equals: user.id } }
  }

/**
 * Field-level access: Only admins can modify
 */
export const adminFieldAccess: FieldAccess = ({ req: { user } }) => {
  return user?.roles?.includes('admin') ?? false
}

/**
 * Access control: Anyone (public read)
 */
export const anyone: Access = () => true

/**
 * Access control: Published content or authenticated user
 * Returns a query constraint for unauthenticated users
 */
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user) return true
  return { status: { equals: 'published' } }
}

function relationshipIDs(value: unknown): Array<number | string> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'number' || typeof item === 'string') return item
      if (item && typeof item === 'object' && 'id' in item) {
        const id = (item as { id?: unknown }).id
        return typeof id === 'number' || typeof id === 'string' ? id : undefined
      }
      return undefined
    })
    .filter((id): id is number | string => id !== undefined)
}

export const eventReadAccess: Access = ({ req: { user } }) => {
  const publishedOnly: Where = { status: { equals: 'published' } }
  if (!user) return publishedOnly
  if (user.roles?.includes('admin') || user.roles?.includes('editor')) return true

  if (user.roles?.includes('ambassador')) {
    const cityIDs = relationshipIDs(user.assignedCities)
    const allowed: Where[] = [publishedOnly, { createdBy: { equals: user.id } }]
    if (cityIDs.length > 0) allowed.push({ city: { in: cityIDs } })
    return { or: allowed }
  }

  return publishedOnly
}

export const eventUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.roles?.includes('admin') || user.roles?.includes('editor')) return true
  if (!user.roles?.includes('ambassador')) return false

  const cityIDs = relationshipIDs(user.assignedCities)
  if (cityIDs.length === 0) return false
  const constraints: Where[] = [
    { createdBy: { equals: user.id } },
    { city: { in: cityIDs } },
    { status: { equals: 'draft' } },
  ]
  return { and: constraints }
}

export const editorFieldAccess: FieldAccess = ({ req: { user } }) => {
  return Boolean(user?.roles?.includes('admin') || user?.roles?.includes('editor'))
}
