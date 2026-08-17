import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { runMigrations } from './migrate'

export function getDataDir() {
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> }

function createDb() {
  const dir = getDataDir()
  const dbPath = path.join(dir, 'plants.db')
  runMigrations(dbPath)
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite)
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db
