import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin } from '../access'

export const Organizers: CollectionConfig = {
  slug: 'organizers',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'email'],
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
      name: 'email',
      type: 'text',
    },
    {
      name: 'website',
      type: 'text',
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
            description: 'WordPress organizer ID',
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
