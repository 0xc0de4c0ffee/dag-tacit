#!/usr/bin/env bun
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Database } from 'bun:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const MIGRATIONS_DIR = resolve(ROOT, 'drizzle')

const cliArgs = process.argv.slice(2)
const force = cliArgs.includes('--force')
const outDir = (() => {
  const i = cliArgs.indexOf('--out-dir')
  return i >= 0 ? resolve(cliArgs[i + 1]) : resolve(ROOT, 'out', 'sqlite')
})()
const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')

const JOURNAL = resolve(MIGRATIONS_DIR, 'meta', '_journal.json')
function getApplied(): Set<string> {
  if (!existsSync(JOURNAL)) return new Set()
  const j = JSON.parse(readFileSync(JOURNAL, 'utf8'))
  return new Set<string>((j.entries || []).map((e: any) => e.tag))
}

const ALL_TABLES = ['tx_addresses', 'vouts', 'vins', 'assets', 'txs', 'blocks']

export function dropTables(db: Database): void {
  db.run('PRAGMA foreign_keys = OFF')
  for (const t of ALL_TABLES) {
    db.run(`DROP TABLE IF EXISTS ${t}`)
  }
  // Also drop indexes
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all() as { name: string }[]
  for (const idx of indexes) {
    db.run(`DROP INDEX IF EXISTS ${idx.name}`)
  }
}

function main() {
  mkdirSync(resolve(DB_PATH, '..'), { recursive: true })
  const db = new Database(DB_PATH)
  db.run('PRAGMA journal_mode = WAL')
  const applied = getApplied()

  if (force) {
    dropTables(db)
    // Reset journal by deleting the entries
    const metaDir = resolve(MIGRATIONS_DIR, 'meta')
    if (existsSync(metaDir)) {
      const files = readdirSync(metaDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        rmSync(resolve(metaDir, f))
      }
    }
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (!force && applied.has(file)) continue
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
    const statements = sql.split('--> statement-breakpoint')
    for (const stmt of statements) {
      const s = stmt.trim()
      if (!s) continue
      try {
        db.run(s)
      } catch (e: any) {
        // Gracefully handle "already exists" errors
        if (e.message?.includes('already exists')) continue
        throw e
      }
    }
    if (!applied.has(file)) applied.add(file)
    console.log(`  ${force ? '↻' : '✓'} ${file}`)
  }

  db.close()
  console.log(`Migrations: ${files.length} files${force ? ' (forced)' : ''}`)
}

main()
