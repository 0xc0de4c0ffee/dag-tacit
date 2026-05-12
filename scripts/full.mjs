#!/usr/bin/env node
import { spawn } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const args = process.argv.slice(2)

function run(command, args) {
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
  await run('bun', ['scripts/fetch-blocks.mjs', ...args])
  await run('bun', ['scripts/build-dag.mjs', ...args])
  await run('bun', ['scripts/create-car.mjs', ...args])
} catch (e) {
  console.error(`\nfull pipeline failed: ${e.message}`)
  process.exit(1)
}
