#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs'
import { basename, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { CarReader } from '@ipld/car'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CAR_DIR = resolve(ROOT, 'out', 'car')
const DEFAULT_API = 'http://127.0.0.1:5001'
const DEFAULT_GATEWAY = 'http://127.0.0.1:8080'

const argv = process.argv.slice(2)
const flags = new Map()
const positionals = []

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg.startsWith('-')) {
    const [key, inline] = arg.split('=', 2)
    if (inline !== undefined) flags.set(key, inline)
    else if (argv[i + 1] && !argv[i + 1].startsWith('-')) flags.set(key, argv[++i])
    else flags.set(key, true)
  } else {
    positionals.push(arg)
  }
}

const api = String(flags.get('--api') ?? process.env.IPFS_API_URL ?? DEFAULT_API).replace(/\/$/, '')
const gateway = String(flags.get('--gateway') ?? process.env.IPFS_GATEWAY_URL ?? DEFAULT_GATEWAY).replace(/\/$/, '')
const pinRoots = flags.get('--pin-roots') !== 'false'
const dryRun = flags.has('--dry-run')

function usage() {
  console.error(`Usage:
  bun run ipfs:import -- --block <height>
  bun run ipfs:import -- -b <height>
  bun run ipfs:import -- --range <start> <end>
  bun run ipfs:import -- -r <start>-<end>
  bun run ipfs:import -- --day <YYYY-MM-DD>
  bun run ipfs:import -- -d <YYYY-MM-DD>
  bun run ipfs:import -- --file <path.car>

Options:
  --api <url>          IPFS API URL, default ${DEFAULT_API}
  --gateway <url>      Gateway URL for printed root links, default ${DEFAULT_GATEWAY}
  --pin-roots=false    Do not pin imported roots
  --dry-run            Resolve and inspect CAR without importing`)
  process.exit(1)
}

export function carPathForArgs(flags, positionals, root = ROOT) {
  const carDir = resolve(root, 'out', 'car')
  const command = positionals[0]
  const commandValue = positionals[1]
  function readCarIndex() {
    const file = resolve(carDir, 'index.json')
    if (!existsSync(file)) throw new Error(`CAR index not found: ${file}`)
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  function findOne(cars, predicate, label) {
    const matches = cars.filter(predicate)
    if (matches.length !== 1) throw new Error(`Expected exactly one ${label} CAR, found ${matches.length}`)
    return resolve(carDir, matches[0].file)
  }
  function flag(...names) {
    for (const name of names) if (flags.has(name)) return flags.get(name)
    return undefined
  }
  function requireFlagValue(...names) {
    const value = flag(...names)
    if (!value || value === true) throw new Error(`Missing value for ${names.join('/')}`)
    return String(value)
  }
  function parseRange(value, fallbackEnd) {
    const text = String(value)
    if (text.includes('-')) {
      const [from, to] = text.split('-', 2).map(Number)
      return { from, to }
    }
    return { from: Number(text), to: Number(fallbackEnd) }
  }
  if (flags.has('--file') || flags.has('-f') || command === 'file') return resolve(root, flags.has('--file') || flags.has('-f') ? requireFlagValue('--file', '-f') : commandValue)
  if (flags.has('--block') || flags.has('-b') || command === 'block') {
    const height = flags.has('--block') || flags.has('-b') ? requireFlagValue('--block', '-b') : commandValue
    if (!height) throw new Error('Missing block height')
    const index = readCarIndex()
    return findOne(index.blocks || [], c => String(c.btc_from) === height && c.btc_from === c.btc_to, 'block')
  }
  if (flags.has('--range') || flags.has('-r') || command === 'range') {
    const value = flags.has('--range') || flags.has('-r') ? requireFlagValue('--range', '-r') : commandValue
    const fallbackEnd = flags.has('--range') || flags.has('-r') ? positionals[0] : positionals[2]
    const { from, to } = parseRange(value, fallbackEnd)
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('Missing range end')
    const index = readCarIndex()
    return findOne(index.range || [], c => c.btc_from <= from && c.btc_to >= to, 'range')
  }
  if (flags.has('--day') || flags.has('-d') || command === 'day') {
    const day = flags.has('--day') || flags.has('-d') ? requireFlagValue('--day', '-d') : commandValue
    if (!day) throw new Error('Missing day')
    const index = readCarIndex()
    return findOne(index.daily || [], c => c.day === day, 'daily')
  }
  throw new Error('Missing CAR selector')
}

export async function readRoots(file) {
  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
  const reader = await CarReader.fromBytes(bytes)
  const roots = await reader.getRoots()
  return roots.map(cid => cid.toString())
}

async function importCar(file) {
  const form = new FormData()
  form.append('file', Bun.file(file), basename(file))
  const params = new URLSearchParams()
  params.set('pin-roots', String(pinRoots))
  params.set('stats', 'true')
  const res = await fetch(`${api}/api/v0/dag/import?${params}`, {
    method: 'POST',
    body: form
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`IPFS import failed (${res.status}): ${body}`)
  return body.trim()
}

if (import.meta.url === `file://${process.argv[1]}`) try {
  const file = carPathForArgs(flags, positionals)
  if (!existsSync(file)) throw new Error(`CAR file not found: ${file}`)
  const roots = await readRoots(file)
  console.log(`[car] ${file}`)
  console.log(`[roots] ${roots.join(', ')}`)
  for (const root of roots) {
    console.log(`[dag-get] curl -X POST '${api}/api/v0/dag/get?arg=${root}'`)
    console.log(`[gateway] ${gateway}/ipfs/${root}`)
  }
  if (dryRun) process.exit(0)
  console.log(`[ipfs] importing via ${api} pinRoots=${pinRoots}`)
  const output = await importCar(file)
  if (output) console.log(output)
  console.log('[done] CAR imported')
} catch (e) {
  console.error(`[error] ${e.message}`)
  process.exit(1)
}
