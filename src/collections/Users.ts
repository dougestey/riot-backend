import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrSelf, adminFieldAccess } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'firstName', 'lastName', 'roles'],
    group: 'Admin',
  },
  access: {
    read: isAdminOrSelf,
    create: isAdmin,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    // Email is added by auth: true
    {
      type: 'row',
      fields: [
        {
          name: 'firstName',
          type: 'text',
        },
        {
          name: 'lastName',
          type: 'text',
        },
      ],
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['attendee'],
      required: true,
      saveToJWT: true, // Include in JWT for fast access checks
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Ambassador', value: 'ambassador' },
        { label: 'Attendee', value: 'attendee' },
      ],
      access: {
        update: adminFieldAccess, // Only admins can modify roles
      },
      admin: {
        position: 'sidebar',
        description: 'User roles determine access permissions',
      },
    },
    {
      name: 'assignedCities',
      type: 'relationship',
      relationTo: 'cities',
      hasMany: true,
      access: {
        update: adminFieldAccess,
      },
      admin: {
        position: 'sidebar',
        description: 'Cities in which this user may submit draft events',
      },
    },
  ],
}
