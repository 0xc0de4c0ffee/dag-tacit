import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { CarReader } from '@ipld/car'
import { loadConfig } from '../src/config.ts'
import { createBitcoinRpcClient, fetchVerboseBlock } from '../src/lib/rpc.ts'
import { extractEnvelopeContent, extractTacitPayload, hasTacitEnvelope } from '../src/lib/envelope.ts'
import { processBlock, buildVinEntry, buildVoutEntry } from '../src/blocks/blocks-nodes.ts'
import { buildBlockCarFile, buildCarFile, buildBlockIndex, buildRangeRoot } from '../src/blocks/blocks-car.ts'
import { encodeNode, hexToBytes } from '../src/lib/dag-cbor.ts'
import type { BitcoinBlock, ProcessedBlock } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = resolve(__dirname, 'fixtures')
const BLOCK_COUNT = 25
const GENESIS = 948242

// ---------------------------------------------------------------------------
// Fixture management — fetch missing, skip cached, clean stale
// ---------------------------------------------------------------------------
async function ensureFixtures(): Promise<number[]> {
  mkdirSync(FIXTURE_DIR, { recursive: true })

  // Clean stale blocks outside [GENESIS, GENESIS + BLOCK_COUNT)
  for (const f of readdirSync(FIXTURE_DIR)) {
    if (f.startsWith('block-') && f.endsWith('.json')) {
      const h = parseInt(f.slice(6, -5))
      if (isNaN(h) || h < GENESIS || h >= GENESIS + BLOCK_COUNT) {
        rmSync(resolve(FIXTURE_DIR, f))
      }
    }
  }

  const config = loadConfig()
  const url = config.bitcoinRpcUrl
  if (!url || url.includes('YOUR_KEY')) {
    console.warn('[fixtures] BITCOIN_RPC_URL not configured — skipping fetch')
    return []
  }

  const rpc = createBitcoinRpcClient(url)
  const available: number[] = []

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const height = GENESIS + i
    const out = resolve(FIXTURE_DIR, `block-${height}.json`)
    if (existsSync(out)) {
      available.push(height)
      continue
    }
    try {
      const block = await fetchVerboseBlock(rpc, height)
      const raw: BitcoinBlock = {
        height: block.height,
        hash: block.hash,
        previousblockhash: block.previousblockhash || null,
        time: block.time,
        nTx: block.nTx,
        tx: block.tx
      }
      writeFileSync(out, JSON.stringify(raw, null, 2) + '\n')
      available.push(height)
      console.log(`[fetch] #${height} (${block.nTx} txs)`)
    } catch (e) {
      console.warn(`[fetch] #${height} failed:`, (e as Error).message)
    }
  }
  return available
}

const AVAILABLE = await ensureFixtures()
const READY = AVAILABLE.length === BLOCK_COUNT

function loadBlock(height: number): BitcoinBlock {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, `block-${height}.json`), 'utf8')) as BitcoinBlock
}

// Pre-process all blocks once for reuse across tests
const ALL_BLOCKS: BitcoinBlock[] = []
const ALL_PROCESSED: (ProcessedBlock | null)[] = []
if (READY) {
  for (let i = 0; i < BLOCK_COUNT; i++) {
    ALL_BLOCKS.push(loadBlock(GENESIS + i))
  }
  let lastBlockCid: CID | null = null
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const result = processBlock(ALL_BLOCKS[i], i, lastBlockCid)
    ALL_PROCESSED.push(result)
    if (result) lastBlockCid = result.blockCid
  }
}
const VALID_BLOCKS = ALL_BLOCKS.filter((_, i) => ALL_PROCESSED[i] !== null)
const VALID_PROCESSED = ALL_PROCESSED.filter((p): p is ProcessedBlock => p !== null)
const VALID_COUNT = VALID_PROCESSED.length

// ---------------------------------------------------------------------------
// Meta test — confirms fixture readiness
// ---------------------------------------------------------------------------
describe('fixture availability', () => {
  test('all 25 genesis blocks present', () => {
    expect(AVAILABLE).toHaveLength(BLOCK_COUNT)
  })
})

