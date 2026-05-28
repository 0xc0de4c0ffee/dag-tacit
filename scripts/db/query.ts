#!/usr/bin/env bun
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { openDb } from './client.ts'
import * as s from './schema.ts'
import { eq, and, sql } from 'drizzle-orm'
import { existsSync, statSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

function usage() {
  console.log(`Usage: bun run db:utxo [command] [args]\n\nCommands:\n  stats                  Show DB summary\n  tx <txid>              Show transaction with vins/vouts\n  address <addr>         Show address activity\n  asset <asset_id>       Show asset details`)
  process.exit(0)
}

const argv = process.argv.slice(2)
const cmd = argv[0]
const outDir = (() => { const i = argv.indexOf('--out-dir'); return i >= 0 ? resolve(argv[i + 1]) : resolve(ROOT, 'out', 'sqlite') })()
const DB_PATH = resolve(outDir, 'dag-tacit.sqlite')
if (!cmd || cmd === 'help') usage()
if (!existsSync(DB_PATH)) { console.error(`DB not found`); process.exit(1) }

const db = openDb(DB_PATH)

switch (cmd) {
  case 'tx': {
    const txid = argv[1]
    if (!txid) { console.error('Usage: tx <txid>'); process.exit(1) }
    const tx = db.select().from(s.txs).where(eq(s.txs.txid, txid)).get()
    if (!tx) { console.log(`TX ${txid} not found`); break }
    console.log(`\nTX ${txid} (id=${tx.id})`)
    console.log(`  Block: #${tx.height}, Index: ${tx.index}`)
    console.log(`  Fee: ${tx.fee} sat, Version: ${tx.version}, Locktime: ${tx.locktime}`)
    if (tx.envelopeValid) {
      console.log(`  Opcode: ${tx.opcode} (0x${tx.opcodeByte?.toString(16).padStart(2, '0')})`)
      if (tx.assetId) {
        const a = db.select({ assetId: s.assets.assetId }).from(s.assets).where(eq(s.assets.id, tx.assetId)).get()
        if (a) console.log(`  Asset: ${a.assetId.slice(0, 32)}…`)
      }
      if (tx.payloadHex) console.log(`  Payload: ${tx.payloadHex.length / 2} B`)
      if (tx.mintValid === 1) console.log(`  Mint: VALID`)
      else if (tx.mintValid === 0) console.log(`  Mint: CAP OVERFLOW`)
    }
    const vins = db.select().from(s.vins).where(eq(s.vins.txId, tx.id)).orderBy(s.vins.vinIndex).all()
    for (const v of vins) {
      const p = v.txidPrev ? `${v.txidPrev.slice(0, 16)}…:${v.voutPrev}` : 'coinbase'
      console.log(`  Vin #${v.vinIndex}: ${p}  val=${v.value}  addr=${v.prevoutAddress || '—'}`)
      if (v.witness1) console.log(`    witness[1]=${v.witness1.slice(0, 40)}…`)
    }
    const vouts = db.select().from(s.vouts).where(eq(s.vouts.txId, tx.id)).orderBy(s.vouts.voutIndex).all()
    for (const v of vouts) {
      const spender = v.spentInTxId
        ? ` SPENT→${db.select({ txid: s.txs.txid }).from(s.txs).where(eq(s.txs.id, v.spentInTxId)).get()?.txid.slice(0, 16) || ''}…`
        : ' UNSPENT'
      const tTag = v.isTacit ? ` [TACIT]` : ''
      console.log(`  Vout #${v.voutIndex}: ${v.value} sat  ${v.address}${tTag}${spender}`)
    }
    break
  }

  case 'address': {
    const addr = argv[1]
    if (!addr) { console.error('Usage: address <addr>'); process.exit(1) }
    const fromVouts = db.select({
      txId: s.vouts.txId, role: sql<string>`'output'`.as('role'),
    }).from(s.vouts).where(eq(s.vouts.address, addr)).all()
    const fromVins = db.select({
      txId: s.vins.txId, role: sql<string>`'input'`.as('role'),
    }).from(s.vins).where(eq(s.vins.prevoutAddress, addr)).all()
    const rows = [...fromVouts, ...fromVins].sort((a, b) => a.txId - b.txId)
    if (!rows.length) { console.log(`No activity for ${addr}`) }
    else {
      console.log(`\n${addr}: ${rows.length} entries`)
      const seen = new Set<number>()
      for (const r of rows) {
        if (seen.has(r.txId)) continue
        seen.add(r.txId)
        const tx = db.select({ txid: s.txs.txid, opcode: s.txs.opcode }).from(s.txs).where(eq(s.txs.id, r.txId)).get()
        const tag = tx?.opcode ? ` [${tx.opcode}]` : ''
        console.log(`  ${(tx?.txid || '?').slice(0, 32)}…  ${r.role}${tag}`)
      }
    }
    break
  }

  case 'asset': {
    const aid = argv[1]
    if (!aid) { console.error('Usage: asset <asset_id>'); process.exit(1) }
    const asset = db.select({ id: s.assets.id }).from(s.assets).where(eq(s.assets.assetId, aid)).get()
    if (!asset) { console.log(`Asset ${aid} not found`); break }
    const a = db.select({
      assetId: s.assets.assetId, ticker: s.assets.ticker, decimals: s.assets.decimals,
      kind: s.assets.kind, isMintable: s.assets.isMintable,
      mintAuthority: s.assets.mintAuthority, commitC: s.assets.commitC,
      amountCt: s.assets.amountCt, imageUri: s.assets.imageUri,
      capAmount: s.assets.capAmount, mintLimit: s.assets.mintLimit,
      mintedCount: s.assets.mintedCount,
      etchTxid: s.txs.txid,
      etchHeight: s.txs.height,
      etchTime: s.blocks.time,
    }).from(s.assets).innerJoin(s.txs, eq(s.assets.etchTxId, s.txs.id)).innerJoin(s.blocks, eq(s.txs.height, s.blocks.height)).where(eq(s.assets.id, asset.id)).get()
    if (a) {
      console.log(`\n${a.ticker} (${aid.slice(0, 20)}…)`)
      console.log(`  Kind: ${a.kind}, Decimals: ${a.decimals}, Mintable: ${a.isMintable}`)
      if (a.mintAuthority) console.log(`  MintAuth: ${a.mintAuthority.slice(0, 20)}…`)
      if (a.imageUri) console.log(`  Image: ${a.imageUri}`)
      if (a.etchTxid) console.log(`  Etch TX: ${a.etchTxid.slice(0, 32)}…`)
      if (a.kind === 't_petch') {
        console.log(`  Cap: ${a.capAmount}  Mint limit: ${a.mintLimit}`)
        const pct = a.capAmount ? ((a.mintedCount ?? 0) * (a.mintLimit ?? 1) / a.capAmount * 100).toFixed(1) : '?'
        const remaining = a.capAmount ? a.capAmount - (a.mintedCount ?? 0) * (a.mintLimit ?? 1) : 0
        console.log(`  Minted: ${a.mintedCount}  (${pct}% of cap, ${remaining} remaining)`)
        if (a.etchTime) console.log(`  Mint start: ${new Date((a.etchTime + 600) * 1000).toISOString().slice(0, 19)} (etch block)`)
        if (remaining <= 0 && a.mintedCount && a.mintedCount > 0) {
          const last = db.select({ t: s.txs.height }).from(s.txs).where(
            and(eq(s.txs.assetId, asset.id), eq(s.txs.mintValid, 1))
          ).orderBy(s.txs.id, 'desc').limit(1).get()
          if (last) {
            const lastBlock = db.select({ time: s.blocks.time }).from(s.blocks).where(eq(s.blocks.height, last.t)).get()
            if (lastBlock) console.log(`  Mint filled: ${new Date(lastBlock.time * 1000).toISOString().slice(0, 19)}`)
          }
        }
        const invalid = db.select({ c: sql<number>`COUNT(*)` }).from(s.txs).where(and(eq(s.txs.assetId, asset.id), eq(s.txs.mintValid, 0))).get()
        if (invalid?.c) console.log(`  Cap overflows: ${invalid.c}`)
      }
      const vouts = db.select({ txid: s.txs.txid }).from(s.vouts).innerJoin(s.txs, eq(s.vouts.txId, s.txs.id)).where(eq(s.vouts.assetId, asset.id)).limit(5).all()
      if (vouts.length) console.log(`  Recent UTXOs: ${vouts.length}`)
      if (vouts.length) console.log(`  Recent UTXOs: ${vouts.length}`)
    } else { console.log(`Asset ${aid} not found`); const a2 = db.select().from(s.assets).where(sql`asset_id LIKE ${aid + '%'}`).all(); if (a2.length) for (const x of a2) console.log(`  ${x.ticker}: ${x.assetId.slice(0, 20)}…`) }
    break
  }

  case 'stats': {
    const b = db.select({ c: sql<number>`COUNT(*)` }).from(s.blocks).get()
    const t = db.select({ c: sql<number>`COUNT(*)` }).from(s.txs).get()
    const vi = db.select({ c: sql<number>`COUNT(*)` }).from(s.vins).get()
    const vo = db.select({ c: sql<number>`COUNT(*)` }).from(s.vouts).get()
    const a = db.select({ c: sql<number>`COUNT(*)` }).from(s.assets).get()
    const addrs = db.select({ c: sql<number>`COUNT(DISTINCT ${s.vouts.address})` }).from(s.vouts).get()
    const size = statSync(DB_PATH).size
    console.log(`\n${DB_PATH}  (${(size / 1024 / 1024).toFixed(1)} MB)`)
    console.log(`  Blocks:   ${b?.c}\n  TXs:      ${t?.c}\n  Vins:     ${vi?.c}\n  Vouts:    ${vo?.c}\n  Assets:   ${a?.c}\n  Addresses: ${addrs?.c}`)
    break
  }

  default: usage()
}
