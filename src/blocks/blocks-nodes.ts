import { CID } from 'multiformats/cid'
import { encodeNode, link, hexToBytes, btcToSatoshis, bytesToHex } from '../lib/dag-cbor.ts'
import { extractTacitPayload, hasTacitEnvelope } from '../lib/envelope.ts'
import { SCHEMA_VERSION } from '../config.ts'
import { computeBlockChecksum, verifyPayload } from '../lib/verify.ts'
import type { BitcoinBlock, BitcoinVin, BitcoinVout, VinEntry, VoutEntry, Tx, Block, ProcessedBlock, CidMap, VerifyResult } from '../types.ts'

/**
 * Build a VinEntry node (SPEC Section 7)
 */
export function buildVinEntry(vin: BitcoinVin, witnessArrayCid: CID): VinEntry {
  const prevoutValue = vin.prevout ? btcToSatoshis(vin.prevout.value || 0) : 0
  const prevoutScript = vin.prevout?.scriptPubKey?.hex
    ? hexToBytes(vin.prevout.scriptPubKey.hex)
    : new Uint8Array(0)

  return {
    txid: vin.txid ? hexToBytes(vin.txid) : new Uint8Array(32),
    vout: vin.vout || 0,
    sequence: vin.sequence || 0,
    witness: link(witnessArrayCid),
    sig: vin.scriptSig?.hex ? hexToBytes(vin.scriptSig.hex) : new Uint8Array(0),
    value: prevoutValue,
    prevout: prevoutScript
  }
}

/**
 * Build a VoutEntry node (SPEC Section 8)
 */
export function buildVoutEntry(vout: BitcoinVout): VoutEntry {
  return {
    pubkey: hexToBytes(vout.scriptPubKey.hex || ''),
    value: btcToSatoshis(vout.value || 0)
  }
}

/**
 * Build a Tx node (SPEC Section 6)
 */
export function buildTxNode(tx: { txid: string; fee?: number; version?: number; locktime?: number }, txIndex: number, vinArrayCid: CID, voutArrayCid: CID, valid: boolean): Tx {
  return {
    index: txIndex,
    txid: hexToBytes(tx.txid),
    fee: btcToSatoshis(tx.fee || 0),
    version: tx.version || 0,
    locktime: tx.locktime || 0,
    vin: link(vinArrayCid),
    vout: link(voutArrayCid),
    valid
  }
}

/**
 * Build a Block node (SPEC Section 5)
 */
export function buildBlockNode(block: BitcoinBlock, tacitBlockIndex: number, prevCid: CID | null, txsCid: CID, tacitTxCount: number, checksum: Uint8Array): Block {
  return {
    height: block.height,
    hash: hexToBytes(block.hash),
    parent: prevCid ? link(prevCid) : null,
    block: tacitBlockIndex,
    tx: tacitTxCount,
    time: block.time,
    txs: link(txsCid),
    v: SCHEMA_VERSION,
    checksum
  }
}

/**
 * Process a Bitcoin block and build all DAG nodes
 *
 * @param prevChecksum - 32-byte checksum from the previous block (null for genesis)
 * @returns ProcessedBlock with verification results attached
 */
export function processBlock(block: BitcoinBlock, tacitBlockIndex: number, prevBlockCid: CID | null, prevChecksum?: Uint8Array | null): ProcessedBlock | null {
  const tacitTxs: { tx: typeof block.tx[0]; txIndex: number; payload: Uint8Array; verifyResult: VerifyResult }[] = []
  for (let i = 0; i < block.tx.length; i++) {
    const tx = block.tx[i]
    const w = tx.vin?.[0]?.txinwitness
    if (!w || !hasTacitEnvelope(w)) continue
    const envelope = extractTacitPayload(tx)
    if (envelope.ok) {
      const verifyResult = verifyPayload(envelope.opcode, envelope.payload, tx.txid, block.height)
      tacitTxs.push({ tx, txIndex: typeof tx.tx_index === 'number' ? tx.tx_index : i, payload: envelope.payload, verifyResult })
    }
  }

  if (tacitTxs.length === 0) return null

  // Build canonical JSON of tacit txs for checksum computation
  const txsJSON = JSON.stringify(tacitTxs.map(t => ({
    txid: t.tx.txid,
    index: t.txIndex,
    fee: t.tx.fee ?? 0,
    payload: bytesToHex(t.payload),
    verify: t.verifyResult,
  })))
  const checksum = computeBlockChecksum(prevChecksum ?? null, txsJSON)

  const cids: CidMap = new Map()
  const txCids: CID[] = []

  for (const { tx, txIndex, verifyResult } of tacitTxs) {
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

    // Build Tx node — valid only if ALL verification checks pass
    const txValid = !(
      verifyResult.commitmentValid === false ||
      verifyResult.issuerSigValid === false ||
      verifyResult.burnValid === false ||
      verifyResult.blindingValid === false
    )
    const txNode = buildTxNode(tx, txIndex, vinArrayCid, voutArrayCid, txValid)
    const { cid: txCid, bytes: txBytes } = encodeNode(txNode)
    cids.set(`tx-${tx.txid}`, { cid: txCid, bytes: txBytes, node: txNode })
    txCids.push(txCid)
  }

  // Build transactions array
  const { cid: txsCid, bytes: txsBytes } = encodeNode(txCids)
  cids.set('txs', { cid: txsCid, bytes: txsBytes })


  // Build Block node
  const blockNode = buildBlockNode(block, tacitBlockIndex, prevBlockCid, txsCid, tacitTxs.length, checksum)
  const { cid: blockCid, bytes: blockBytes } = encodeNode(blockNode)
  cids.set('block', { cid: blockCid, bytes: blockBytes, node: blockNode })

  return {
    blockCid,
    blockBytes,
    tacitTxCount: tacitTxs.length,
    cids,
    checksum,
    txVerifyResults: tacitTxs.map(t => t.verifyResult),
  }
}
