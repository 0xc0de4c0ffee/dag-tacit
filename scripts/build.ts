import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const dist = resolve(import.meta.dir, '..', 'dist')

// Step 1: bundle with Bun
console.log('[build] bundling...')
execSync('bun build src/index.ts --outdir dist --minify --sourcemap --target bun', { stdio: 'inherit' })

// Step 2: emit declarations with tsc
console.log('[build] emitting declarations...')
execSync('tsc', { stdio: 'inherit' })

// Step 3: rewrite .ts → .js in import paths within .d.ts
if (existsSync(dist)) {
  for (const f of readdirSync(dist)) {
    if (!f.endsWith('.d.ts')) continue
    const fp = resolve(dist, f)
    const content = readFileSync(fp, 'utf8')
    const updated = content.replace(/from '\.\/(.*)\.ts'/g, "from './$1.js'")
    if (content !== updated) {
      writeFileSync(fp, updated)
      console.log(`[build] patched ${f}`)
    }
  }
}

console.log('[build] done')
