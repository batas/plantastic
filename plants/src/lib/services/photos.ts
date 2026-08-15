import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { photos } from '@/lib/db/schema'
import { getPhotosDir } from '@/lib/settings'
import { addTimelineEntry } from './care'

export interface PhotoUploadInput {
  plantId: number
  file: File
  caption?: string
  addToTimeline?: boolean
}

const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.heif']

export async function savePhoto(input: PhotoUploadInput) {
  const dir = getPhotosDir()
  const plantDir = path.join(dir, String(input.plantId))
  mkdirSync(plantDir, { recursive: true })

  const id = randomUUID()
  const ext = path.extname(input.file.name).toLowerCase() || '.jpg'
  const buf = Buffer.from(await input.file.arrayBuffer())

  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error('Nieobsługiwany format zdjęcia. Wybierz JPG, PNG, WebP, GIF lub AVIF.')
  }

  const isHeic = ext === '.heic' || ext === '.heif'
  if (isHeic) {
    try {
      const converted = await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer()
      const filePath = path.join(/*turbopackIgnore: true*/ plantDir, `${id}.jpg`)
      writeFileSync(filePath, converted)
      const thumb = await sharp(converted).resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
      const thumbPath = path.join(/*turbopackIgnore: true*/ plantDir, `${id}-thumb.jpg`)
      writeFileSync(thumbPath, thumb)
      const rel = (p: string) => path.relative(dir, p).replaceAll(path.sep, '/')
      const res = db
        .insert(photos)
        .values({ plantId: input.plantId, path: rel(filePath), thumbPath: rel(thumbPath), caption: input.caption ?? null })
        .run()
      const photoId = Number(res.lastInsertRowid)
      if (input.addToTimeline) {
        await addTimelineEntry(input.plantId, { kind: 'photo', title: 'Zdjęcie', content: input.caption ?? undefined, photoId })
      }
      return photoId
    } catch (err) {
      if (err instanceof Error && /heif|heic|unsupported|decode/i.test(err.message)) {
        throw new Error('Format HEIC nie jest wspierany — wybierz JPG lub PNG.')
      }
      throw err
    }
  }

  const filePath = path.join(/*turbopackIgnore: true*/ plantDir, `${id}${ext}`)
  writeFileSync(filePath, buf)

  let thumbPath: string | null = null
  try {
    const thumb = await sharp(buf).rotate().resize(600, 600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
    const tp = path.join(/*turbopackIgnore: true*/ plantDir, `${id}-thumb.jpg`)
    writeFileSync(tp, thumb)
    thumbPath = path.relative(dir, tp).replaceAll(path.sep, '/')
  } catch (err) {
    console.warn('[photos] miniatura nieudana:', err)
  }

  const rel = (p: string) => path.relative(dir, p).replaceAll(path.sep, '/')

  const res = db
    .insert(photos)
    .values({
      plantId: input.plantId,
      path: rel(filePath),
      thumbPath,
      caption: input.caption ?? null,
    })
    .run()
  const photoId = Number(res.lastInsertRowid)

  if (input.addToTimeline) {
    await addTimelineEntry(input.plantId, {
      kind: 'photo',
      title: 'Zdjęcie',
      content: input.caption ?? undefined,
      photoId,
    })
  }
  return photoId
}
