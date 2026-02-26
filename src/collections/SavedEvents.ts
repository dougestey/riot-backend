import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { isAdminOrOwner, isAuthenticated } from '../access'

export const SavedEvents: CollectionConfig = {
  slug: 'saved-events',
  admin: {
    hidden: true,
    useAsTitle: 'event',
    defaultColumns: ['event', 'user', 'savedAt'],
    group: 'Content',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrOwner('user'),
    update: () => false,
    delete: isAdminOrOwner('user'),
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Set automatically from the current user',
      },
    },
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      index: true,
    },
    {
      name: 'savedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        description: 'When the user saved this event',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && req.user) {
          data.user = req.user.id
        }
        if (data.savedAt == null && operation === 'create') {
          data.savedAt = new Date()
        }
        return data
      },
    ],
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (operation !== 'create' || !data?.event || !req.user) return data

        const eventId =
          typeof data.event === 'object' ? (data.event as { id: string })?.id : data.event
        if (!eventId) return data

        const existing = await req.payload.find({
          collection: 'saved-events',
          where: {
            and: [{ user: { equals: req.user.id } }, { event: { equals: eventId } }],
          },
          limit: 1,
          req,
          overrideAccess: true,
        })

        if (existing.totalDocs > 0) {
          throw new APIError('Event already saved', 400)
        }

        return data
      },
    ],
  },
}
