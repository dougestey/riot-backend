import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin } from '../access'

export const Venues: CollectionConfig = {
  slug: 'venues',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'address.city', 'address.state', 'website'],
    group: 'Content',
  },
  access: {
    read: anyone,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'description',
      type: 'richText',
    },
    {
      name: 'city',
      type: 'relationship',
      relationTo: 'cities',
      index: true,
      admin: {
        description: 'Normalized city used for imports and ambassador authorization',
      },
    },
    // Address group
    {
      name: 'address',
      type: 'group',
      fields: [
        {
          name: 'street',
          type: 'text',
        },
        {
          type: 'row',
          fields: [
            {
              name: 'city',
              type: 'text',
            },
            {
              name: 'state',
              type: 'text',
              admin: {
                description: 'Province/State',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'zip',
              type: 'text',
              admin: {
                description: 'Postal/ZIP code',
              },
            },
            {
              name: 'country',
              type: 'text',
              defaultValue: 'Canada',
            },
          ],
        },
      ],
    },
    // Coordinates for mapping
    {
      name: 'coordinates',
      type: 'point',
      admin: {
        description: 'Geographic coordinates for mapping',
      },
    },
    // Contact info
    {
      type: 'row',
      fields: [
        {
          name: 'website',
          type: 'text',
        },
        {
          name: 'phone',
          type: 'text',
        },
      ],
    },
    {
      name: 'capacity',
      type: 'number',
      admin: {
        description: 'Maximum venue capacity (manual entry)',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'instagram',
      type: 'group',
      admin: {
        description: 'Instagram Business/Creator account monitoring',
      },
      fields: [
        {
          name: 'username',
          type: 'text',
          index: true,
          admin: { description: 'Username without @' },
        },
        {
          name: 'accountId',
          type: 'text',
          index: true,
          admin: { readOnly: true },
        },
        {
          name: 'monitoringEnabled',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'lastCheckedAt',
          type: 'date',
          admin: { readOnly: true },
        },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'unverified',
          options: [
            { label: 'Unverified', value: 'unverified' },
            { label: 'Active', value: 'active' },
            { label: 'Unavailable', value: 'unavailable' },
            { label: 'Error', value: 'error' },
          ],
          admin: { readOnly: true },
        },
        {
          name: 'lastError',
          type: 'textarea',
          admin: { readOnly: true },
        },
      ],
    },
    // Sync tracking
    {
      name: 'sync',
      type: 'group',
      admin: {
        position: 'sidebar',
        description: 'WordPress sync metadata',
      },
      fields: [
        {
          name: 'externalId',
          type: 'text',
          index: true,
          admin: {
            description: 'WordPress venue ID',
          },
        },
        {
          name: 'lastSyncedAt',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
      ],
    },
  ],
}
