import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function runMigrations(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 10000')
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  const dir = path.join(process.cwd(), 'drizzle')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  const applyAll = sqlite.transaction(() => {
    const applied = new Set(
      (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
    )
    for (const file of files) {
      if (applied.has(file)) continue
      sqlite.exec(readFileSync(path.join(dir, file), 'utf8'))
      sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    }
  })
  applyAll.immediate()
  sqlite.close()
}
