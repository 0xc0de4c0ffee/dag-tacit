import type { BitcoinBlock, BitcoinRpcClient, BitcoinTx, RpcMethod, RpcParams } from '../types.ts'

export function createBitcoinRpcClient(url: string, timeoutMs = 0): BitcoinRpcClient {
  if (!url || url.includes('YOUR_KEY')) throw new Error('BITCOIN_RPC_URL not configured')
  let reqs = 0
  return async function rpc(method: RpcMethod, params: RpcParams = []): Promise<unknown> {
    const ac = timeoutMs > 0 ? new AbortController() : undefined
    const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : undefined
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++reqs }),
        signal: ac?.signal,
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const d = await r.json() as { error?: { message: string }; result: unknown }
      if (d.error) throw new Error(d.error.message)
      return d.result
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

export async function fetchVerboseBlock(rpc: BitcoinRpcClient, height: number): Promise<BitcoinBlock> {
  const hash = await rpc('getblockhash', [height]) as string
  return rpc('getblock', [hash, 2]) as Promise<BitcoinBlock>
}

export async function fetchBlockHeaderWithTxids(rpc: BitcoinRpcClient, height: number): Promise<{ hash: string; tx: string[] }> {
  const hash = await rpc('getblockhash', [height]) as string
  return rpc('getblock', [hash, 1]) as Promise<{ hash: string; tx: string[] }>
}

export async function fetchVerboseTx(rpc: BitcoinRpcClient, txid: string, blockhash?: string): Promise<BitcoinTx> {
  return rpc('getrawtransaction', [txid, true, blockhash]) as Promise<BitcoinTx>
}
