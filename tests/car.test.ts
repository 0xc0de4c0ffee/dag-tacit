import { describe, expect, test } from 'bun:test'
import { CarReader } from '@ipld/car'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { buildBlockCarFile, buildBlockIndex, buildCarFile, buildRangeRoot } from '../src/blocks/blocks-car.ts'
import { processBlock } from '../src/blocks/blocks-nodes.ts'
import type { BitcoinBlock } from '../src/types.ts'

function envelopeScript(opcodeHex = '21'): string {
  return `20${'11'.repeat(32)}ac00630554414349544c010101${opcodeHex}68`
}

function block(height: number, txidByte: string, opcode = '21'): BitcoinBlock {
  return {
    height,
    hash: txidByte.repeat(32),
    time: 1778117538 + height,
    nTx: 1,
    tx: [{
      txid: txidByte.repeat(32),
      fee: 0,
      version: 2,
      locktime: 0,
      vin: [{ txid: 'aa'.repeat(32), vout: 0, txinwitness: ['00', envelopeScript(opcode)], sequence: 0xffffffff }],
      vout: [{ value: 0, scriptPubKey: { hex: '' } }]
    }]
  }
}

describe('range root, block index, and CAR', () => {
  test('builds Section 12 block index with decimal string keys', () => {
    const a = processBlock(block(1, '01'), 0, null)
    const b = processBlock(block(2, '02'), 1, a!.blockCid)
    const idx = buildBlockIndex(new Map([[0, a!.blockCid], [1, b!.blockCid]]))
    const decoded = dagCbor.decode(idx.bytes) as Record<string, CID>
    expect(Object.keys(decoded)).toEqual(['0', '1'])
  })

  test('builds Section 11 range root with exact fields', () => {
    const a = processBlock(block(1, '01'), 0, null)
    const idx = buildBlockIndex(new Map([[0, a!.blockCid]]))
    const root = buildRangeRoot({ genesisHeight: 948242, fromHeight: 100, toHeight: 200, tacitBlockCount: 5, tacitTxCount: 12, blockIndexCid: idx.cid })
    const decoded = dagCbor.decode(root.bytes) as Record<string, unknown>
    expect(new Set(Object.keys(decoded))).toEqual(new Set(['v', 'genesis', 'from', 'to', 'blocks', 'tx', 'index']))
    expect(decoded.v).toBe(1)
    expect(decoded.genesis).toBe(948242)
    expect(decoded.from).toBe(100)
    expect(decoded.to).toBe(200)
    expect(decoded.blocks).toBe(5)
    expect(decoded.tx).toBe(12)
    expect(decoded.index).toBeInstanceOf(CID)
  })

  test('builds non-empty CAR bytes from processed blocks', () => {
    const a = processBlock(block(1, '01'), 0, null)
    const car = buildCarFile([a!])
    expect(car.length).toBeGreaterThan(0)
  })

  test('single block CAR root is the Block node without a range wrapper', async () => {
    const prev = processBlock(block(9, '09'), 3, null)
    const a = processBlock(block(10, '01'), 4, prev!.blockCid)
    const car = buildBlockCarFile(a!)
    const reader = await CarReader.fromBytes(car)
    const roots = await reader.getRoots()
    expect(roots).toHaveLength(1)

    const rootBlock = await reader.get(roots[0])
    expect(rootBlock).toBeDefined()
    const decoded = dagCbor.decode(rootBlock!.bytes) as Record<string, unknown>
    const blockEntry = a!.cids.get('block')!
    expect('node' in blockEntry).toBe(true)
    if ('node' in blockEntry) expect(Object.keys(blockEntry.node as object)).toEqual(['height', 'hash', 'parent', 'block', 'tx', 'time', 'txs', 'v'])
    expect(new Set(Object.keys(decoded))).toEqual(new Set(['height', 'hash', 'parent', 'block', 'tx', 'time', 'txs', 'v']))
    expect(decoded.block).toBe(4)
    expect((decoded.parent as CID).toString()).toBe(prev!.blockCid.toString())
    expect(decoded.height).toBe(10)
    expect(decoded.hash).toBeInstanceOf(Uint8Array)
    expect(decoded.txs).toBeDefined()
    expect(decoded.index).toBeUndefined()
  })

  test('CAR root, block index, and rebased block nodes satisfy Sections 11 and 12', async () => {
    const a = processBlock(block(10, '01'), 0, null)
    const b = processBlock(block(11, '02'), 1, a!.blockCid)
    const car = buildCarFile([a!, b!])
    const reader = await CarReader.fromBytes(car)
    const roots = await reader.getRoots()
    expect(roots).toHaveLength(1)

    const rootBlock = await reader.get(roots[0])
    expect(rootBlock).toBeDefined()
    const root = dagCbor.decode(rootBlock!.bytes) as Record<string, unknown>
    expect(root.genesis).toBe(948242)
    expect(root.from).toBe(10)
    expect(root.to).toBe(11)
    expect(root.blocks).toBe(2)
    expect(root.tx).toBe(2)

    const indexBlock = await reader.get(root.index as CID)
    expect(indexBlock).toBeDefined()
    const index = dagCbor.decode(indexBlock!.bytes) as Record<string, CID>
    expect(Object.keys(index)).toEqual(['0', '1'])

    const firstBlockEntry = await reader.get(index['0'])
    expect(firstBlockEntry).toBeDefined()
    const firstBlock = dagCbor.decode(firstBlockEntry!.bytes) as Record<string, unknown>
    const secondBlockEntry = await reader.get(index['1'])
    expect(secondBlockEntry).toBeDefined()
    const secondBlock = dagCbor.decode(secondBlockEntry!.bytes) as Record<string, unknown>
    expect(firstBlock.block).toBe(0)
    expect(firstBlock.parent).toBeNull()
    expect(secondBlock.block).toBe(1)
    expect((secondBlock.parent as CID).toString()).toBe(index['0'].toString())
  })
})
