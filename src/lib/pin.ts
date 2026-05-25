import type { PinServiceConfig } from '../types.ts'

export type PinResult = { ok: true; cid: string; url?: string } | { ok: false; error: string }

export interface PinService { pin(carBytes: Uint8Array, name?: string): Promise<PinResult> }

const PRESETS: Record<string, { endpoint: string; authHeader?: (key: string) => [string, string]; cidKey: string; gateway?: string }> = {
  kubo: { endpoint: '/api/v0/dag/import', cidKey: 'Root.Cid."/:s"', gateway: 'http://127.0.0.1:8080/ipfs/' },
  lighthouse: { endpoint: '/api/v0/add', authHeader: k => ['Authorization', `Bearer ${k}`], cidKey: 'Hash', gateway: 'https://gateway.lighthouse.storage/ipfs/' },
  pinata: { endpoint: '/pinning/pinFileToIPFS', authHeader: k => { const [a,b]=k.split(':'); return ['pinata_api_key', a] }, cidKey: 'IpfsHash', gateway: 'https://gateway.pinata.cloud/ipfs/' },
  custom: { endpoint: '/upload', cidKey: 'cid' },
}

export class HttpPinService implements PinService {
  constructor(private cfg: PinServiceConfig) {}

  async pin(carBytes: Uint8Array, name?: string): Promise<PinResult> {
    const p = PRESETS[this.cfg.kind] ?? PRESETS.custom
    const url = (this.cfg.apiUrl || 'http://127.0.0.1:5001').replace(/\/$/, '') + p.endpoint
    const form = new FormData()
    form.append('file', new Blob([carBytes]), name || 'block.car')
    const headers: Record<string, string> = {}
    if (this.cfg.apiKey && p.authHeader) { const [k,v] = p.authHeader(this.cfg.apiKey); headers[k] = v }
    try {
      const res = await fetch(url, { method: 'POST', headers, body: form })
      if (!res.ok) return { ok: false, error: `${this.cfg.kind} upload failed: ${res.status}` }
      const data = await res.json() as Record<string, unknown>
      const cid = p.cidKey === 'Root.Cid."/:s"' ? ((data.Root as Record<string,unknown>)?.Cid as Record<string,unknown>)?.['/'] as string : data[p.cidKey] as string
      if (!cid) return { ok: false, error: `${this.cfg.kind} response missing CID` }
      const gw = this.cfg.apiUrl ? `${this.cfg.apiUrl}/ipfs/${cid}` : (p.gateway ? `${p.gateway}${cid}` : undefined)
      return { ok: true, cid, url: gw }
    } catch (e) { return { ok: false, error: `${(e as Error).message}` } }
  }
}

export function createPinService(cfg: PinServiceConfig): PinService { return new HttpPinService(cfg) }
