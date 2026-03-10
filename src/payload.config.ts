import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { registerEndpoint } from './endpoints/register'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { Venues } from './collections/Venues'
import { Categories } from './collections/Categories'
import { Organizers } from './collections/Organizers'
import { SavedEvents } from './collections/SavedEvents'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : []

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL || '',

  // CORS: comma-separated list of allowed origins (required when using credentials). Set in all environments.
  cors: corsOrigins,

  // CSRF: only accept cookie-authenticated mutations from these origins
  csrf: corsOrigins,

  // Database
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),

  // Custom endpoints
  endpoints: [registerEndpoint],

  collections: [Users, Media, Events, Venues, Categories, Organizers, SavedEvents],

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

  plugins: [],
})
