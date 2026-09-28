import type { CollectionConfig } from 'payload'

import { adminFieldAccess, isAdmin, isAdminOrOwner } from '../access'

export const OAuthConnections: CollectionConfig = {
  slug: 'oauth-connections',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'provider', 'owner', 'status', 'lastSyncedAt'],
    group: 'Ingestion',
  },
  access: {
    read: isAdminOrOwner('owner'),
    create: isAdmin,
    update: isAdminOrOwner('owner'),
    delete: isAdminOrOwner('owner'),
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: { update: adminFieldAccess },
    },
    {
      name: 'city',
      type: 'relationship',
      relationTo: 'cities',
      required: true,
      index: true,
      access: { update: adminFieldAccess },
    },
    { name: 'label', type: 'text', required: true },
    {
      name: 'provider',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Google Calendar', value: 'google' },
        { label: 'Meta', value: 'meta' },
      ],
      access: { update: adminFieldAccess },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Active', value: 'active' },
        { label: 'Error', value: 'error' },
        { label: 'Revoked', value: 'revoked' },
      ],
      access: { update: adminFieldAccess },
    },
    {
      name: 'externalAccountId',
      type: 'text',
      index: true,
      access: { update: adminFieldAccess },
    },
    { name: 'calendarId', type: 'text', index: true, access: { update: adminFieldAccess } },
    { name: 'calendarName', type: 'text', access: { update: adminFieldAccess } },
    {
      name: 'grantedScopes',
      type: 'text',
      hasMany: true,
      access: { read: adminFieldAccess, update: adminFieldAccess },
    },
    {
      name: 'encryptedCredentials',
      type: 'textarea',
      access: { read: adminFieldAccess, update: adminFieldAccess },
      admin: { hidden: true },
    },
    {
      name: 'encryptedOAuthState',
      type: 'textarea',
      access: { read: adminFieldAccess, update: adminFieldAccess },
      admin: { hidden: true },
    },
    {
      name: 'stateExpiresAt',
      type: 'date',
      admin: { hidden: true },
      access: { update: adminFieldAccess },
    },
    {
      name: 'syncToken',
      type: 'textarea',
      admin: { hidden: true },
      access: { update: adminFieldAccess },
    },
    { name: 'lastSyncedAt', type: 'date', access: { update: adminFieldAccess } },
    { name: 'lastError', type: 'textarea', access: { update: adminFieldAccess } },
  ],
}
