import type { Access, CollectionConfig } from 'payload'

const ingestionAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.roles?.includes('admin') || user.roles?.includes('editor')) return true
  return { submittedBy: { equals: user.id } }
}

export const IngestionRecords: CollectionConfig = {
  slug: 'ingestion-records',
  admin: {
    useAsTitle: 'sourceKey',
    defaultColumns: ['source', 'status', 'city', 'venue', 'confidence', 'updatedAt'],
    group: 'Ingestion',
  },
  access: {
    read: ingestionAccess,
    create: ({ req: { user } }) =>
      Boolean(user && (user.roles?.includes('admin') || user.roles?.includes('editor'))),
    update: ({ req: { user } }) =>
      Boolean(user && (user.roles?.includes('admin') || user.roles?.includes('editor'))),
    delete: ({ req: { user } }) => Boolean(user?.roles?.includes('admin')),
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Facebook Graph', value: 'facebook' },
        { label: 'Google Calendar', value: 'google-calendar' },
        { label: 'iCalendar', value: 'ical' },
        { label: 'Facebook Export', value: 'facebook-export' },
        { label: 'CSV', value: 'csv' },
        { label: 'Instagram', value: 'instagram' },
        { label: 'WordPress', value: 'wordpress' },
      ],
    },
    { name: 'sourceKey', type: 'text', required: true, unique: true, index: true },
    { name: 'externalId', type: 'text', required: true, index: true },
    { name: 'canonicalUrl', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Needs review', value: 'needs-review' },
        { label: 'Event created', value: 'event-created' },
        { label: 'Skipped', value: 'skipped' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    { name: 'city', type: 'relationship', relationTo: 'cities', required: true, index: true },
    { name: 'venue', type: 'relationship', relationTo: 'venues', index: true },
    { name: 'submittedBy', type: 'relationship', relationTo: 'users', index: true },
    { name: 'connection', type: 'relationship', relationTo: 'oauth-connections', index: true },
    { name: 'linkedEvent', type: 'relationship', relationTo: 'events', index: true },
    {
      name: 'duplicateCandidates',
      type: 'relationship',
      relationTo: 'events',
      hasMany: true,
    },
    { name: 'normalizedPayload', type: 'json', required: true },
    {
      name: 'sourcePayload',
      type: 'json',
      admin: { description: 'A bounded source snapshot; never store full account exports here' },
    },
    { name: 'payloadHash', type: 'text', required: true, index: true },
    { name: 'confidence', type: 'number', min: 0, max: 1 },
    { name: 'model', type: 'text' },
    { name: 'extractionEvidence', type: 'json' },
    { name: 'sourceUpdatedAt', type: 'date' },
    { name: 'processedAt', type: 'date' },
    {
      name: 'errors',
      type: 'array',
      maxRows: 25,
      fields: [
        { name: 'field', type: 'text' },
        { name: 'message', type: 'text', required: true },
      ],
    },
  ],
}
