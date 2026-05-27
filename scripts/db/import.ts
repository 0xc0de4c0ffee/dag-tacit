#!/usr/bin/env bun
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './client.ts'
import * as s from './schema.ts'
import { eq, and, sql } from 'drizzle-orm'
import { extractTacitPayload } from '../../src/lib/envelope.ts'
import { parseCetchPayload, parseTPetchPayload } from '../../src/assets/assets-parse.ts'
import { hexToBytes, deriveAssetId } from '../../src/lib/dag-cbor.ts'
import { tacitOutputCount } from '../../src/lib/utils.ts'
import type { BitcoinTx } from '../../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const argv = process.argv.slice(2)
const fromFlag = argv.includes('--from') ? parseInt(argv[argv.indexOf('--from') + 1]) : 0
const toFlag = argv.includes('--to') ? parseInt(argv[argv.indexOf('--to') + 1]) : 0
const force = argv.includes('--force')
const outDir = (() => { const i = argv.indexOf('--out-dir'); return i >= 0 ? resolve(argv[i + 1]) : resolve(ROOT, 'out', 'sqlite') })()
const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')
const BLOCKS_DIR = resolve(ROOT, 'out', 'tacit-blocks')

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: bun run db:import [options]\n\nImport tacit-block artifacts into SQLite.\n\nOptions:\n  --from <height>  Starting BTC block height\n  --to <height>    Ending BTC block height\n  --out-dir <path> Output directory (default: out/sqlite/)\n  --force          Re-import\n  --help           Show this help`)
  process.exit(0)
}

type RawBlock = { height: number; hash: string; previousblockhash: string | null; time: number; tx_count: number; tacit_count: number; txs: BitcoinTx[] }
type IndexEntry = { tacit_block: number; height: number; hash: string; time: number; tacit_count: number; file: string }

function hex(b: Uint8Array): string { return Buffer.from(b).toString('hex') }
function btcSat(btc: number): number { return Math.max(0, Math.floor(btc * 1e8 + 0.5)) }

if (!existsSync(resolve(BLOCKS_DIR, 'index.json'))) { console.error('Run "bun run fetch" first'); process.exit(1) }

// Only run migrations on first import or forced re-import
const { spawnSync } = await import('child_process')
if (force || !existsSync(DB_PATH)) {
  const ma = [resolve(__dirname, 'migrate.ts')]
  if (force) ma.push('--force')
  if (outDir !== resolve(ROOT, 'out', 'sqlite')) ma.push('--out-dir', outDir)
  const mr = spawnSync('bun', ma, { cwd: ROOT, stdio: 'inherit' })
  if (mr.status !== 0) process.exit(mr.status ?? 1)
}

const db = openDb(DB_PATH)
const idx = JSON.parse(readFileSync(resolve(BLOCKS_DIR, 'index.json'), 'utf8')) as { blocks: IndexEntry[] }
let blks = idx.blocks
if (fromFlag) blks = blks.filter(b => b.height >= fromFlag)
let importedHeights: Set<number> | undefined
if (!fromFlag && !force) {
  importedHeights = new Set(
    db.select({ h: s.blocks.height }).from(s.blocks).all().map(r => r.h)
  )
  if (importedHeights.size) blks = blks.filter(b => !importedHeights!.has(b.height))
}
if (toFlag) blks = blks.filter(b => b.height <= toFlag)
if (!blks.length) {
  if (importedHeights?.size) {
    const idx2 = JSON.parse(readFileSync(resolve(BLOCKS_DIR, 'index.json'), 'utf8')) as { scanned_to?: number }
    const at = idx2.scanned_to ?? Math.max(...importedHeights)
    console.log(`Up to date at block #${at} (${importedHeights.size} tacit blocks, scanned to #${idx2.scanned_to ?? at})`)
  } else {
    console.log('No blocks match range')
  }
  process.exit(0)
}
console.log(`Importing ${blks.length} blocks`)
const logEvery = Math.max(1, Math.floor(blks.length / 20))

let bc = 0, tc = 0, vc = 0, voc = 0, ac = 0, addrc = 0
const t0 = Date.now()

// Track per-asset mint counts for cap validation
const mintCounts = new Map<string, number>()
for (const row of db.select({ assetId: s.assets.assetId, mintedCount: s.assets.mintedCount }).from(s.assets).all()) {
  mintCounts.set(row.assetId, row.mintedCount ?? 0)
}

