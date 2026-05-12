import { describe, expect, test } from 'bun:test'
import { CarReader } from '@ipld/car'
import * as dagCbor from '@ipld/dag-cbor'
import { buildBlockCarFile, buildBlockIndex, buildCarFile, buildRangeRoot } from '../src/car.mjs'
import { processBlock } from '../src/nodes.mjs'

function envelopeScript(opcodeHex = '21') {
  return `20${'11'.repeat(32)}ac00630554414349544c010101${opcodeHex}68`
}

function block(height, txidByte, opcode = '21') {
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
    const b = processBlock(block(2, '02'), 1, a.blockCid)
    const idx = buildBlockIndex(new Map([[0, a.blockCid], [1, b.blockCid]]))
    const decoded = dagCbor.decode(idx.bytes)
    expect(Object.keys(decoded)).toEqual(['0', '1'])
  })

  test('builds Section 11 range root with exact fields', () => {
    const a = processBlock(block(1, '01'), 0, null)
    const idx = buildBlockIndex(new Map([[0, a.blockCid]]))
    const root = buildRangeRoot({ genesisHeight: 1, fromHeight: 1, toHeight: 1, tacitBlockCount: 1, tacitTxCount: 1, blockIndexCid: idx.cid })
    const decoded = dagCbor.decode(root.bytes)
    expect(new Set(Object.keys(decoded))).toEqual(new Set(['v', 'genesis_height', 'from', 'to', 'tacit_block_count', 'tacit_tx_count', 'tacit_block_index']))
    expect(decoded.v).toBe(1)
  })

  test('builds non-empty CAR bytes from processed blocks', () => {
    const a = processBlock(block(1, '01'), 0, null)
    const car = buildCarFile([a])
    expect(car.length).toBeGreaterThan(0)
  })

  test('single block CAR root is the Block node without a range wrapper', async () => {
    const prev = processBlock(block(9, '09'), 3, null)
    const a = processBlock(block(10, '01'), 4, prev.blockCid)
    const car = buildBlockCarFile(a)
    const reader = await CarReader.fromBytes(car)
    const roots = await reader.getRoots()
    expect(roots).toHaveLength(1)

    const rootBlock = await reader.get(roots[0])
    const decoded = dagCbor.decode(rootBlock.bytes)
    expect(Object.keys(a.cids.get('block').node)).toEqual(['bitcoin_block', 'block_hash', 'prev', 'tacit_block', 'tacit_tx_count', 'time', 'tx_count', 'txs', 'v'])
    expect(new Set(Object.keys(decoded))).toEqual(new Set(['bitcoin_block', 'block_hash', 'prev', 'tacit_block', 'tacit_tx_count', 'time', 'tx_count', 'txs', 'v']))
    expect(decoded.tacit_block).toBe(4)
    expect(decoded.prev.toString()).toBe(prev.blockCid.toString())
    expect(decoded.bitcoin_block).toBe(10)
    expect(Buffer.from(decoded.block_hash).toString('hex')).toBe('01'.repeat(32))
    expect(decoded.txs).toBeDefined()
    expect(decoded.tacit_block_index).toBeUndefined()
  })

  test('CAR root, block index, and rebased block nodes satisfy Sections 11 and 12', async () => {
    const a = processBlock(block(10, '01'), 0, null)
    const b = processBlock(block(11, '02'), 1, a.blockCid)
    const car = buildCarFile([a, b])
    const reader = await CarReader.fromBytes(car)
    const roots = await reader.getRoots()
    expect(roots).toHaveLength(1)

    const rootBlock = await reader.get(roots[0])
    const root = dagCbor.decode(rootBlock.bytes)
    expect(root.genesis_height).toBe(948242)
    expect(root.from).toBe(10)
    expect(root.to).toBe(11)
    expect(root.tacit_block_count).toBe(2)
    expect(root.tacit_tx_count).toBe(2)

    const indexBlock = await reader.get(root.tacit_block_index)
    const index = dagCbor.decode(indexBlock.bytes)
    expect(Object.keys(index)).toEqual(['0', '1'])

    const firstBlock = dagCbor.decode((await reader.get(index['0'])).bytes)
    const secondBlock = dagCbor.decode((await reader.get(index['1'])).bytes)
    expect(firstBlock.tacit_block).toBe(0)
    expect(firstBlock.prev).toBeNull()
    expect(secondBlock.tacit_block).toBe(1)
    expect(secondBlock.prev.toString()).toBe(index['0'].toString())
  })
})
