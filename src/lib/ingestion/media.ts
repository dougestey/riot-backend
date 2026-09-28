import { extname } from 'node:path'

import type { PayloadRequest } from 'payload'

import type { InstagramMedia } from '@/lib/instagram'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com', '.instagram.com']

function assertAllowedMediaURL(value: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_HOST_SUFFIXES.some(
      (suffix) => url.hostname.endsWith(suffix) || url.hostname === suffix.slice(1),
    )
  ) {
    throw new Error('Instagram media URL host is not allowed')
  }
  return url
}

function extensionFor(url: URL, mimeType: string): string {
  const ext = extname(url.pathname).toLowerCase()
  if (/^\.(jpg|jpeg|png|webp|gif)$/.test(ext)) return ext
  if (mimeType.includes('png')) return '.png'
  if (mimeType.includes('webp')) return '.webp'
  if (mimeType.includes('gif')) return '.gif'
  return '.jpg'
}

export async function snapshotInstagramMedia(req: PayloadRequest, media: InstagramMedia) {
  const sourceKey = `instagram:${media.id}`
  const existing = await req.payload.find({
    collection: 'media',
    where: { 'source.sourceKey': { equals: sourceKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })

  const mediaURL = media.media_url || media.thumbnail_url
  if (!mediaURL) throw new Error('Instagram media has no downloadable image or thumbnail')
  const requestedURL = assertAllowedMediaURL(mediaURL)
  const response = await fetch(requestedURL, {
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`Instagram media download failed (${response.status})`)
  assertAllowedMediaURL(response.url)

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('Instagram image exceeds 15 MB')
  const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0]
  if (!mimeType.startsWith('image/')) throw new Error('Instagram media is not an image')
  const image = Buffer.from(await response.arrayBuffer())
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new Error('Instagram image is empty or exceeds 15 MB')
  }

  if (existing.docs[0]) {
    return { id: existing.docs[0].id, image, mimeType, created: false }
  }
  try {
    const created = await req.payload.create({
      collection: 'media',
      data: {
        alt: media.caption?.slice(0, 250) || `Instagram post by ${media.username || 'venue'}`,
        caption: media.caption?.slice(0, 1_000),
        credit: media.permalink || mediaURL,
        tags: ['instagram-import'],
        source: {
          sourceKey,
          platform: 'instagram',
          externalId: media.id,
          sourceUrl: mediaURL,
        },
      },
      file: {
        data: image,
        mimetype: mimeType,
        name: `instagram-${media.id}${extensionFor(requestedURL, mimeType)}`,
        size: image.length,
      },
      overrideAccess: true,
      req,
    })
    return { id: created.id, image, mimeType, created: true }
  } catch (error) {
    const winner = await req.payload.find({
      collection: 'media',
      where: { 'source.sourceKey': { equals: sourceKey } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
    if (!winner.docs[0]) throw error
    return { id: winner.docs[0].id, image, mimeType, created: false }
  }
}
