import type { TaskConfig } from 'payload'

import { syncGoogleConnection } from '@/lib/ingestion/google'
import { pollInstagramVenue } from '@/lib/ingestion/instagram'

type ConnectionTask = {
  input: { connectionId: number }
  output: { seen: number; created: number; updated: number; review: number; failed: number }
}

type VenueTask = {
  input: { venueId: number }
  output: { seen: number; created: number; review: number; skipped: number; failed: number }
}

type PollAllTask = {
  input: Record<string, never>
  output: { attempted: number; failed: number }
}

export const syncGoogleCalendarTask: TaskConfig<ConnectionTask> = {
  slug: 'syncGoogleCalendar',
  inputSchema: [{ name: 'connectionId', type: 'number', required: true }],
  outputSchema: [
    { name: 'seen', type: 'number', required: true },
    { name: 'created', type: 'number', required: true },
    { name: 'updated', type: 'number', required: true },
    { name: 'review', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  concurrency: ({ input }) => `google-connection:${input.connectionId}`,
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  handler: async ({ input, req }) => ({
    output: await syncGoogleConnection(req, input.connectionId),
  }),
}

export const pollInstagramVenueTask: TaskConfig<VenueTask> = {
  slug: 'pollInstagramVenue',
  inputSchema: [{ name: 'venueId', type: 'number', required: true }],
  outputSchema: [
    { name: 'seen', type: 'number', required: true },
    { name: 'created', type: 'number', required: true },
    { name: 'review', type: 'number', required: true },
    { name: 'skipped', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  concurrency: ({ input }) => `instagram-venue:${input.venueId}`,
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
  handler: async ({ input, req }) => ({
    output: await pollInstagramVenue(req, input.venueId),
  }),
}

export const pollGoogleCalendarsTask: TaskConfig<PollAllTask> = {
  slug: 'pollGoogleCalendars',
  inputSchema: [],
  outputSchema: [
    { name: 'attempted', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 */5 * * * *', queue: 'ingestion' }],
  retries: 1,
  handler: async ({ req }) => {
    const connections = await req.payload.find({
      collection: 'oauth-connections',
      where: { and: [{ provider: { equals: 'google' } }, { status: { equals: 'active' } }] },
      depth: 0,
      limit: 500,
      overrideAccess: true,
      req,
    })
    let failed = 0
    for (const connection of connections.docs) {
      try {
        await req.payload.jobs.queue({
          task: 'syncGoogleCalendar',
          input: { connectionId: connection.id },
          queue: 'ingestion',
          overrideAccess: true,
          req,
        })
      } catch (error) {
        failed++
        req.payload.logger.error({
          msg: `Google calendar sync failed for connection ${connection.id}`,
          err: error,
        })
      }
    }
    return { output: { attempted: connections.docs.length, failed } }
  },
}

export const pollInstagramVenuesTask: TaskConfig<PollAllTask> = {
  slug: 'pollInstagramVenues',
  inputSchema: [],
  outputSchema: [
    { name: 'attempted', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
  ],
  schedule: [{ cron: '0 */15 * * * *', queue: 'ingestion' }],
  retries: 1,
  handler: async ({ req }) => {
    const venues = await req.payload.find({
      collection: 'venues',
      where: { 'instagram.monitoringEnabled': { equals: true } },
      depth: 0,
      limit: 500,
      overrideAccess: true,
      req,
    })
    let failed = 0
    for (const venue of venues.docs) {
      try {
        await req.payload.jobs.queue({
          task: 'pollInstagramVenue',
          input: { venueId: venue.id },
          queue: 'ingestion',
          overrideAccess: true,
          req,
        })
      } catch (error) {
        failed++
        req.payload.logger.error({
          msg: `Instagram polling failed for venue ${venue.id}`,
          err: error,
        })
      }
    }
    return { output: { attempted: venues.docs.length, failed } }
  },
}

export const ingestionTasks = [
  syncGoogleCalendarTask,
  pollInstagramVenueTask,
  pollGoogleCalendarsTask,
  pollInstagramVenuesTask,
]
