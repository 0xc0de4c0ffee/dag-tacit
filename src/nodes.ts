import { CID } from 'multiformats/cid'
import { encodeNode, link, hexToBytes, btcToSatoshis, rawCid } from './dag-cbor.ts'
import { extractTacitPayload, hasTacitEnvelope } from './envelope.ts'
import type { BitcoinBlock, BitcoinVin, BitcoinVout, VinEntry, VoutEntry, Tx, Block, ProcessedBlock, CidMap } from './types.ts'

const SCHEMA_VERSION = 1

/**
 * Build a VinEntry node (SPEC Section 7)
 */
export function buildVinEntry(vin: BitcoinVin, witnessArrayCid: CID): VinEntry {
  const prevoutValue = vin.prevout ? btcToSatoshis(vin.prevout.value || 0) : 0
  const prevoutScript = vin.prevout?.scriptPubKey?.hex
    ? hexToBytes(vin.prevout.scriptPubKey.hex)
    : new Uint8Array(0)

  return {
    txid: vin.txid ? rawCid(hexToBytes(vin.txid)) : rawCid(new Uint8Array(32)),
    vout: vin.vout || 0,
    sequence: vin.sequence || 0,
    witness: link(witnessArrayCid),
    script_sig: vin.scriptSig?.hex ? hexToBytes(vin.scriptSig.hex) : new Uint8Array(0),
    value: prevoutValue,
    prevout_script_pubkey: prevoutScript
  }
}

/**
 * Build a VoutEntry node (SPEC Section 8)
 */
export function buildVoutEntry(vout: BitcoinVout): VoutEntry {
  return {
    value: btcToSatoshis(vout.value || 0),
    script_pub_key: vout.scriptPubKey?.hex ? hexToBytes(vout.scriptPubKey.hex) : new Uint8Array(0)
  }
}

/**
 * Build a Tx node (SPEC Section 6)
 */
export function buildTxNode(tx: { txid: string; fee?: number; version?: number; locktime?: number }, txIndex: number, vinArrayCid: CID, voutArrayCid: CID): Tx {
  return {
    tx_index: txIndex,
    txid: rawCid(hexToBytes(tx.txid)),
    fee: btcToSatoshis(tx.fee || 0),
    version: tx.version || 0,
    locktime: tx.locktime || 0,
    vin: link(vinArrayCid),
    vout: link(voutArrayCid)
  }
}

/**
 * Build a Block node (SPEC Section 5)
 */
export function buildBlockNode(block: BitcoinBlock, tacitBlockIndex: number, prevCid: CID | null, txsCid: CID, tacitTxCount: number): Block {
  return {
    bitcoin_block: block.height,
    block_hash: rawCid(hexToBytes(block.hash)),
    prev: prevCid ? link(prevCid) : null,
    tacit_block: tacitBlockIndex,
    tacit_tx_count: tacitTxCount,
    time: block.time,
    tx_count: block.nTx,
    txs: link(txsCid),
    v: SCHEMA_VERSION
  }
}

/**
 * Process a Bitcoin block and build all DAG nodes
 */
export function processBlock(block: BitcoinBlock, tacitBlockIndex: number, prevBlockCid: CID | null): ProcessedBlock | null {
  const tacitTxs: { tx: typeof block.tx[0]; txIndex: number; payload: Uint8Array }[] = []
  for (let i = 0; i < block.tx.length; i++) {
    const tx = block.tx[i]
    const w = tx.vin?.[0]?.txinwitness
    if (!w || !hasTacitEnvelope(w)) continue
    const result = extractTacitPayload(tx)
    if (result.ok) {
      tacitTxs.push({ tx, txIndex: typeof tx.tx_index === 'number' ? tx.tx_index : i, payload: result.payload })
    }
  }

  if (tacitTxs.length === 0) return null

  const cids: CidMap = new Map()
  const txCids: CID[] = []

  for (const { tx, txIndex } of tacitTxs) {
    // Build individual vin entries and collect their CIDs
    const vinEntryCids: CID[] = []
    for (let i = 0; i < tx.vin.length; i++) {
      const witness = tx.vin[i].txinwitness || []
      const witnessCids: CID[] = []
      for (let j = 0; j < witness.length; j++) {
        const wBytes = hexToBytes(witness[j])
        const { cid: wCid, bytes: wBlockBytes } = encodeNode(wBytes)
        cids.set(`witness-${tx.txid}-${i}-${j}`, { cid: wCid, bytes: wBlockBytes })
        witnessCids.push(wCid)
      }

      const { cid: witnessArrayCid, bytes: witnessArrayBytes } = encodeNode(witnessCids)
      cids.set(`witness-array-${tx.txid}-${i}`, { cid: witnessArrayCid, bytes: witnessArrayBytes })

      const vinNode = buildVinEntry(tx.vin[i], witnessArrayCid)
      const { cid: vinEntryCid, bytes: vinEntryBytes } = encodeNode(vinNode)
      cids.set(`vin-${tx.txid}-${i}`, { cid: vinEntryCid, bytes: vinEntryBytes, node: vinNode })
      vinEntryCids.push(vinEntryCid)
    }
    const { cid: vinArrayCid, bytes: vinArrayBytes } = encodeNode(vinEntryCids)
    cids.set(`vin-array-${tx.txid}`, { cid: vinArrayCid, bytes: vinArrayBytes })

    // Build individual vout entries and collect their CIDs
    const voutEntryCids: CID[] = []
    for (let i = 0; i < tx.vout.length; i++) {
      const voutNode = buildVoutEntry(tx.vout[i])
      const { cid: voutEntryCid, bytes: voutEntryBytes } = encodeNode(voutNode)
      cids.set(`vout-${tx.txid}-${i}`, { cid: voutEntryCid, bytes: voutEntryBytes, node: voutNode })
      voutEntryCids.push(voutEntryCid)
    }
    const { cid: voutArrayCid, bytes: voutArrayBytes } = encodeNode(voutEntryCids)
    cids.set(`vout-array-${tx.txid}`, { cid: voutArrayCid, bytes: voutArrayBytes })

    // Build Tx node
    const txNode = buildTxNode(tx, txIndex, vinArrayCid, voutArrayCid)
    const { cid: txCid, bytes: txBytes } = encodeNode(txNode)
    cids.set(`tx-${tx.txid}`, { cid: txCid, bytes: txBytes, node: txNode })
    txCids.push(txCid)

    // Store raw txid block
    const txidBytes = hexToBytes(tx.txid)
    const txidCid = rawCid(txidBytes)
    cids.set(`txid-${tx.txid}`, { cid: txidCid, bytes: txidBytes })
  }

  // Build transactions array
  const { cid: txsCid, bytes: txsBytes } = encodeNode(txCids)
  cids.set('txs', { cid: txsCid, bytes: txsBytes })

  // Store raw block_hash block
  const blockHashBytes = hexToBytes(block.hash)
  const blockHashCid = rawCid(blockHashBytes)
  cids.set('block-hash', { cid: blockHashCid, bytes: blockHashBytes })

  // Build Block node
  const blockNode = buildBlockNode(block, tacitBlockIndex, prevBlockCid, txsCid, tacitTxs.length)
  const { cid: blockCid, bytes: blockBytes } = encodeNode(blockNode)
  cids.set('block', { cid: blockCid, bytes: blockBytes, node: blockNode })

  return {
    blockCid,
    blockBytes,
    tacitTxCount: tacitTxs.length,
    cids
  }
}
