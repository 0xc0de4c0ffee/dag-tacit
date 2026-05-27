#!/usr/bin/env bun
import { writeFileSync, existsSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './client.ts'
import * as s from './schema.ts'
import { sql } from 'drizzle-orm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

async function main() {
  const args = process.argv.slice(2)
  const outDir = (() => {
    const i = args.indexOf('--out-dir')
    return i >= 0 ? resolve(args[i + 1]) : resolve(ROOT, 'out', 'sqlite')
  })()
  const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Export dag-tacit database for browser/D1 replication.

Options:
  --out-dir <path>   Output directory (default: out/sqlite/)
  --sql              Export as SQL dump (for browser SQL.js or D1 migration)
  --json             Export as JSON snapshot (for any consumer)
  --d1               Export as D1-compatible SQL (same as --sql)
  --help, -h         Show this help

Default: --sql`)
    process.exit(0)
  }

  if (!existsSync(DB_PATH)) { console.error('Run "bun run db:import" first'); process.exit(1) }

  const fmtSql = args.includes('--sql') || args.includes('--d1') || !args.length
  const fmtJson = args.includes('--json')
  const db = openDb(DB_PATH)

  // Fetch all rows using raw SQL to avoid type issues
  const fetchTable = (table: string) => db.all(sql`SELECT * FROM ${sql.identifier(table)} ORDER BY rowid`)

  const tables = ['blocks', 'txs', 'vins', 'vouts', 'assets'] as const
  const data: Record<string, any[]> = {}
  for (const t of tables) {
    try { data[t] = fetchTable(t) } catch (e) { console.error(`  ⚠ failed to fetch table ${t}:`, e); data[t] = [] }
  }

  if (fmtJson) {
    const out = resolve(outDir, 'dag-tacit-export.json')
    const json = JSON.stringify(data, (key, val) => {
      if (val instanceof Uint8Array) return Buffer.from(val).toString('hex')
      return val
    }, 2)
    writeFileSync(out, json)
    console.log(`JSON: ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`)
  }

  if (fmtSql) {
    const out = resolve(outDir, 'dag-tacit-export.sql')
    const dbSize = statSync(DB_PATH).size
    let sql = `-- dag-tacit DB export (${(dbSize / 1024 / 1024).toFixed(1)} MB)\n`
    sql += `-- Exported: ${new Date().toISOString()}\n\nPRAGMA foreign_keys = OFF;\n\n`

    for (const t of tables) {
      const rows = data[t]
      if (!rows.length) continue
      const cols = Object.keys(rows[0])
      sql += `DELETE FROM ${t};\n`
      for (const row of rows) {
        const vals = cols.map(c => {
          const v = (row as any)[c]
          if (v === null || v === undefined) return 'NULL'
          if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`
          if (typeof v === 'number') return String(v)
          return `'${String(v).replace(/'/g, "''")}'`
        })
        sql += `INSERT INTO ${t}(${cols.join(',')}) VALUES(${vals.join(',')});\n`
      }
      sql += '\n'
    }

    sql += `PRAGMA foreign_keys = ON;\n`
    writeFileSync(out, sql)
    const lines = sql.split('\n').length
    console.log(`SQL:  ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${lines} lines)`)
  }
}

main()
