import { describe, expect, it } from 'vitest'

import { eventReadAccess, eventUpdateAccess } from '@/access'

function args(user: unknown) {
  return { req: { user } } as never
}

describe('event access', () => {
  it('restricts anonymous users and attendees to published events', () => {
    expect(eventReadAccess(args(null))).toEqual({ status: { equals: 'published' } })
    expect(eventReadAccess(args({ id: 2, roles: ['attendee'] }))).toEqual({
      status: { equals: 'published' },
    })
  })

  it('allows ambassadors to read assigned-city drafts but update only their own drafts', () => {
    const user = { id: 9, roles: ['ambassador'], assignedCities: [3, { id: 4 }] }
    expect(eventReadAccess(args(user))).toEqual({
      or: [
        { status: { equals: 'published' } },
        { createdBy: { equals: 9 } },
        { city: { in: [3, 4] } },
      ],
    })
    expect(eventUpdateAccess(args(user))).toEqual({
      and: [
        { createdBy: { equals: 9 } },
        { city: { in: [3, 4] } },
        { status: { equals: 'draft' } },
      ],
    })
  })

  it('allows editors to manage all events', () => {
    expect(eventReadAccess(args({ id: 1, roles: ['editor'] }))).toBe(true)
    expect(eventUpdateAccess(args({ id: 1, roles: ['editor'] }))).toBe(true)
  })
})
