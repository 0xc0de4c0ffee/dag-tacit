// CAR file creation and range root building
// Per dag-tacit SPEC Sections 11-12

import { CID } from 'multiformats/cid'
import { encodeNode, link } from './dag-cbor.mjs'

const SCHEMA_VERSION = 1
const TACIT_GENESIS_HEIGHT = 948242

/**
 * Build the tacit block CID index (SPEC Section 12)
 * @param {Map<number, CID>} blockIndex - Map from tacit_block index to Block CID
 * @returns {{cid: CID, bytes: Uint8Array, node: Object}}
 */
export function buildBlockIndex(blockIndex) {
  const node = {}
  for (const [tacitBlock, cid] of blockIndex) {
    node[String(tacitBlock)] = link(cid)
  }
  const encoded = encodeNode(node)
  return { ...encoded, node }
}

/**
 * Build the range root (SPEC Section 11)
 * @param {Object} params
 * @param {number} params.genesisHeight - Fixed Tacit genesis height
 * @param {number} params.fromHeight - Minimum bitcoin_block height
 * @param {number} params.toHeight - Maximum bitcoin_block height
 * @param {number} params.tacitBlockCount - Count of Block nodes
 * @param {number} params.tacitTxCount - Sum of all tacit_tx_count
 * @param {CID} params.blockIndexCid - CID of tacit block CID index
 * @returns {{cid: CID, bytes: Uint8Array, node: Object}}
 */
export function buildRangeRoot({
  genesisHeight,
  fromHeight,
  toHeight,
  tacitBlockCount,
  tacitTxCount,
  blockIndexCid
}) {
  const node = {
    v: SCHEMA_VERSION,
    genesis_height: genesisHeight,
    from: fromHeight,
    to: toHeight,
    tacit_block_count: tacitBlockCount,
    tacit_tx_count: tacitTxCount,
    tacit_block_index: link(blockIndexCid)
  }
  const encoded = encodeNode(node)
  return { ...encoded, node }
}

/**
 * Create a CAR file header (CAR v1 spec)
 * @param {CID} rootCid
 * @returns {Uint8Array}
 */
function createCarHeader(rootCid) {
  const header = encodeNode({ roots: [rootCid], version: 1 })
  const headerLen = header.bytes.length
  const lenVarint = encodeVarint(headerLen)
  const buf = new Uint8Array(lenVarint.length + headerLen)
  buf.set(lenVarint, 0)
  buf.set(header.bytes, lenVarint.length)
  return buf
}

/**
 * Create a CAR file entry (varint length + CID + data)
 * @param {CID} cid
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function createCarEntry(cid, data) {
  const cidBytes = cid.bytes
  const totalLen = cidBytes.length + data.length
  
  // Encode varint for total length
  const varintBuf = encodeVarint(totalLen)
  
  const buf = new Uint8Array(varintBuf.length + cidBytes.length + data.length)
  let offset = 0
  buf.set(varintBuf, offset)
  offset += varintBuf.length
  buf.set(cidBytes, offset)
  offset += cidBytes.length
  buf.set(data, offset)
  return buf
}

/**
 * Encode a number as a varint
 * @param {number} value
 * @returns {Uint8Array}
 */
function encodeVarint(value) {
  const bytes = []
  while (value > 127) {
    bytes.push((value & 0x7f) | 0x80)
    value = value >>> 7
  }
  bytes.push(value)
  return new Uint8Array(bytes)
}

function assembleCarFile(rootCid, entries) {
  const header = createCarHeader(rootCid)
  
  let totalLen = header.length
  for (const entry of entries) totalLen += entry.length
  
  const carFile = new Uint8Array(totalLen)
  let offset = 0
  carFile.set(header, offset)
  offset += header.length
  for (const entry of entries) {
    carFile.set(entry, offset)
    offset += entry.length
  }
  
  return carFile
}

function collectBlockEntries(blockCid, blockBytes, cids, writtenCids = new Set()) {
  const entries = []
  if (!writtenCids.has(blockCid.toString())) {
    entries.push(createCarEntry(blockCid, blockBytes))
    writtenCids.add(blockCid.toString())
  }
  
  const txsCid = cids.get('txs').cid
  if (!writtenCids.has(txsCid.toString())) {
    entries.push(createCarEntry(txsCid, cids.get('txs').bytes))
    writtenCids.add(txsCid.toString())
  }
  
  for (const [key, { cid, bytes }] of cids) {
    if (key === 'block' || key === 'txs') continue
    if (!writtenCids.has(cid.toString())) {
      entries.push(createCarEntry(cid, bytes))
      writtenCids.add(cid.toString())
    }
  }
  
  return entries
}

export function buildBlockCarFile(processedBlock) {
  const block = processedBlock.cids.get('block')
  const entries = collectBlockEntries(block.cid, block.bytes, processedBlock.cids)
  return assembleCarFile(block.cid, entries)
}

/**
 * Build a complete CAR file from processed blocks
 * @param {Array<{blockCid: CID, cids: Map<string, {cid: CID, bytes: Uint8Array}>}>} processedBlocks
 * @returns {Uint8Array} - Complete CAR file bytes
 */
export function buildCarFile(processedBlocks) {
  if (processedBlocks.length === 0) {
    throw new Error('No blocks to write to CAR')
  }
  
  const rebasedBlocks = []
  let prevBlockCid = null
  
  for (let i = 0; i < processedBlocks.length; i++) {
    const { cids } = processedBlocks[i]
    const original = cids.get('block').node
    const node = {
      ...original,
      tacit_block: i,
      prev: prevBlockCid ? link(prevBlockCid) : null
    }
    const { cid, bytes } = encodeNode(node)
    rebasedBlocks.push({ ...processedBlocks[i], blockCid: cid, blockBytes: bytes, blockNode: node })
    prevBlockCid = cid
  }
  
  // Build block index
  const blockIndex = new Map()
  let tacitTxCount = 0
  let fromHeight = Infinity
  let toHeight = 0
  
  for (let i = 0; i < rebasedBlocks.length; i++) {
    const { blockCid, blockNode } = rebasedBlocks[i]
    
    blockIndex.set(i, blockCid)
    tacitTxCount += blockNode.tacit_tx_count
    
    const height = blockNode.bitcoin_block
    fromHeight = Math.min(fromHeight, height)
    toHeight = Math.max(toHeight, height)
  }
  
  // Build index and range root
  const { cid: indexCid, bytes: indexBytes, node: indexNode } = buildBlockIndex(blockIndex)
  const { cid: rootCid, bytes: rootBytes, node: rootNode } = buildRangeRoot({
    genesisHeight: TACIT_GENESIS_HEIGHT,
    fromHeight,
    toHeight,
    tacitBlockCount: processedBlocks.length,
    tacitTxCount,
    blockIndexCid: indexCid
  })
  
  const writtenCids = new Set()
  const entries = []
  
  // Write range root first
  entries.push(createCarEntry(rootCid, rootBytes))
  writtenCids.add(rootCid.toString())
  
  // Write block index
  entries.push(createCarEntry(indexCid, indexBytes))
  writtenCids.add(indexCid.toString())
  
  for (const { blockCid, blockBytes, cids } of rebasedBlocks) {
    entries.push(...collectBlockEntries(blockCid, blockBytes, cids, writtenCids))
  }
  
  return assembleCarFile(rootCid, entries)
}
