import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from './dag-cbor.ts'
import { secp256k1, schnorr } from '@noble/curves/secp256k1'

/**
 * Compute the checksum chain hash for a tacit block.
 * Genesis:  SHA256(32 zero bytes ++ SHA256(txsJSON))
 * Next:     SHA256(prevChecksum ++ SHA256(txsJSON))
 * where txsJSON is the canonical JSON of the block's tacit txs.
 */
export function computeBlockChecksum(prevChecksum: Uint8Array | null, txsJSON: string): Uint8Array {
  const txsHash = sha256(new TextEncoder().encode(txsJSON))
  if (!prevChecksum) {
    return sha256(new Uint8Array([...new Uint8Array(32), ...txsHash]))
  }
  return sha256(new Uint8Array([...prevChecksum, ...txsHash]))
}

/**
 * Verify a Pedersen commitment is a valid secp256k1 point.
 * Checks that commitmentC is a valid compressed secp256k1 public key
 * (33 bytes, prefix 0x02/0x03).
 */
export function verifyCommitment(commitmentC: Uint8Array): boolean {
  if (commitmentC.length !== 33) return false
  const prefix = commitmentC[0]
  if (prefix !== 0x02 && prefix !== 0x03) return false
  try {
    const point = secp256k1.ProjectivePoint.fromHex(bytesToHex(commitmentC))
    return point.hasEvenY()
  } catch {
    return false
  }
}

/**
 * Verify a BIP-340 Schnorr signature on a 32-byte message.
 */
export function verifySchnorrSig(sig: Uint8Array, pubkey: Uint8Array, msg: Uint8Array): boolean {
  if (sig.length !== 64 || pubkey.length !== 32 || msg.length !== 32) return false
  try {
    return schnorr.verify(sig, msg, pubkey)
  } catch {
    return false
  }
}

/**
 * Verify a T_MINT issuer signature per SPEC §5.3.
 * mint_msg = SHA256(asset_id ++ commitmentC ++ amountCt).
 */
export function verifyMintSig(
  issuerSig: Uint8Array,
  mintAuthority: Uint8Array,
  assetId: Uint8Array,
  commitmentC: Uint8Array,
  amountCt: Uint8Array,
): boolean {
  const msg = sha256(new Uint8Array([...assetId, ...commitmentC, ...amountCt]))
  return verifySchnorrSig(issuerSig, mintAuthority, msg)
}

/** Verification result for a tacit tx */
export interface VerifyResult {
  commitmentValid: boolean | null
  commitmentError: string | null
  issuerSigValid: boolean | null
  issuerSigError: string | null
}

/**
 * Verify a tacit transaction's payload.
 */
export function verifyPayload(opcode: string, payload: Uint8Array, txid: string, height: number): VerifyResult {
  const result: VerifyResult = { commitmentValid: null, commitmentError: null, issuerSigValid: null, issuerSigError: null }

  if (payload.length < 1) return result

  switch (opcode) {
    case 'CETCH': {
      let off = 1
      const tl = payload[off++]
      if (tl < 1 || tl > 16) break
      off += tl
      off++
      if (off + 33 > payload.length) break
      const commitmentC = payload.slice(off, off + 33)
      result.commitmentValid = verifyCommitment(commitmentC)
      if (!result.commitmentValid) result.commitmentError = 'invalid CETCH commitment (not a valid secp256k1 point)'
      break
    }

    case 'T_MINT': {
      const commitmentC = payload.slice(65, 98)
      result.commitmentValid = verifyCommitment(commitmentC)
      if (!result.commitmentValid) result.commitmentError = 'invalid T_MINT commitment'
      // issuerSig verification needs mint_authority from parent CETCH — requires external lookup
      result.issuerSigValid = null
      break
    }

    case 'T_PMINT': {
      if (payload.length < 138) break
      const commitmentC = payload.slice(65, 98)
      result.commitmentValid = verifyCommitment(commitmentC)
      if (!result.commitmentValid) result.commitmentError = 'invalid T_PMINT commitment'
      break
    }
  }

  return result
}
