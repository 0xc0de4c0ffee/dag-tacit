#!/usr/bin/env bun
import { spawn } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: bun run full [options]

Run the full pipeline: fetch → create-car (CAR built inline during fetch).

DAG-CBOR JSON is NOT produced by default (debug only — use --dag flag
on a separate fetch run if needed).

All arguments are forwarded to fetch.

Options:
  --force            Force re-fetch, rebuild, and overwrite all outputs
  --debug            Include debug logs during fetch
  --help, -h         Show this help`)
  process.exit(0)
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    console.log(`\n$ ${command} ${args.join(' ')}`)
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

try {
  await run('bun', ['scripts/blocks/blocks-fetch.ts', '--car', ...args])
} catch (e) {
  console.error(`\nfull pipeline failed: ${(e as Error).message}`)
  process.exit(1)
}
