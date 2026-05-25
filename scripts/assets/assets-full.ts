#!/usr/bin/env bun
import { spawn } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: bun run assets [options]

Run the full assets pipeline: dag -> car -> build.

Options:
  --force            Force rebuild all outputs
  --help, -h         Show this help`)
  process.exit(0)
}

function run(script: string, extraArgs: string[] = []): Promise<void> {
  return new Promise((resolveRun, reject) => {
    console.log(`\n$ bun ${script} ${extraArgs.join(' ')}`)
    const child = spawn('bun', [script, ...extraArgs], { cwd: ROOT, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolveRun()
      else reject(new Error(`bun ${script} exited with code ${code}`))
    })
  })
}

try {
  await run('scripts/assets/assets-dag.ts', args)
  await run('scripts/assets/assets-car.ts', args)
  await run('scripts/assets/assets-build.ts', args)
} catch (e) {
  console.error(`\nassets pipeline failed: ${(e as Error).message}`)
  process.exit(1)
}
