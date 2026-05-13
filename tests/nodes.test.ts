import { describe, expect, test } from 'bun:test'
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { encodeNode, hexToBytes } from '../src/dag-cbor.ts'
import { buildVinEntry, buildVoutEntry, processBlock } from '../src/nodes.ts'
import type { BitcoinBlock } from '../src/types.ts'

function envelopeScript(opcodeHex = '21'): string {
  const pubkey = '11'.repeat(32)
  return `20${pubkey}ac00630554414349544c010101${opcodeHex}68`
}

function fixtureBlock(): BitcoinBlock {
  return {
    height: 948242,
    hash: '00'.repeat(32),
    previousblockhash: '11'.repeat(32),
    time: 1778117538,
    nTx: 1,
    tx: [{
      txid: '22'.repeat(32),
      tx_index: 9,
      fee: 0.00000011,
      version: 2,
      locktime: 0,
      vin: [{
        txid: '33'.repeat(32),
        vout: 1,
        txinwitness: ['aa', envelopeScript('21')],
        scriptSig: { hex: '51' },
        prevout: { value: 0.00000123, scriptPubKey: { hex: '5120' + '44'.repeat(32) } },
        sequence: 4294967295
      }],
      vout: [{ value: 0.00000001, scriptPubKey: { hex: '5120' + '55'.repeat(32) } }]
    }]
  }
}

describe('DAG node builders', () => {
  test('builds VinEntry with exact Section 7 fields', () => {
    const vin = fixtureBlock().tx[0].vin[0]
    const witnessCids = vin.txinwitness!.map(w => encodeNode(hexToBytes(w)).cid)
    const { cid: witnessArrayCid } = encodeNode(witnessCids)
    const node = buildVinEntry(vin, witnessArrayCid)
    expect(Object.keys(node)).toEqual(['txid', 'vout', 'sequence', 'witness', 'script_sig', 'value', 'prevout_script_pubkey'])
    expect(node.value).toBe(123)
    expect(node.witness).toBeInstanceOf(CID)
    expect(node.txid).toBeInstanceOf(CID)
  })

  test('builds VoutEntry with exact Section 8 fields', () => {
    const vout = fixtureBlock().tx[0].vout[0]
    const node = buildVoutEntry(vout)
    expect(Object.keys(node)).toEqual(['value', 'script_pub_key'])
    expect(node.value).toBe(1)
  })

  test('processes block into linked DAG nodes', () => {
    const result = processBlock(fixtureBlock(), 0, null)
    expect(result).not.toBeNull()
    expect(result!.tacitTxCount).toBe(1)
    const blockEntry = result!.cids.get('block')!
    expect('node' in blockEntry).toBe(true)
    if ('node' in blockEntry) expect(Object.keys(blockEntry.node as object)).toEqual(['bitcoin_block', 'block_hash', 'prev', 'tacit_block', 'tacit_tx_count', 'time', 'tx_count', 'txs', 'v'])
    const block = dagCbor.decode(result!.cids.get('block')!.bytes) as Record<string, unknown>
    expect(new Set(Object.keys(block))).toEqual(new Set(['bitcoin_block', 'block_hash', 'prev', 'tacit_block', 'tacit_tx_count', 'time', 'tx_count', 'txs', 'v']))
    expect(block.v).toBe(1)
    expect(block.tacit_block).toBe(0)
    expect(block.prev).toBeNull()
    expect(block.bitcoin_block).toBe(948242)
    expect(block.block_hash).toBeInstanceOf(CID)
    expect(block.tacit_tx_count).toBe(1)
    expect(block.tx_count).toBe(1)
    expect(block.time).toBe(1778117538)
    expect(block.txs).toBeInstanceOf(CID)
  })
})
