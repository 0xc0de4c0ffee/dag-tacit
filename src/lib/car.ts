import { CID } from 'multiformats/cid'
import { encodeNode } from './dag-cbor.ts'

export function createCarHeader(rootCid: CID): Uint8Array {
  const header = encodeNode({ roots: [rootCid], version: 1 })
  const headerLen = header.bytes.length
  const lenVarint = encodeVarint(headerLen)
  const buf = new Uint8Array(lenVarint.length + headerLen)
  buf.set(lenVarint, 0)
  buf.set(header.bytes, lenVarint.length)
  return buf
}

export function createCarEntry(cid: CID, data: Uint8Array): Uint8Array {
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

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  while (value > 127) {
    bytes.push((value & 0x7f) | 0x80)
    value = value >>> 7
  }
  bytes.push(value)
  return new Uint8Array(bytes)
}

export function assembleCarFile(rootCid: CID, entries: Uint8Array[]): Uint8Array {
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
