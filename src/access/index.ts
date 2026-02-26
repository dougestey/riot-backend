import type { Access, FieldAccess } from 'payload'

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
