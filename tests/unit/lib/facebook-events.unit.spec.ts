import { describe, expect, it } from 'vitest'

import { mapFacebookEvent } from '@/lib/facebook-events'

describe('Facebook event mapper', () => {
  it('maps a Graph event to a normalized draft candidate', () => {
    expect(
      mapFacebookEvent(
        {
          id: '123',
          name: 'City Show',
          start_time: '2026-10-10T19:00:00-0300',
          end_time: '2026-10-10T22:00:00-0300',
          timezone: 'America/Halifax',
          place: { name: 'The Hall' },
        },
        7,
      ),
    ).toMatchObject({
      source: 'facebook',
      externalId: '123',
      title: 'City Show',
      cityId: 7,
      locationText: 'The Hall',
    })
  })

  it('rejects incomplete event objects', () => {
    expect(mapFacebookEvent({ id: '123' }, 7)).toBeUndefined()
  })
})
