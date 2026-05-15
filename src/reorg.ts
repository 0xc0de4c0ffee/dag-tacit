export interface StoredBlock {
  height: number
  hash: string
}

/**
 * Given stored blocks and a map of current RPC hashes, find the lowest height
 * where a hash mismatch occurs. Returns that height, or null if all match.
 */
export function findReorgCutoff(
  stored: StoredBlock[],
  rpcHashes: Map<number, string>,
  checkFrom: number,
  checkTo: number
): number | null {
  const byHeight = new Map(stored.map(b => [b.height, b.hash]))
  for (let h = checkFrom; h < checkTo; h++) {
    const rpcHash = rpcHashes.get(h)
    const storedHash = byHeight.get(h)
    if (rpcHash && storedHash && storedHash !== rpcHash) {
      return h
    }
  }
  return null
}