db.run('BEGIN TRANSACTION')
try {
  for (const entry of blks) {
    const p = resolve(BLOCKS_DIR, entry.file)
    if (!existsSync(p)) continue
    const raw = JSON.parse(readFileSync(p, 'utf8')) as RawBlock

    db.insert(s.blocks).values({
      height: entry.height, hash: raw.hash,
      time: raw.time, block: entry.tacit_block, tx: raw.tacit_count, nTx: raw.tx_count,
    }).onConflictDoNothing().run()
    bc++
    if (bc % logEvery === 0) {
      const rate = (bc / ((Date.now() - t0) / 1000)).toFixed(1)
      console.log(`  #${entry.height}  +${raw.tacit_count} envs  (${bc}/${blks.length}) ${rate} blk/s`)
    }
    let bt: number | undefined
    if (raw.tacit_count > 100 || raw.tx_count > 5000) {
      bt = Date.now()
      console.log(`  ⏳ #${entry.height}: ${raw.tacit_count} envs, ${raw.tx_count} txs — processing…`)
    }

    for (const tx of raw.txs) {
      const fee = typeof tx.fee === 'number' ? (tx.fee > 1e6 ? tx.fee : btcSat(tx.fee)) : 0
      const env = extractTacitPayload(tx)
      const witness1 = tx.vin?.[0]?.txinwitness?.[1] || ''

      // Check if tx already imported BEFORE any state mutations (idempotent re-runs)
      const existing = db.select({ id: s.txs.id }).from(s.txs).where(eq(s.txs.txid, tx.txid)).get()
      if (existing) { tc++; continue }

      let opcode = '', opcodeByte: number | undefined, payloadHex = '', assetId: string | null = null, n = 0
      let mintValid: number | null = null
      if (env.ok && env.payload) {
        opcode = env.opcode
        opcodeByte = env.payload[0]
        payloadHex = hex(env.payload)
        n = tacitOutputCount(env.payload[0], env.payload)
        // asset_id derivation: SHA256(etch_txid_LE || vout_LE) per §4
        if (env.payload[0] === 0x21 || env.payload[0] === 0x27) {
          assetId = hex(deriveAssetId(tx.txid))
        } else {
          assetId = env.payload.length > 33 ? hex(env.payload.slice(1, 33)) : null
        }

        // Cap validation for T_PMINT — only for new txs
        if (opcodeByte === 0x28 && assetId) {
          const assetRow = mintCounts.get(assetId)
          if (assetRow !== undefined) {
            const assetCheck = db.select({
              cap: s.assets.capAmount, lim: s.assets.mintLimit,
            }).from(s.assets).where(eq(s.assets.assetId, assetId)).get()
            if (assetCheck?.cap && assetCheck?.lim) {
              const nextMint = assetRow + 1
              mintValid = nextMint * assetCheck.lim <= assetCheck.cap ? 1 : 0
              if (mintValid) mintCounts.set(assetId, nextMint)
            }
          }
        }
      }

      const txResult = db.insert(s.txs).values({
        txid: tx.txid, height: entry.height, index: tx.tx_index ?? 0,
        version: tx.version ?? 2, locktime: tx.locktime ?? 0, fee,
        envelopeValid: env.ok ? 1 : 0, opcode, opcodeByte, assetId, payloadHex, mintValid,
      }).run()
      const txId = Number(txResult.lastInsertRowid)
      tc++

      // Vins — one row per input
      for (let vi = 0; vi < tx.vin.length; vi++) {
        const v = tx.vin[vi]
        db.insert(s.vins).values({
          txId, vinIndex: vi,
          txidPrev: v.txid || null, voutPrev: v.vout ?? null,
          sequence: v.sequence ?? 0xffffffff,
          value: v.prevout ? btcSat(v.prevout.value) : null,
          prevout: v.prevout?.scriptPubKey?.hex || null,
          prevoutAddress: v.prevout?.scriptPubKey?.address || null,
          sig: v.scriptSig?.hex || null,
          witnessCount: v.txinwitness?.length ?? 0,
          witness0: v.txinwitness?.[0] || null,
          witness1: v.txinwitness?.[1] || null,
          witness2: v.txinwitness?.[2] || null,
        }).run()
        vc++
      }

      // Vouts — one row per output
      for (let vo = 0; vo < tx.vout.length; vo++) {
        const o = tx.vout[vo]
        const isTacit = vo < n ? 1 : 0
        const isCetchOrPetch = env.ok && (env.payload[0] === 0x21 || env.payload[0] === 0x27)
        const voutAsset = isTacit && isCetchOrPetch
          ? hex(deriveAssetId(tx.txid))
          : isTacit ? assetId : null

        // Compute commitment C — only reliable for CETCH (variable offset after ticker)
        let commitmentC: string | null = null
        if (isTacit && env.ok && env.payload[0] === 0x21 && env.payload.length > 3) {
          const cl = env.payload[1]
          const commOff = 1 + 1 + cl + 1
          if (commOff + 33 <= env.payload.length) {
            commitmentC = hex(env.payload.slice(commOff, commOff + 33))
          }
        }

        db.insert(s.vouts).values({
          txId, voutIndex: vo,
          value: btcSat(o.value), pubkey: o.scriptPubKey?.hex || null,
          address: o.scriptPubKey?.address || null,
          scriptType: o.scriptPubKey?.type || null,
          isTacit, assetId: voutAsset,
          commitmentC,
        }).run()
        voc++
      }

      // Track spends: look up prevout tx by txid, mark its vouts as spent
      for (const vin of tx.vin) {
        if (vin.txid && typeof vin.vout === 'number') {
          const prevTx = db.select({ id: s.txs.id }).from(s.txs).where(eq(s.txs.txid, vin.txid)).get()
          if (prevTx) {
            db.update(s.vouts).set({ spent: 1, spentInTxId: txId })
              .where(and(eq(s.vouts.txId, prevTx.id), eq(s.vouts.voutIndex, vin.vout))).run()
          }
        }
      }

      // Asset definitions — CETCH (etch) and T_PETCH (cap-defined)
      if (env.ok && env.payload[0] === 0x21) {
        const asset = parseCetchPayload(tx.txid, env.payload, entry.height, raw.time)
        if (asset) {
          const isNonMintable = asset.mint_authority.every(b => b === 0)
          const etchTx = db.select({ id: s.txs.id }).from(s.txs).where(eq(s.txs.txid, tx.txid)).get()
          db.insert(s.assets).values({
            assetId: hex(asset.asset_id), ticker: asset.ticker, decimals: asset.decimals,
            kind: 'cetch', isMintable: isNonMintable ? 0 : 1,
            mintAuthority: isNonMintable ? null : hex(asset.mint_authority),
            commitC: hex(asset.commitment), amountCt: hex(asset.amountCt || new Uint8Array(8)),
            etchTxId: etchTx?.id ?? txId, etchHeight: entry.height, etchTime: raw.time,
            imageUri: asset.image_uri || null,
          }).onConflictDoNothing().run()
          ac++
        }
      } else if (env.ok && env.payload[0] === 0x27 && assetId) {
        const params = parseTPetchPayload(env.payload)
        if (params) {
          const existingAsset = db.select({ assetId: s.assets.assetId }).from(s.assets).where(eq(s.assets.assetId, assetId)).get()
          if (!existingAsset) {
            db.insert(s.assets).values({
              assetId, kind: 't_petch', ticker: params.ticker, decimals: params.decimals,
              capAmount: params.cap_amount, mintLimit: params.mint_limit,
              mintStartHeight: params.mintStartHeight || null,
              mintEndHeight: params.mintEndHeight || null,
              mintedCount: 0,
              etchTxId: txId, etchHeight: entry.height, etchTime: raw.time,
              imageUri: params.imageUri || null,
            }).run()
            ac++
          }
          mintCounts.set(assetId, mintCounts.get(assetId) ?? 0)
        }
      }

      // Address index
      const addrRows: typeof s.txAddresses.$inferInsert[] = []
      for (const vo of tx.vout) { const a = vo.scriptPubKey?.address; if (a) addrRows.push({ txId, address: a, role: 'output' }) }
      for (const vi of tx.vin) { const a = vi.prevout?.scriptPubKey?.address; if (a) addrRows.push({ txId, address: a, role: 'input' }) }
      if (addrRows.length) { db.insert(s.txAddresses).values(addrRows).onConflictDoNothing().run(); addrc += addrRows.length }
    }
    if (bt) {
      console.log(`  ✓ #${entry.height} done in ${((Date.now() - bt) / 1000).toFixed(1)}s`)
    }
  }
  db.run('COMMIT')
  // Update minted counts for T_PETCH assets
  for (const [assetId, count] of mintCounts) {
    const a = db.select({ kind: s.assets.kind }).from(s.assets).where(eq(s.assets.assetId, assetId)).get()
    if (a?.kind === 't_petch') {
      db.update(s.assets).set({ mintedCount: count }).where(eq(s.assets.assetId, assetId)).run()
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`Done: ${bc} blocks, ${tc} txs, ${vc} vins, ${voc} vouts, ${ac} assets, ${addrc} address entries in ${elapsed}s → ${DB_PATH}`)
} catch (e) { db.run('ROLLBACK'); console.error('Import failed:', e); process.exit(1) }
