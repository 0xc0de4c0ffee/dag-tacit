#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from '../src/config.mjs'
import { createBitcoinRpcClient, fetchVerboseBlock } from '../src/rpc.mjs'
import { extractTacitPayload } from '../src/envelope.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const FIXTURE_DIR = resolve(ROOT, 'tests', 'fixtures')
mkdirSync(FIXTURE_DIR, { recursive: true })

const config = loadConfig(ROOT)
const rpc = createBitcoinRpcClient(config.bitcoinRpcUrl)
const heights = process.argv.slice(2).map(Number).filter(Number.isFinite)
const targets = heights.length ? heights : [948242]

for (const height of targets) {
  const block = await fetchVerboseBlock(rpc, height)
  const txs = []
  for (let i = 0; i < block.tx.length; i++) {
    const tx = block.tx[i]
    const decoded = extractTacitPayload(tx)
    if (!decoded.ok) continue
    txs.push({
      ...tx,
      tx_index: i,
      _tacit: {
        opcode: decoded.opcode,
        payload_hex: Buffer.from(decoded.payload).toString('hex')
      }
    })
  }
  const fixture = {
    height: block.height,
    hash: block.hash,
    previousblockhash: block.previousblockhash || null,
    time: block.time,
    tx_count: block.nTx,
    tacit_count: txs.length,
    txs
  }
  const out = resolve(FIXTURE_DIR, `mainnet-block-${height}.json`)
  writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n')
  console.log(`wrote ${out} (${txs.length} tacit txs)`)
}