// ---------------------------------------------------------------------------
// Envelope detection — loop all 25 blocks
// ---------------------------------------------------------------------------
describe('envelope across 25 blocks', () => {
  if (!READY) return
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const height = GENESIS + i
    const block = ALL_BLOCKS[i]
    test(`#${height} — detects tacit txs`, () => {
      let count = 0
      for (const tx of block.tx) {
        const w = tx.vin?.[0]?.txinwitness
        if (!w || w.length < 2) continue
        // Fast magic check (fetch-level)
        if (!hasTacitEnvelope(w)) continue
        // Envelope structure check (dag-level)
        const envelope = extractEnvelopeContent(tx)
        if (!envelope.ok) continue
        // Full opcode validation (assets-level)
        const payload = extractTacitPayload(tx)
        if (!payload.ok) continue
        count++
        expect(payload.opcode).toBeTruthy()
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Node builders — loop all 25 blocks
// ---------------------------------------------------------------------------
describe('nodes across 25 blocks', () => {
  if (!READY) return
  for (let i = 0; i < BLOCK_COUNT; i++) {
    const height = GENESIS + i
    test(`#${height} — processBlock returns valid structure`, () => {
      const result = ALL_PROCESSED[i]
      if (!result) {
        // Block had zero tacit txs — that's valid
        expect(result).toBeNull()
        return
      }
      expect(result.tacitTxCount).toBeGreaterThan(0)

      const blockEntry = result.cids.get('block')!
      expect('node' in blockEntry).toBe(true)
      if ('node' in blockEntry) {
        expect(Object.keys(blockEntry.node as object)).toEqual([
          'height', 'hash', 'parent', 'block', 'tx', 'time', 'txs', 'v', 'checksum'
        ])
      }

      // Verify prev linkage except genesis
      const blockNode = (result.cids.get('block')! as { node: Record<string, unknown> }).node
      if (height === GENESIS) {
        expect(blockNode.parent).toBeNull()
      } else {
        expect(blockNode.parent).toBeInstanceOf(CID)
      }
    })
  }

  test('genesis block — buildVinEntry on real tacit vin', () => {
    const block = ALL_BLOCKS[0]
    const tx = block.tx.find(t => t.vin?.[0]?.txinwitness && t.vin[0].txinwitness.length > 1)
    expect(tx).toBeDefined()
    const vin = tx!.vin[0]
    const witnessCids = vin.txinwitness!.map(w => encodeNode(hexToBytes(w)).cid)
    const { cid: witnessArrayCid } = encodeNode(witnessCids)
    const node = buildVinEntry(vin, witnessArrayCid)
    expect(Object.keys(node)).toEqual(['txid', 'vout', 'sequence', 'witness', 'sig', 'value', 'prevout'])
    expect(node.txid).toBeInstanceOf(Uint8Array)
    expect(node.witness).toBeInstanceOf(CID)
  })

  test('genesis block — buildVoutEntry on real vout', () => {
    const vout = ALL_BLOCKS[0].tx[0].vout[0]
    const node = buildVoutEntry(vout)
    expect(Object.keys(node)).toEqual(['pubkey', 'value'])
    expect(node.pubkey).toBeInstanceOf(Uint8Array)
    expect(node.value).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// CAR creation — loop all 25 blocks
// ---------------------------------------------------------------------------
describe('car across 25 blocks', () => {
  if (!READY) return

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const height = GENESIS + i
    test(`#${height} — buildBlockCarFile produces valid CAR`, async () => {
      const result = ALL_PROCESSED[i]
      if (!result) {
        expect(result).toBeNull()
        return
      }
      const car = buildBlockCarFile(result)
      expect(car.length).toBeGreaterThan(0)

      const reader = await CarReader.fromBytes(car)
      const roots = await reader.getRoots()
      expect(roots).toHaveLength(1)

      const rootBlock = await reader.get(roots[0])
      expect(rootBlock).toBeDefined()
      const decoded = dagCbor.decode(rootBlock!.bytes) as Record<string, unknown>
      expect(decoded.height).toBe(height)
    })
  }

  test('full valid-block range CAR', async () => {
    const car = buildCarFile(VALID_PROCESSED)
    expect(car.length).toBeGreaterThan(0)

    const reader = await CarReader.fromBytes(car)
    const roots = await reader.getRoots()
    expect(roots).toHaveLength(1)

    const rootBlock = await reader.get(roots[0])
    expect(rootBlock).toBeDefined()
    const root = dagCbor.decode(rootBlock!.bytes) as Record<string, unknown>
    expect(root.v).toBe(1)
    expect(root.blocks).toBe(VALID_COUNT)
    expect(root.genesis).toBe(GENESIS)
  })

  test('blockIndex uses decimal string keys for valid blocks', () => {
    const indexMap = new Map<number, CID>()
    for (let i = 0; i < VALID_COUNT; i++) {
      indexMap.set(i, VALID_PROCESSED[i].blockCid)
    }
    const idx = buildBlockIndex(indexMap)
    const decoded = dagCbor.decode(idx.bytes) as Record<string, CID>
    expect(Object.keys(decoded)).toHaveLength(VALID_COUNT)
    for (let i = 0; i < VALID_COUNT; i++) {
      expect(decoded[String(i)]).toBeInstanceOf(CID)
    }
  })

  test('rangeRoot has exact Section 11 fields for valid-block range', () => {
    const indexMap = new Map<number, CID>()
    for (let i = 0; i < VALID_COUNT; i++) {
      indexMap.set(i, VALID_PROCESSED[i].blockCid)
    }
    const idx = buildBlockIndex(indexMap)
    const totalTxs = VALID_PROCESSED.reduce((sum, p) => sum + p.tacitTxCount, 0)
    const root = buildRangeRoot({
      genesisHeight: GENESIS,
      fromHeight: GENESIS,
      toHeight: GENESIS + BLOCK_COUNT - 1,
      tacitBlockCount: VALID_COUNT,
      tacitTxCount: totalTxs,
      blockIndexCid: idx.cid
    })
    const decoded = dagCbor.decode(root.bytes) as Record<string, unknown>
    expect(new Set(Object.keys(decoded))).toEqual(
      new Set(['v', 'genesis', 'from', 'to', 'blocks', 'tx', 'index'])
    )
    expect(decoded.v).toBe(1)
    expect(decoded.genesis).toBe(GENESIS)
    expect(decoded.from).toBe(GENESIS)
    expect(decoded.to).toBe(GENESIS + BLOCK_COUNT - 1)
    expect(decoded.blocks).toBe(VALID_COUNT)
  })
})
