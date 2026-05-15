import { CID } from 'multiformats/cid'
import { encodeNode, link } from './dag-cbor.ts'
import type { ProcessedBlock, BlockIndex, RangeRoot, CarMeta, Block } from './types.ts'

const SCHEMA_VERSION = 1
const TACIT_GENESIS_HEIGHT = 948242

interface BlockIndexResult {
  cid: CID
  bytes: Uint8Array
  node: BlockIndex
}

interface RangeRootResult {
  cid: CID
  bytes: Uint8Array
  node: RangeRoot
}

/**
 * Build the block index (SPEC Section 12)
 */
export function buildBlockIndex(blockIndex: Map<number, CID>): BlockIndexResult {
  const node: BlockIndex = {}
  for (const [tacitBlock, cid] of blockIndex) {
    node[String(tacitBlock)] = link(cid)
  }
  const encoded = encodeNode(node)
  return { cid: encoded.cid, bytes: encoded.bytes, node }
}

/**
 * Build the range root (SPEC Section 11)
 */
export function buildRangeRoot({
  genesisHeight,
  fromHeight,
  toHeight,
  tacitBlockCount,
  tacitTxCount,
  blockIndexCid
}: {
  genesisHeight: number
  fromHeight: number
  toHeight: number
  tacitBlockCount: number
  tacitTxCount: number
  blockIndexCid: CID
}): RangeRootResult {
  const node: RangeRoot = {
    v: SCHEMA_VERSION,
    genesis: genesisHeight,
    from: fromHeight,
    to: toHeight,
    blocks: tacitBlockCount,
    tx: tacitTxCount,
    index: link(blockIndexCid)
  }
  const encoded = encodeNode(node)
  return { cid: encoded.cid, bytes: encoded.bytes, node }
}

function createCarHeader(rootCid: CID): Uint8Array {
  const header = encodeNode({ roots: [rootCid], version: 1 })
  const headerLen = header.bytes.length
  const lenVarint = encodeVarint(headerLen)
  const buf = new Uint8Array(lenVarint.length + headerLen)
  buf.set(lenVarint, 0)
  buf.set(header.bytes, lenVarint.length)
  return buf
}

function createCarEntry(cid: CID, data: Uint8Array): Uint8Array {
  const cidBytes = cid.bytes
  const totalLen = cidBytes.length + data.length
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

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  while (value > 127) {
    bytes.push((value & 0x7f) | 0x80)
    value = value >>> 7
  }
  bytes.push(value)
  return new Uint8Array(bytes)
}

function assembleCarFile(rootCid: CID, entries: Uint8Array[]): Uint8Array {
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

function collectBlockEntries(blockCid: CID, blockBytes: Uint8Array, cids: ProcessedBlock['cids'], writtenCids = new Set<string>()): Uint8Array[] {
  const entries: Uint8Array[] = []
  if (!writtenCids.has(blockCid.toString())) {
    entries.push(createCarEntry(blockCid, blockBytes))
    writtenCids.add(blockCid.toString())
  }

  const txsEntry = cids.get('txs')!
  if (!writtenCids.has(txsEntry.cid.toString())) {
    entries.push(createCarEntry(txsEntry.cid, txsEntry.bytes))
    writtenCids.add(txsEntry.cid.toString())
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

export function buildBlockCarFile(processedBlock: ProcessedBlock): Uint8Array {
  const block = processedBlock.cids.get('block')!
  const entries = collectBlockEntries(block.cid, block.bytes, processedBlock.cids)
  return assembleCarFile(block.cid, entries)
}

/**
 * Build a complete CAR file from processed blocks
 */
export function buildCarFile(processedBlocks: ProcessedBlock[]): Uint8Array {
  if (processedBlocks.length === 0) {
    throw new Error('No blocks to write to CAR')
  }

  const rebasedBlocks: (ProcessedBlock & { blockNode: Block })[] = []
  let prevBlockCid: CID | null = null

  for (let i = 0; i < processedBlocks.length; i++) {
    const { cids } = processedBlocks[i]
    const blockEntry = cids.get('block')!
    if (!('node' in blockEntry)) throw new Error('block entry missing node')
    const original = blockEntry.node as Block
    const node: Block = {
      ...original,
      block: i,
      parent: prevBlockCid ? link(prevBlockCid) : null
    }
    const { cid, bytes } = encodeNode(node)
    rebasedBlocks.push({ ...processedBlocks[i], blockCid: cid, blockBytes: bytes, blockNode: node })
    prevBlockCid = cid
  }

  // Build block index
  const blockIndex = new Map<number, CID>()
  let tacitTxCount = 0
  let fromHeight = Infinity
  let toHeight = 0

  for (let i = 0; i < rebasedBlocks.length; i++) {
    const { blockCid, blockNode } = rebasedBlocks[i]
    blockIndex.set(i, blockCid)
    tacitTxCount += blockNode.tx
    const height = blockNode.height
    fromHeight = Math.min(fromHeight, height)
    toHeight = Math.max(toHeight, height)
  }

  // Build index and range root
  const { cid: indexCid, bytes: indexBytes } = buildBlockIndex(blockIndex)
  const { cid: rootCid, bytes: rootBytes } = buildRangeRoot({
    genesisHeight: TACIT_GENESIS_HEIGHT,
    fromHeight,
    toHeight,
    tacitBlockCount: processedBlocks.length,
    tacitTxCount,
    blockIndexCid: indexCid
  })

  const writtenCids = new Set<string>()
  const entries: Uint8Array[] = []

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
