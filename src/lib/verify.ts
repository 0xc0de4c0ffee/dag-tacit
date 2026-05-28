import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from './dag-cbor.ts'
import { secp256k1, schnorr } from '@noble/curves/secp256k1'

/**
 * Compute the checksum chain hash for a tacit block.
 * Genesis:  SHA256(32 zero bytes ++ SHA256(txsJSON))
 * Next:     SHA256(prevChecksum ++ SHA256(txsJSON))
 */
export function computeBlockChecksum(prevChecksum: Uint8Array | null, txsJSON: string): Uint8Array {
  const txsHash = sha256(new TextEncoder().encode(txsJSON))
  if (!prevChecksum) {
    return sha256(new Uint8Array([...new Uint8Array(32), ...txsHash]))
  }
  return sha256(new Uint8Array([...prevChecksum, ...txsHash]))
}

/** Verify a 33-byte compressed secp256k1 commitment is a valid curve point */
export function verifyCommitment(commitmentC: Uint8Array): boolean {
  if (commitmentC.length !== 33) return false
  const prefix = commitmentC[0]
  if (prefix !== 0x02 && prefix !== 0x03) return false
  try {
    secp256k1.ProjectivePoint.fromHex(bytesToHex(commitmentC))
    return true
  } catch {
    return false
  }
}

/** Verify a BIP-340 Schnorr signature (64-byte sig, 32-byte pubkey, 32-byte msg) */
export function verifySchnorrSig(sig: Uint8Array, pubkey: Uint8Array, msg: Uint8Array): boolean {
  if (sig.length !== 64 || pubkey.length !== 32 || msg.length !== 32) return false
  try {
    return schnorr.verify(sig, msg, pubkey)
  } catch {
    return false
  }
}

/** Verify a T_MINT issuer signature per SPEC §5.3: SHA256(asset_id ++ commitmentC ++ amountCt) */
export function verifyMintSig(
  issuerSig: Uint8Array, mintAuthority: Uint8Array,
  assetId: Uint8Array, commitmentC: Uint8Array, amountCt: Uint8Array,
): boolean {
  const msg = sha256(new Uint8Array([...assetId, ...commitmentC, ...amountCt]))
  return verifySchnorrSig(issuerSig, mintAuthority, msg)
}

/** Verify a kernel signature per SPEC §5.2 (Mimblewimble balance equation) */
export function verifyKernelSig(
  kernelSig: Uint8Array, excessPubkey: Uint8Array, kernelMsg: Uint8Array,
): boolean {
  return verifySchnorrSig(kernelSig, excessPubkey, kernelMsg)
}

/** Check that a blinding factor is non-zero (SPEC §5.9 step 6) */
export function verifyBlindingNonZero(blinding: Uint8Array): boolean {
  if (blinding.length !== 32) return false
  for (const b of blinding) if (b !== 0) return true
  return false
}

/** Check T_PETCH cap divisibility: cap_amount % mint_limit == 0 (SPEC §5.8) */
export function verifyCapDivisible(capAmount: number, mintLimit: number): boolean {
  return capAmount > 0 && mintLimit > 0 && capAmount % mintLimit === 0
}

/** Check T_BURN amount is positive (SPEC §5.4) */
export function verifyBurnAmount(burnedAmount: bigint): boolean {
  return burnedAmount > 0n
}

export interface VerifyResult {
  commitmentValid: boolean | null
  commitmentError: string | null
  issuerSigValid: boolean | null
  issuerSigError: string | null
  burnValid: boolean | null
  blindingValid: boolean | null
}

