import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function runMigrations(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  const dir = path.join(process.cwd(), 'drizzle')
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  )
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const apply = sqlite.transaction((name: string, sql: string) => {
    sqlite.exec(sql)
    sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
  })
  for (const file of files) {
    if (applied.has(file)) continue
    apply(file, readFileSync(path.join(dir, file), 'utf8'))
  }
  sqlite.close()
}
