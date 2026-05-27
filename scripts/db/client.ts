import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema.ts'

export function openDb(path = ':memory:'): ReturnType<typeof drizzle> {
  const sqlite = new Database(path)
  sqlite.run('PRAGMA journal_mode = WAL')
  sqlite.run('PRAGMA foreign_keys = ON')
  return drizzle({ client: sqlite, schema })
}
