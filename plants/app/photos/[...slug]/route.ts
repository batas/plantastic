import { NextResponse, type NextRequest } from 'next/server'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { getPhotosDir } from '@/lib/settings'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/photos/[...slug]'>) {
  const { slug } = await ctx.params
  const segments = Array.isArray(slug) ? slug : [slug]
  const rel = path.join(...segments)
  if (rel.includes('..')) return new NextResponse('forbidden', { status: 403 })
  const filePath = path.join(getPhotosDir(), rel)
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext]
  if (!mime) return new NextResponse('unsupported', { status: 415 })
  const stream = createReadStream(filePath)
  stream.on('error', () => {})
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
