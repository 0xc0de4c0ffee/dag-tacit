// DAG node builders per dag-tacit SPEC Sections 5-8

import { CID } from 'multiformats/cid'
import { encodeNode, link, hexToBytes, btcToSatoshis } from './dag-cbor.mjs'
import { extractTacitPayload } from './envelope.mjs'

const SCHEMA_VERSION = 1

/**
 * Build a VinEntry node (SPEC Section 7)
 * @param {Object} vin - Bitcoin vin from RPC
 * @returns {Object} VinEntry
 */
export function buildVinEntry(vin) {
  const witness = vin.txinwitness || []
  const witnessBytes = witness.map(w => hexToBytes(w))
  
  // Convert prevout value to satoshis
  const prevoutValue = vin.prevout ? btcToSatoshis(vin.prevout.value || 0) : 0
  const prevoutScript = vin.prevout?.scriptPubKey?.hex 
    ? hexToBytes(vin.prevout.scriptPubKey.hex) 
    : new Uint8Array(0)
  
  return {
    v: SCHEMA_VERSION,
    txid: vin.txid ? hexToBytes(vin.txid) : new Uint8Array(32), // 32 zero octets for coinbase
    vout: vin.vout || 0,
    sequence: vin.sequence || 0,
    witness: witnessBytes,
    script_sig: vin.scriptSig?.hex ? hexToBytes(vin.scriptSig.hex) : new Uint8Array(0),
    value: prevoutValue,
    prevout_script_pubkey: prevoutScript
  }
}

/**
 * Build a VoutEntry node (SPEC Section 8)
 * @param {Object} vout - Bitcoin vout from RPC
 * @returns {Object} VoutEntry
 */
export function buildVoutEntry(vout) {
  return {
    v: SCHEMA_VERSION,
    value: btcToSatoshis(vout.value || 0),
    script_pub_key: vout.scriptPubKey?.hex ? hexToBytes(vout.scriptPubKey.hex) : new Uint8Array(0)
  }
}

/**
 * Build a Tx node (SPEC Section 6)
 * @param {Object} tx - Bitcoin transaction from RPC
 * @param {number} txIndex - Index in block
 * @param {CID} vinCid - CID of vin array
 * @param {CID} voutCid - CID of vout array
 * @returns {Object} Tx node value (before CID computation)
 */
export function buildTxNode(tx, txIndex, vinCid, voutCid) {
  return {
    v: SCHEMA_VERSION,
    tx_index: txIndex,
    txid: hexToBytes(tx.txid),
    fee: btcToSatoshis(tx.fee || 0),
    version: tx.version || 0,
    locktime: tx.locktime || 0,
    vin: link(vinCid),
    vout: link(voutCid)
  }
}

/**
 * Build a Block node (SPEC Section 5)
 * @param {Object} block - Bitcoin block from RPC
 * @param {number} tacitBlockIndex - Zero-based index in tacit chain
 * @param {CID|null} prevCid - CID of previous Block or null
 * @param {CID} txsCid - CID of transactions array
 * @param {number} tacitTxCount - Number of tacit transactions
 * @returns {Object} Block node value (before CID computation)
 */
export function buildBlockNode(block, tacitBlockIndex, prevCid, txsCid, tacitTxCount) {
  return {
    bitcoin_block: block.height,
    block_hash: hexToBytes(block.hash),
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
 * @param {Object} block - Bitcoin block from RPC
 * @param {number} tacitBlockIndex - Zero-based tacit block index
 * @param {CID|null} prevBlockCid - CID of previous block
 * @returns {{
 *   blockCid: CID,
 *   blockBytes: Uint8Array,
 *   tacitTxCount: number,
 *   cids: Map<string, {cid: CID, bytes: Uint8Array}>
 * } | null}
 */
export function processBlock(block, tacitBlockIndex, prevBlockCid) {
  // Find all transactions with valid Tacit envelopes
  const tacitTxs = []
  for (let i = 0; i < block.tx.length; i++) {
    const tx = block.tx[i]
    const result = extractTacitPayload(tx)
    if (result.ok) {
      tacitTxs.push({ tx, txIndex: Number.isInteger(tx.tx_index) ? tx.tx_index : i, payload: result.payload })
    }
  }
  
  if (tacitTxs.length === 0) return null
  
  const cids = new Map()
  const txCids = []
  
  // Build Tx nodes with their vin/vout arrays
  for (const { tx, txIndex } of tacitTxs) {
    // Build vin entries array
    const vinEntries = tx.vin.map(buildVinEntry)
    const { cid: vinCid, bytes: vinBytes } = encodeNode(vinEntries)
    cids.set(`vin-${tx.txid}`, { cid: vinCid, bytes: vinBytes })
    
    // Build vout entries array
    const voutEntries = tx.vout.map(buildVoutEntry)
    const { cid: voutCid, bytes: voutBytes } = encodeNode(voutEntries)
    cids.set(`vout-${tx.txid}`, { cid: voutCid, bytes: voutBytes })
    
    // Build Tx node
    const txNode = buildTxNode(tx, txIndex, vinCid, voutCid)
    const { cid: txCid, bytes: txBytes } = encodeNode(txNode)
    cids.set(`tx-${tx.txid}`, { cid: txCid, bytes: txBytes, node: txNode })
    txCids.push(txCid)
  }
  
  // Build transactions array
  const { cid: txsCid, bytes: txsBytes } = encodeNode(txCids)
  cids.set('txs', { cid: txsCid, bytes: txsBytes })
  
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
