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
      if (tx.assetId) console.log(`  Asset: ${tx.assetId.slice(0, 32)}…`)
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
    const rows = db.select().from(s.txAddresses).where(eq(s.txAddresses.address, addr)).orderBy(s.txAddresses.txId).all()
    if (!rows.length) { console.log(`No activity for ${addr}`) }
    else {
      console.log(`\n${addr}: ${rows.length} entries`)
      for (const r of rows) {
        const tx = db.select().from(s.txs).where(eq(s.txs.id, r.txId)).get()
        const tag = tx?.opcode ? ` [${tx.opcode}]` : ''
        console.log(`  ${(tx?.txid || '?').slice(0, 32)}…  ${r.role}${tag}`)
      }
    }
    break
  }

  case 'asset': {
    const aid = argv[1]
    if (!aid) { console.error('Usage: asset <asset_id>'); process.exit(1) }
    const a = db.select({
      assetId: s.assets.assetId, ticker: s.assets.ticker, decimals: s.assets.decimals,
      kind: s.assets.kind, isMintable: s.assets.isMintable,
      mintAuthority: s.assets.mintAuthority, commitC: s.assets.commitC,
      amountCt: s.assets.amountCt, etchHeight: s.assets.etchHeight,
      etchTime: s.assets.etchTime, imageUri: s.assets.imageUri,
      etchTxid: s.txs.txid,
      capAmount: s.assets.capAmount, mintLimit: s.assets.mintLimit,
      mintedCount: s.assets.mintedCount,
    }).from(s.assets).innerJoin(s.txs, eq(s.assets.etchTxId, s.txs.id)).where(eq(s.assets.assetId, aid)).get()
    if (a) {
      console.log(`\n${a.ticker} (${aid.slice(0, 20)}…)`)
      console.log(`  Kind: ${a.kind}, Decimals: ${a.decimals}, Mintable: ${a.isMintable}`)
      if (a.mintAuthority) console.log(`  MintAuth: ${a.mintAuthority.slice(0, 20)}…`)
      if (a.imageUri) console.log(`  Image: ${a.imageUri}`)
      if (a.etchTxid) console.log(`  Etch TX: ${a.etchTxid.slice(0, 32)}…`)
      if (a.kind === 't_petch') {
        console.log(`  Cap: ${a.capAmount}  Mint limit: ${a.mintLimit}`)
        console.log(`  Minted: ${a.mintedCount}  (${a.capAmount ? ((a.mintedCount ?? 0) * (a.mintLimit ?? 1) / a.capAmount * 100).toFixed(1) : '?'}% of cap)`)
        const invalid = db.select({ c: sql<number>`COUNT(*)` }).from(s.txs).where(and(eq(s.txs.assetId, aid), eq(s.txs.mintValid, 0))).get()
        if (invalid?.c) console.log(`  Cap overflows: ${invalid.c}`)
      }
      const vouts = db.select({ txid: s.txs.txid }).from(s.vouts).innerJoin(s.txs, eq(s.vouts.txId, s.txs.id)).where(eq(s.vouts.assetId, aid)).limit(5).all()
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
    const addr = db.select({ c: sql<number>`COUNT(DISTINCT ${s.txAddresses.address})` }).from(s.txAddresses).get()
    const size = statSync(DB_PATH).size
    console.log(`\n${DB_PATH}  (${(size / 1024 / 1024).toFixed(1)} MB)`)
    console.log(`  Blocks:   ${b?.c}\n  TXs:      ${t?.c}\n  Vins:     ${vi?.c}\n  Vouts:    ${vo?.c}\n  Assets:   ${a?.c}\n  Addresses: ${addr?.c}`)
    break
  }

  default: usage()
}
