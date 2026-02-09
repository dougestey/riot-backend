import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin } from '../access'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'parent', 'color'],
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
      type: 'textarea',
    },
    {
      name: 'color',
      type: 'text',
      admin: {
        description: 'Hex color code for UI display (e.g. #FF5733)',
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      admin: {
        description: 'Parent category for hierarchical structure',
      },
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
            description: 'WordPress term ID',
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