/** Verify a tacit tx payload. Returns null for opcodes with no verifiable fields. */
export function verifyPayload(opcode: string, payload: Uint8Array, txid: string, height: number): VerifyResult {
  const r: VerifyResult = {
    commitmentValid: null, commitmentError: null,
    issuerSigValid: null, issuerSigError: null,
    burnValid: null, blindingValid: null,
  }
  if (payload.length < 1) return r

  switch (opcode) {
    case 'CETCH': {
      // opcode(1) || ticker_len(1) || ticker(N) || decimals(1) || commitment(33) || ...
      let off = 1
      if (off >= payload.length) break
      const tl = payload[off++]
      if (tl < 1 || tl > 16 || off + tl + 1 + 33 > payload.length) break
      off += tl + 1 // ticker + decimals
      r.commitmentValid = verifyCommitment(payload.slice(off, off + 33))
      if (!r.commitmentValid) r.commitmentError = 'invalid CETCH commitment'
      break
    }

    case 'CXFER': case 'T_CXFER_BPP': {
      // opcode(1) || asset_id(32) || kernel_sig(64) || N(1) || [commitment(33) || amount_ct(8)]×N || rp_len(2) || rp
      if (payload.length < 1 + 32 + 64 + 1) break
      r.commitmentValid = true
      const n = payload[1 + 32 + 64]
      if (![1, 2, 4, 8].includes(n)) { r.commitmentValid = false; r.commitmentError = 'CXFER N must be 1,2,4,8'; break }
      for (let i = 0; i < n; i++) {
        const off = 1 + 32 + 64 + 1 + i * 41
        if (off + 33 > payload.length) { r.commitmentValid = false; break }
        if (!verifyCommitment(payload.slice(off, off + 33))) { r.commitmentValid = false; r.commitmentError = `CXFER output ${i} invalid commitment`; break }
      }
      break
    }

    case 'T_MINT': {
      // opcode(1) || asset_id(32) || etch_txid(32) || commitment(33) || amount_ct(8) || rp_len(2) || rp || issuer_sig(64)
      if (payload.length < 1 + 32 + 32 + 33 + 8 + 2) break
      const commitmentC = payload.slice(65, 98)
      r.commitmentValid = verifyCommitment(commitmentC)
      if (!r.commitmentValid) r.commitmentError = 'invalid T_MINT commitment'
      // issuerSig needs parent CETCH mint_authority lookup — done externally
      r.issuerSigValid = null
      break
    }

    case 'T_BURN': {
      // opcode(1) || asset_id(32) || burned_amount(8) || kernel_sig(64) || N(1) || ...
      if (payload.length < 1 + 32 + 8 + 64 + 1) break
      const burned = new DataView(payload.slice(33, 41).buffer).getBigUint64(0, true)
      r.burnValid = burned > 0n
      r.commitmentValid = true
      const n = payload[1 + 32 + 8 + 64]
      if (![0, 1, 2, 4, 8].includes(n)) { r.commitmentValid = false; r.commitmentError = 'T_BURN N must be 0,1,2,4,8'; break }
      for (let i = 0; i < n; i++) {
        const off = 1 + 32 + 8 + 64 + 1 + i * 41
        if (off + 33 > payload.length) { r.commitmentValid = false; break }
        if (!verifyCommitment(payload.slice(off, off + 33))) { r.commitmentValid = false; r.commitmentError = `T_BURN output ${i} invalid commitment`; break }
      }
      break
    }

    case 'T_AXFER': {
      // opcode(1) || asset_id(32) || asset_input_count(1) || kernel_sig(64) || N(1) || ...
      if (payload.length < 1 + 32 + 1 + 64 + 1) break
      r.commitmentValid = true
      const n = payload[1 + 32 + 1 + 64]
      if (![1, 2, 4, 8].includes(n)) { r.commitmentValid = false; r.commitmentError = 'T_AXFER N must be 1,2,4,8'; break }
      for (let i = 0; i < n; i++) {
        const off = 1 + 32 + 1 + 64 + 1 + i * 41
        if (off + 33 > payload.length) { r.commitmentValid = false; break }
        if (!verifyCommitment(payload.slice(off, off + 33))) { r.commitmentValid = false; r.commitmentError = `T_AXFER output ${i} invalid commitment`; break }
      }
      break
    }

    case 'T_PETCH': {
      // opcode(1) || ticker_len(1) || ticker(N) || decimals(1) || cap_amount(8) || mint_limit(8) || mint_start(4) || mint_end(4) || img_len(2) || img
      let off = 1
      if (off >= payload.length) break
      const tl = payload[off++]
      if (tl < 1 || tl > 16 || off + tl + 1 + 8 + 8 > payload.length) break
      off += tl + 1 + 8 // ticker + decimals + cap_amount
      const mintLimit = new DataView(payload.slice(off, off + 8).buffer).getBigUint64(0, true)
      const capAmount = new DataView(payload.slice(off - 8, off).buffer).getBigUint64(0, true)
      r.burnValid = verifyCapDivisible(Number(capAmount), Number(mintLimit))
      if (!r.burnValid) r.commitmentError = 'T_PETCH cap must be divisible by mint_limit'
      break
    }

    case 'T_PMINT': {
      // opcode(1) || asset_id(32) || etch_txid(32) || commitment(33) || amount(8) || blinding(32) = 138
      if (payload.length < 138) break
      r.commitmentValid = verifyCommitment(payload.slice(65, 98))
      if (!r.commitmentValid) r.commitmentError = 'invalid T_PMINT commitment'
      const blinding = payload.slice(106, 138)
      r.blindingValid = verifyBlindingNonZero(blinding)
      break
    }

    case 'T_WITHDRAW': {
      // Groth16 proof: verification keys in ceremony/mixer/verification_key.json
      // Wire: opcode(1) || asset_id(32) || denomination(8) || merkle_root(32) ||
      //       nullifier(32) || recipient_commit(33) || r_leaf(32) || bind_hash(32)
      //       || proof_len(2 LE) || proof(N)
      // proof_len is at fixed offset 202-203 (1+32+8+32+32+33+32+32 = 202)
      if (payload.length < 204) break
      const proofLen = payload[202] | (payload[203] << 8)
      const proof = payload.slice(204, 204 + proofLen)
      r.commitmentValid = proof.length > 0
      if (!r.commitmentValid) r.commitmentError = 'T_WITHDRAW has empty proof'
      break
    }

    case 'T_DROP': {
      // opcode(1) || asset_id(32) || cap_amount(8) || per_claim(8) || merkle_root(32) || ...
      if (payload.length < 1 + 32 + 8 + 8) break
      const perClaim = new DataView(payload.slice(41, 49).buffer).getBigUint64(0, true)
      r.burnValid = perClaim >= 0n
      break
    }

    case 'T_DEPOSIT': {
      // No crypto validation for T_DEPOSIT in v1
      break
    }

    case 'T_DCLAIM': {
      if (payload.length < 1 + 32 + 32 + 33 + 8 + 32) break
      r.commitmentValid = verifyCommitment(payload.slice(65, 98))
      if (!r.commitmentValid) r.commitmentError = 'invalid T_DCLAIM commitment'
      const blinding = payload.slice(106, 138)
      r.blindingValid = verifyBlindingNonZero(blinding)
      break
    }

    case 'T_AXFER_VAR': {
      // opcode(1) || asset_id(32) || asset_input_count(1)=1 || N(1)=2 || [commitment(33) || amount_ct(8)]×2 || ...
      if (payload.length < 1 + 32 + 1 + 1 + 82) break
      r.commitmentValid = true
      for (let i = 0; i < 2; i++) {
        const off = 1 + 32 + 1 + 1 + i * 41
        if (!verifyCommitment(payload.slice(off, off + 33))) { r.commitmentValid = false; r.commitmentError = `T_AXFER_VAR output ${i} invalid commitment`; break }
      }
      break
    }
  }

  return r
}
