import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { Venues } from './collections/Venues'
import { Categories } from './collections/Categories'
import { Organizers } from './collections/Organizers'
import { SavedEvents } from './collections/SavedEvents'
import { Cities } from './collections/Cities'
import { IngestionRecords } from './collections/IngestionRecords'
import { OAuthConnections } from './collections/OAuthConnections'
import { ingestionTasks } from './jobs/ingestion'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : []

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',

  // CORS: comma-separated list of allowed origins (required when using credentials). Set in all environments.
  cors: corsOrigins,

  // Database
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),

  collections: [
    Users,
    Media,
    Cities,
    Events,
    Venues,
    Categories,
    Organizers,
    SavedEvents,
    OAuthConnections,
    IngestionRecords,
  ],

  // Admin
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '- RIOT Events',
    },
  },

  // See: https://payloadcms.com/docs/rich-text/overview
  editor: lexicalEditor(),

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  sharp,

  jobs: {
    enableConcurrencyControl: true,
    access: {
      run: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      queue: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      cancel: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
    },
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      access: {
        read: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
        create: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
        delete: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
    }),
    tasks: ingestionTasks,
  },

  plugins: [],
})
