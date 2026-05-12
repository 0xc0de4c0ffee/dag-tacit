export function createBitcoinRpcClient(url) {
  if (!url || url.includes('YOUR_KEY')) throw new Error('BITCOIN_RPC_URL not configured')
  let reqs = 0
  return async function rpc(method, params = []) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++reqs })
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    return d.result
  }
}

export async function fetchVerboseBlock(rpc, height) {
  const hash = await rpc('getblockhash', [height])
  return rpc('getblock', [hash, 2])
}

export async function fetchBlockHeaderWithTxids(rpc, height) {
  const hash = await rpc('getblockhash', [height])
  return rpc('getblock', [hash, 1])
}

export async function fetchVerboseTx(rpc, txid, blockhash) {
  return rpc('getrawtransaction', [txid, true, blockhash])
}
