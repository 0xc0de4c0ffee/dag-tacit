#!/usr/bin/env bun
import { spawn } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const args = process.argv.slice(2)

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
  await run('bun', ['scripts/fetch-blocks.ts', ...args])
  await run('bun', ['scripts/build-dag.ts', ...args])
  await run('bun', ['scripts/create-car.ts', ...args])
} catch (e) {
  console.error(`\nfull pipeline failed: ${(e as Error).message}`)
  process.exit(1)
}
