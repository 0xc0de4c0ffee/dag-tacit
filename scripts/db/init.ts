#!/usr/bin/env bun
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Run drizzle-kit migrations
const { spawnSync } = await import('child_process')
const r = spawnSync('bun', [resolve(__dirname, 'migrate.ts')], { cwd: resolve(__dirname, '../..'), stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)
