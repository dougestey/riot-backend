import { afterEach, describe, expect, it, vi } from 'vitest'

import { extractEventFromImage } from '@/lib/openai-vision'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('OpenAI vision extraction', () => {
  it('parses and locally validates structured output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      isEvent: true,
                      title: 'Show',
                      startDateTime: '2026-10-10T19:00:00-03:00',
                      endDateTime: null,
                      timezone: 'America/Halifax',
                      description: null,
                      ticketUrl: null,
                      confidence: 0.9,
                      evidence: ['SHOW', 'OCT 10'],
                    }),
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    const result = await extractEventFromImage({
      image: Buffer.from('image'),
      mimeType: 'image/jpeg',
      venueName: 'Hall',
      cityName: 'Halifax',
      timezone: 'America/Halifax',
    })
    expect(result.extraction).toMatchObject({ isEvent: true, title: 'Show', confidence: 0.9 })
  })
})
