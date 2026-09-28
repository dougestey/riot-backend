const DEFAULT_GRAPH_VERSION = 'v25.0'

export type InstagramMedia = {
  id: string
  caption?: string
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
  username?: string
}

export type InstagramDiscovery = {
  id: string
  username: string
  name?: string
  media?: {
    data?: InstagramMedia[]
    paging?: { cursors?: { before?: string; after?: string } }
  }
}

function instagramSettings() {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN
  const queryingUserId = process.env.META_INSTAGRAM_USER_ID
  if (!accessToken || !queryingUserId) {
    throw new Error('META_INSTAGRAM_ACCESS_TOKEN and META_INSTAGRAM_USER_ID are required')
  }
  return { accessToken, queryingUserId }
}

export async function discoverInstagramAccount(username: string): Promise<InstagramDiscovery> {
  const { accessToken, queryingUserId } = instagramSettings()
  const version = process.env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION
  const url = new URL(`https://graph.facebook.com/${version}/${queryingUserId}`)
  const target = username.replace(/^@/, '').trim()
  url.searchParams.set(
    'fields',
    `business_discovery.username(${target}){id,username,name,media_count,media.limit(25){id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username}}`,
  )

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await response.json()) as {
    business_discovery?: InstagramDiscovery
    error?: { message?: string }
  }
  if (!response.ok || body.error || !body.business_discovery) {
    throw new Error(body.error?.message || `Instagram discovery failed (${response.status})`)
  }
  return body.business_discovery
}
