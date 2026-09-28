import { APIError, type CollectionConfig } from 'payload'

import {
  editorFieldAccess,
  eventReadAccess,
  eventUpdateAccess,
  isAmbassadorOrEditor,
  isEditorOrAdmin,
} from '../access'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'venue', 'startDateTime', 'status', 'featured'],
    group: 'Content',
    listSearchableFields: ['title', 'description', 'venue'],
  },
  access: {
    read: eventReadAccess,
    create: isAmbassadorOrEditor,
    update: eventUpdateAccess,
    delete: isEditorOrAdmin,
  },
  fields: [
    // Content Tab
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'slug',
              type: 'text',
              unique: true,
              index: true,
            },
            {
              name: 'featuredImage',
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'description',
              type: 'richText',
            },
          ],
        },
        // Details Tab
        {
          label: 'Details',
          fields: [
            {
              name: 'isVirtual',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description: 'Event type',
                components: {
                  Field: '/components/IsVirtualRadioField',
                },
              },
            },
            {
              name: 'virtualUrl',
              type: 'text',
              admin: {
                description: 'URL to join the virtual event',
                condition: (data) => data?.isVirtual === true,
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'startDateTime',
                  type: 'date',
                  required: true,
                  admin: {
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                    width: '50%',
                  },
                },
                {
                  name: 'endDateTime',
                  type: 'date',
                  admin: {
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                    width: '50%',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'isAllDay',
                  type: 'checkbox',
                  defaultValue: false,
                  admin: {
                    width: '25%',
                  },
                },
                {
                  name: 'timezone',
                  type: 'text',
                  defaultValue: 'America/Halifax',
                  admin: {
                    description: 'IANA timezone (e.g. America/Halifax)',
                    width: '75%',
                  },
                },
              ],
            },
            {
              name: 'venue',
              type: 'relationship',
              relationTo: 'venues',
              admin: {
                description: 'Event location',
              },
            },
            {
              name: 'city',
              type: 'relationship',
              relationTo: 'cities',
              index: true,
              admin: {
                description: 'Normalized city used for authorization and discovery',
              },
            },
            {
              name: 'website',
              type: 'text',
              admin: {
                description: 'External event link (Facebook, Eventbrite, etc.)',
              },
            },
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              admin: {
                description: 'Event categories',
              },
            },
            {
              name: 'organizers',
              type: 'relationship',
              relationTo: 'organizers',
              hasMany: true,
            },
          ],
        },
      ],
    },
    // Status Sidebar
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Postponed', value: 'postponed' },
      ],
      admin: {
        position: 'sidebar',
      },
      access: {
        update: editorFieldAccess,
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Feature this event on the homepage',
      },
      access: {
        update: editorFieldAccess,
      },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    // Sync Sidebar Group
    {
      name: 'sync',
      type: 'group',
      admin: {
        position: 'sidebar',
        description: 'WordPress sync metadata',
      },
      fields: [
        {
          name: 'source',
          type: 'select',
          defaultValue: 'manual',
          options: [
            { label: 'Manual', value: 'manual' },
            { label: 'WordPress', value: 'wordpress' },
            { label: 'Facebook', value: 'facebook' },
            { label: 'Google Calendar', value: 'google-calendar' },
            { label: 'iCalendar', value: 'ical' },
            { label: 'Facebook Export', value: 'facebook-export' },
            { label: 'CSV', value: 'csv' },
            { label: 'Instagram', value: 'instagram' },
          ],
          access: { update: editorFieldAccess },
        },
        {
          name: 'externalId',
          type: 'text',
          index: true,
          admin: {
            description: 'ID assigned by the external source',
          },
          access: { update: editorFieldAccess },
        },
        {
          name: 'sourceKey',
          type: 'text',
          unique: true,
          index: true,
          admin: {
            description: 'Namespaced source identity',
          },
          access: { update: editorFieldAccess },
        },
        {
          name: 'externalUrl',
          type: 'text',
          access: { update: editorFieldAccess },
        },
        {
          name: 'ingestionRecord',
          type: 'relationship',
          relationTo: 'ingestion-records',
          access: { update: editorFieldAccess },
        },
        {
          name: 'lastSyncedAt',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
          access: { update: editorFieldAccess },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        // Auto-set createdBy on create
        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id
        }

        if (req.user?.roles?.includes('ambassador')) {
          const assignedCities = Array.isArray(req.user.assignedCities)
            ? req.user.assignedCities.map((city) =>
                typeof city === 'object' && city ? city.id : city,
              )
            : []
          const requestedCity = data.city ?? originalDoc?.city
          const city =
            typeof requestedCity === 'object' && requestedCity ? requestedCity.id : requestedCity

          if (!city || !assignedCities.map(String).includes(String(city))) {
            throw new APIError('Ambassadors may only submit events in assigned cities', 403)
          }

          data.status = 'draft'
          data.featured = false
          if (operation === 'create') {
            data.sync = { source: 'manual' }
          }
        }
        return data
      },
    ],
  },
}
