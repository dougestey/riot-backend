import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Content',
  },
  access: {
    read: anyone,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  upload: {
    staticDir: 'media',
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'card',
        width: 768,
        height: 512,
        position: 'centre',
      },
      {
        name: 'feature',
        width: 1920,
        height: 1080,
        position: 'centre',
      },
    ],
    adminThumbnail: 'thumbnail',
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description: 'Alternative text for accessibility',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description: 'Image caption for display',
      },
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'Attribution/source credit',
      },
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
      admin: {
        description: 'Tags for organization and AI tagging',
      },
    },
    {
      name: 'source',
      type: 'group',
      admin: {
        description: 'External media provenance',
      },
      fields: [
        {
          name: 'sourceKey',
          type: 'text',
          unique: true,
          index: true,
          admin: { readOnly: true },
        },
        {
          name: 'platform',
          type: 'select',
          options: [
            { label: 'Instagram', value: 'instagram' },
            { label: 'Facebook', value: 'facebook' },
            { label: 'WordPress', value: 'wordpress' },
          ],
          admin: { readOnly: true },
        },
        { name: 'externalId', type: 'text', index: true, admin: { readOnly: true } },
        { name: 'sourceUrl', type: 'text', admin: { readOnly: true } },
      ],
    },
  ],
}
