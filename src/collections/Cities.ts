import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin } from '../access'

export const Cities: CollectionConfig = {
  slug: 'cities',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'region', 'country', 'timezone', 'active'],
    group: 'Content',
  },
  access: {
    read: anyone,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'region', type: 'text' },
    { name: 'country', type: 'text', required: true, defaultValue: 'Canada' },
    {
      name: 'timezone',
      type: 'text',
      required: true,
      defaultValue: 'America/Halifax',
      admin: { description: 'IANA timezone used when an imported event omits one' },
    },
    {
      name: 'active',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      index: true,
    },
  ],
}
