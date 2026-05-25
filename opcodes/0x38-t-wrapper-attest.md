# 0x38 T_WRAPPER_ATTEST

> Opcode wire format from the [Tacit protocol specification](https://github.com/z0r0z/tacit/blob/main/SPEC.md).
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**No confidential outputs.** Pure signed-data envelope timestamped onto Bitcoin via commit-reveal. Fixed 159 bytes. Issuers MAY publish attestations off-chain without ever using this opcode.

### Wire layout (fixed 159 bytes)

| Offset | Size | Field | Type | Notes |
|---|---|---|---|---|
| 0 | 1 | opcode | u8 | `0x38` |
| 1 | 1 | network_tag | u8 | u8, 0x00=mainnet, 0x01=signet, 0x02=regtest |
| 2 | 32 | asset_id | bytes |  |
| 34 | 33 | issuer_pubkey | bytes33 | compressed secp256k1 |
| 67 | 8 | reserves_LE | u64 LE | u64 LE — reserves balance at as_of_height |
| 75 | 8 | supply_LE | u64 LE | u64 LE — circulating supply at as_of_height |
| 83 | 4 | as_of_height_LE | u32 LE | u32 LE — Bitcoin block height |
| 87 | 8 | timestamp_LE | u64 LE | u64 LE — unix seconds |
| 95 | 64 | attestation_sig | bytes64 | BIP-340 |

### On-chain embedding
159 bytes exceeds OP_RETURN 80-byte limit. Uses standard tacit commit-reveal:
- **Commit tx**: P2TR with envelope in script-path leaf (NUMS internal key)
- **Reveal tx**: `vin[0]` spends P2TR via script-path, revealing envelope as witness

### Constraints
- `network_tag` must match indexer's local network
- `as_of_height ≤ confirmation_height`
- `attestation_sig` verifies under `issuer_pubkey` over `attestation_msg` per §4.2.4
- No equivocation per `(network, asset_id, issuer_pubkey, as_of_height)`
- Produces no asset UTXOs — pure metadata for wrapper-attestation log

### TypeScript

```typescript
export interface T_WRAPPER_ATTEST {
  opcode: "T_WRAPPER_ATTEST";
  payload: Uint8Array;
  networkTag: number;
  assetId: string;
  issuerPubkey: Uint8Array;
  reserves: bigint;
  supply: bigint;
  asOfHeight: number;
  timestamp: bigint;
  attestationSig: Uint8Array;
}

---

## Decode function stubs (matching existing envelope.ts style)

All opcodes are already defined in `src/config.ts`. To add per-opcode payload structure parsing, add decode functions for each opcode and wire them into `decodePayload`:

```typescript
// In OPCODES (all 19 opcodes):
CETCH: 0x21,
CXFER: 0x23,
T_MINT: 0x24,
T_BURN: 0x25,
T_AXFER: 0x26,
T_PETCH: 0x27,
T_PMINT: 0x28,
T_DEPOSIT: 0x29,
T_WITHDRAW: 0x2a,
T_DROP: 0x2b,
T_DCLAIM: 0x2c,
T_LP_ADD: 0x2d,
T_LP_REMOVE: 0x2e,
T_SWAP_BATCH: 0x2f,
T_INTENT_ATTEST: 0x30,
T_PROTOCOL_FEE_CLAIM: 0x31,
T_SWAP_VAR: 0x32,
T_AXFER_VAR: 0x37,
T_WRAPPER_ATTEST: 0x38,

// In OPCODE_NAMES (all 19):
0x21: "CETCH",
0x23: "CXFER",
0x24: "T_MINT",
0x25: "T_BURN",
0x26: "T_AXFER",
0x27: "T_PETCH",
0x28: "T_PMINT",
0x29: "T_DEPOSIT",
0x2a: "T_WITHDRAW",
0x2b: "T_DROP",
0x2c: "T_DCLAIM",
0x2d: "T_LP_ADD",
0x2e: "T_LP_REMOVE",
0x2f: "T_SWAP_BATCH",
0x30: "T_INTENT_ATTEST",
0x31: "T_PROTOCOL_FEE_CLAIM",
0x32: "T_SWAP_VAR",
0x37: "T_AXFER_VAR",
0x38: "T_WRAPPER_ATTEST",

Add cases to the switch in `decodePayload`:
```typescript
case OPCODES.CETCH:
  envelope = decodeCetch(payload, c);
  break;
case OPCODES.CXFER:
  envelope = decodeCxfer(payload, c);
  break;
case OPCODES.T_MINT:
  envelope = decodeTMint(payload, c);
  break;
case OPCODES.T_BURN:
  envelope = decodeTBurn(payload, c);
  break;
case OPCODES.T_AXFER:
  envelope = decodeTAxfer(payload, c);
  break;
case OPCODES.T_PETCH:
  envelope = decodeTPetch(payload, c);
  break;
case OPCODES.T_PMINT:
  envelope = decodeTPmint(payload, c);
  break;
case OPCODES.T_DEPOSIT:
  envelope = decodeTDeposit(payload, c);
  break;
case OPCODES.T_WITHDRAW:
  envelope = decodeTWithdraw(payload, c);
  break;
case OPCODES.T_DROP:
  envelope = decodeTDrop(payload, c);
  break;
case OPCODES.T_DCLAIM:
  envelope = decodeTDclaim(payload, c);
  break;
case OPCODES.T_LP_ADD:
  envelope = decodeTLpAdd(payload, c);
  break;
case OPCODES.T_LP_REMOVE:
  envelope = decodeTLpRemove(payload, c);
  break;
case OPCODES.T_SWAP_BATCH:
  envelope = decodeTSwapBatch(payload, c);
  break;
case OPCODES.T_INTENT_ATTEST:
  envelope = decodeTIntentAttest(payload, c);
  break;
case OPCODES.T_PROTOCOL_FEE_CLAIM:
  envelope = decodeTProtocolFeeClaim(payload, c);
  break;
case OPCODES.T_SWAP_VAR:
  envelope = decodeTSwapVar(payload, c);
  break;
case OPCODES.T_AXFER_VAR:
  envelope = decodeTAxferVar(payload, c);
  break;
case OPCODES.T_WRAPPER_ATTEST:
  envelope = decodeTWrapperAttest(payload, c);
  break;

### decodeCetch

```typescript
function decodeCetch(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const tickerLen = c.takeU8();
  if (tickerLen < 1 || tickerLen > 16) throw new Error(`CETCH bad ticker_len=${tickerLen}`);
  const ticker = c.takeUtf8(tickerLen);
  const decimals = c.takeU8();
  if (decimals > 8) throw new Error(`CETCH bad decimals=${decimals}`);
  const commitment = c.takeBytes(33);
  const amountCt = c.takeBytes(8);
  const rpLen = c.takeU16LE();
  const rangeproof = c.takeBytes(rpLen);
  const mintAuthority = c.takeBytes(32);
  const imgLen = c.takeU16LE();
  const imageUri = imgLen > 0 ? c.takeUtf8(imgLen) : "";
  return { opcode: "CETCH", payload, tickerLen, ticker, decimals, commitment, amountCt, rpLen, rangeproof, mintAuthority, imgLen, imageUri } as any;
}

### decodeCxfer

```typescript
function decodeCxfer(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const kernelSig = c.takeBytes(64);
  const N = c.takeU8();
  if (![1, 2, 4, 8].includes(N)) throw new Error(`CXFER bad N=${N}`);
  const commitments: Uint8Array[] = [];
  const amountCts: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    commitments.push(c.takeBytes(33));
    amountCts.push(c.takeBytes(8));
  }
  const rpLen = c.takeU16LE();
  const rangeproof = c.takeBytes(rpLen);
  return { opcode: "CXFER", payload, assetId, kernelSig, N, commitments, amountCts, rpLen, rangeproof } as any;
}

### decodeTMint

```typescript
function decodeTMint(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const etchTxid = bytesToHex(c.takeBytes(32));
  const commitment = c.takeBytes(33);
  const amountCt = c.takeBytes(8);
  const rpLen = c.takeU16LE();
  const rangeproof = c.takeBytes(rpLen);
  const issuerSig = c.takeBytes(64);
  return { opcode: "T_MINT", payload, assetId, etchTxid, commitment, amountCt, rpLen, rangeproof, issuerSig } as any;
}

### decodeTBurn

```typescript
function decodeTBurn(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const burnedAmount = c.takeU64LE();
  const kernelSig = c.takeBytes(64);
  const N = c.takeU8();
  if (![0, 1, 2, 4, 8].includes(N)) throw new Error(`T_BURN bad N=${N}`);
  const commitments: Uint8Array[] = [];
  const amountCts: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    commitments.push(c.takeBytes(33));
    amountCts.push(c.takeBytes(8));
  }
  let rpLen = 0;
  let rangeproof = new Uint8Array(0);
  if (N > 0) {
    rpLen = c.takeU16LE();
    rangeproof = c.takeBytes(rpLen);
  }
  return { opcode: "T_BURN", payload, assetId, burnedAmount, kernelSig, N, commitments, amountCts, rpLen, rangeproof } as any;
}

### decodeTAxfer

```typescript
function decodeTAxfer(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const assetInputCount = c.takeU8();
  if (assetInputCount < 1) throw new Error(`T_AXFER bad asset_input_count=${assetInputCount}`);
  const kernelSig = c.takeBytes(64);
  const N = c.takeU8();
  if (![1, 2, 4, 8].includes(N)) throw new Error(`T_AXFER bad N=${N}`);
  const commitments: Uint8Array[] = [];
  const amountCts: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    commitments.push(c.takeBytes(33));
    amountCts.push(c.takeBytes(8));
  }
  const rpLen = c.takeU16LE();
  const rangeproof = c.takeBytes(rpLen);
  return { opcode: "T_AXFER", payload, assetId, assetInputCount, kernelSig, N, commitments, amountCts, rpLen, rangeproof } as any;
}

### decodeTPetch

```typescript
function decodeTPetch(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const tickerLen = c.takeU8();
  if (tickerLen < 1 || tickerLen > 16) throw new Error(`T_PETCH bad ticker_len=${tickerLen}`);
  const ticker = c.takeUtf8(tickerLen);
  const decimals = c.takeU8();
  if (decimals > 8) throw new Error(`T_PETCH bad decimals=${decimals}`);
  const capAmount = c.takeU64LE();
  if (capAmount <= 0n) throw new Error(`T_PETCH cap_amount must be > 0`);
  const mintLimit = c.takeU64LE();
  if (mintLimit <= 0n) throw new Error(`T_PETCH mint_limit must be > 0`);
  if (capAmount % mintLimit !== 0n) throw new Error(`T_PETCH cap_amount not divisible by mint_limit`);
  const mintStartHeight = c.takeU32LE();
  const mintEndHeight = c.takeU32LE();
  const imgLen = c.takeU16LE();
  const imageUri = imgLen > 0 ? c.takeUtf8(imgLen) : "";
  return { opcode: "T_PETCH", payload, tickerLen, ticker, decimals, capAmount, mintLimit, mintStartHeight, mintEndHeight, imgLen, imageUri } as any;
}

### decodeTPmint

```typescript
function decodeTPmint(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const etchTxid = bytesToHex(c.takeBytes(32));
  const commitment = c.takeBytes(33);
  const amount = c.takeU64LE();
  if (amount <= 0n) throw new Error(`T_PMINT amount must be > 0`);
  const blinding = c.takeBytes(32);
  return { opcode: "T_PMINT", payload, assetId, etchTxid, commitment, amount, blinding } as any;
}

### decodeTDeposit

```typescript
function decodeTDeposit(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const denomination = c.takeU64LE();
  if (denomination === 0n) {
    // POOL_INIT variant
    const poolDenom = c.takeU64LE();
    if (poolDenom <= 0n) throw new Error(`T_DEPOSIT POOL_INIT pool_denom must be > 0`);
    const vkCidLen = c.takeU8();
    if (vkCidLen < 1 || vkCidLen > 64) throw new Error(`bad vk_cid_len=${vkCidLen}`);
    const vkCid = c.takeUtf8(vkCidLen);
    const ceremonyCidLen = c.takeU8();
    if (ceremonyCidLen < 1 || ceremonyCidLen > 64) throw new Error(`bad ceremony_cid_len=${ceremonyCidLen}`);
    const ceremonyCid = c.takeUtf8(ceremonyCidLen);
    const initSig = c.takeBytes(64);
    return { opcode: "T_DEPOSIT", payload, assetId, denomination, poolDenom, vkCid, ceremonyCid, initSig } as any;
  }
  const leafCommitment = c.takeBytes(32);
  const kernelSig = c.takeBytes(64);
  return { opcode: "T_DEPOSIT", payload, assetId, denomination, leafCommitment, kernelSig } as any;
}

### decodeTWithdraw

```typescript
function decodeTWithdraw(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const denomination = c.takeU64LE();
  const merkleRoot = c.takeBytes(32);
  const nullifierHash = c.takeBytes(32);
  const recipientCommitment = c.takeBytes(33);
  const rLeaf = c.takeBytes(32);
  const bindHash = c.takeBytes(32);
  const proofLen = c.takeU16LE();
  const proof = c.takeBytes(proofLen);
  return { opcode: "T_WITHDRAW", payload, assetId, denomination, merkleRoot, nullifierHash, recipientCommitment, rLeaf, bindHash, proofLen, proof } as any;
}

### decodeTDrop

```typescript
function decodeTDrop(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const capAmount = c.takeU64LE();
  if (capAmount <= 0n) throw new Error(`T_DROP cap_amount must be > 0, got ${capAmount}`);
  const perClaim = c.takeU64LE();
  if (perClaim < 0n) throw new Error(`T_DROP per_claim negative`);

  // Reclaim variant: per_claim == 0
  if (perClaim === 0n) {
    const reclaimDropId = bytesToHex(c.takeBytes(32));
    const reclaimSig = c.takeBytes(64);
    const capBlinding = c.takeBytes(32);
    let allZero = true;
    for (const b of capBlinding) { if (b !== 0) { allZero = false; break; } }
    if (allZero) throw new Error("T_DROP reclaim cap_blinding is all zero");
    return { opcode: "T_DROP", payload, assetId, capAmount, perClaim: 0n, reclaimDropId, reclaimSig, capBlinding } as any;
  }

  // Standard variant
  if (capAmount % perClaim !== 0n) throw new Error(`T_DROP cap_amount ${capAmount} not divisible by per_claim ${perClaim}`);
  const merkleRoot = c.takeBytes(32);
  const expiryHeight = c.takeU32LE();
  const tickerLen = c.takeU8();
  if (tickerLen > 16) throw new Error(`T_DROP bad ticker_len=${tickerLen}`);
  const ticker = tickerLen > 0 ? c.takeUtf8(tickerLen) : "";
  const decimals = c.takeU8();
  if (tickerLen === 0 && decimals !== 0) throw new Error("T_DROP ticker_len=0 but decimals != 0");
  if (tickerLen > 0 && decimals > 8) throw new Error(`T_DROP bad decimals=${decimals}`);
  const assetInputCount = c.takeU8();
  if (assetInputCount < 1 || assetInputCount > 16) throw new Error(`T_DROP bad asset_input_count=${assetInputCount}`);
  const kernelSig = c.takeBytes(64);
  return { opcode: "T_DROP", payload, assetId, capAmount, perClaim, merkleRoot, expiryHeight, tickerLen, ticker, decimals, assetInputCount, kernelSig } as any;
}

### decodeTDclaim

```typescript
function decodeTDclaim(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const dropRevealTxid = bytesToHex(c.takeBytes(32));
  const commitment = c.takeBytes(33);
  const amount = c.takeU64LE();
  if (amount <= 0n) throw new Error(`T_DCLAIM amount must be > 0, got ${amount}`);
  const blinding = c.takeBytes(32);
  let allZero = true;
  for (const b of blinding) { if (b !== 0) { allZero = false; break; } }
  if (allZero) throw new Error("T_DCLAIM blinding is all zero");
  const witnessLen = c.takeU16LE();
  let witness = new Uint8Array(0);
  if (witnessLen > 0) {
    witness = c.takeBytes(witnessLen);
    // SPEC: Merkle-gated: recipient_pub(33) + leaf_index(4) + eth_address(20) + eth_sig(65) + proof_len(1) + proof_path(proof_len*32)
    if (witness.length < 33 + 4 + 20 + 65 + 1) throw new Error("T_DCLAIM witness too short for Merkle-gated structure");
  }
  return { opcode: "T_DCLAIM", payload, assetId, dropRevealTxid, commitment, amount, blinding, witnessLen, witness } as any;
}

### decodeTLpAdd

```typescript
function decodeTLpAdd(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const variant = c.takeU8();
  if (variant > 1) throw new Error(`T_LP_ADD bad variant=${variant}`);
  const assetA = bytesToHex(c.takeBytes(32));
  const assetB = bytesToHex(c.takeBytes(32));
  const deltaA = c.takeU64LE();
  if (deltaA <= 0n) throw new Error(`T_LP_ADD delta_A must be > 0`);
  const deltaB = c.takeU64LE();
  if (deltaB <= 0n) throw new Error(`T_LP_ADD delta_B must be > 0`);
  const shareAmount = c.takeU64LE();
  if (shareAmount <= 0n) throw new Error(`T_LP_ADD share_amount must be > 0`);
  const shareCSecp = c.takeBytes(33);
  const shareCBJJ = c.takeBytes(32);
  const shareXcurveSigma = c.takeBytes(169);
  const kernelSigA = c.takeBytes(64);
  const kernelSigB = c.takeBytes(64);

  if (variant === 0) {
    const proofLen = c.takeU16LE();
    const proof = c.takeBytes(proofLen);
    return { opcode: "T_LP_ADD", payload, variant: 0 as const, assetA, assetB, deltaA, deltaB, shareAmount, shareCSecp, shareCBJJ, shareXcurveSigma, kernelSigA, kernelSigB, proofLen, proof } as any;
  }

  // Variant 1 (POOL_INIT)
  const feeBps = c.takeU16LE();
  if (feeBps > 1000) throw new Error(`T_LP_ADD POOL_INIT fee_bps > 1000`);
  const vkCidLen = c.takeU8();
  if (vkCidLen < 1 || vkCidLen > 64) throw new Error(`bad vk_cid_len=${vkCidLen}`);
  const vkCid = c.takeUtf8(vkCidLen);
  const ceremonyCidLen = c.takeU8();
  if (ceremonyCidLen < 1 || ceremonyCidLen > 64) throw new Error(`bad ceremony_cid_len=${ceremonyCidLen}`);
  const ceremonyCid = c.takeUtf8(ceremonyCidLen);
  const arbiterCount = c.takeU8();
  if (arbiterCount > 16) throw new Error(`bad arbiter_count=${arbiterCount}`);
  const arbiterThresholdM = c.takeU8();
  if (arbiterCount > 0 && (arbiterThresholdM < 1 || arbiterThresholdM > arbiterCount)) throw new Error(`bad arbiter_threshold_m=${arbiterThresholdM}`);
  if (arbiterCount === 0 && arbiterThresholdM !== 0) throw new Error(`arbiter_count=0 but threshold_m=${arbiterThresholdM}`);
  const arbiterPubkeys = c.takeBytes(33 * arbiterCount);
  const launcherSigCount = c.takeU8();
  if (launcherSigCount > 2) throw new Error(`bad launcher_sig_count=${launcherSigCount}`);
  const launcherSigs = c.takeBytes(64 * launcherSigCount);
  const protocolFeeAddress = c.takeBytes(33);
  const protocolFeeBps = c.takeU16LE();
  if (protocolFeeBps > 1000) throw new Error(`protocol_fee_bps > 1000`);
  const allZeroAddr = new Uint8Array(33);
  const hasFeeAddr = !eq(protocolFeeAddress, allZeroAddr);
  if (hasFeeAddr && protocolFeeBps === 0) throw new Error("protocol_fee_address set but bps=0");
  if (!hasFeeAddr && protocolFeeBps !== 0) throw new Error("protocol_fee_address zero but bps>0");
  const poolMetaUriLen = c.takeU8();
  const poolMetaUri = c.takeUtf8(poolMetaUriLen);
  const poolCapabilityFlags = c.takeU8();
  const proofLen = c.takeU16LE();
  const proof = c.takeBytes(proofLen);
  return { opcode: "T_LP_ADD", payload, variant: 1 as const, assetA, assetB, deltaA, deltaB, shareAmount, shareCSecp, shareCBJJ, shareXcurveSigma, kernelSigA, kernelSigB, feeBps, vkCid, ceremonyCid, arbiterCount, arbiterThresholdM, arbiterPubkeys, launcherSigCount, launcherSigs, protocolFeeAddress, protocolFeeBps, poolMetaUriLen, poolMetaUri, poolCapabilityFlags, proofLen, proof } as any;
}

### decodeTLpRemove

```typescript
function decodeTLpRemove(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetA = bytesToHex(c.takeBytes(32));
  const assetB = bytesToHex(c.takeBytes(32));
  const shareAmount = c.takeU64LE();
  if (shareAmount <= 0n) throw new Error(`T_LP_REMOVE share_amount must be > 0`);
  const deltaA = c.takeU64LE();
  const deltaB = c.takeU64LE();
  const recvACSecp = c.takeBytes(33);
  const recvACBJJ = c.takeBytes(32);
  const recvAXcurveSigma = c.takeBytes(169);
  const recvBCSecp = c.takeBytes(33);
  const recvBCBJJ = c.takeBytes(32);
  const recvBXcurveSigma = c.takeBytes(169);
  const kernelSigLP = c.takeBytes(64);
  const proofLen = c.takeU16LE();
  const proof = c.takeBytes(proofLen);
  return { opcode: "T_LP_REMOVE", payload, assetA, assetB, shareAmount, deltaA, deltaB, recvACSecp, recvACBJJ, recvAXcurveSigma, recvBCSecp, recvBCBJJ, recvBXcurveSigma, kernelSigLP, proofLen, proof } as any;
}

### decodeTSwapBatch

```typescript
function decodeTSwapBatch(payload: Uint8Array, c: Cursor, hasArbiter?: boolean): DecodedEnvelope {
  const assetA = bytesToHex(c.takeBytes(32));
  const assetB = bytesToHex(c.takeBytes(32));
  const nIntents = c.takeU8();
  if (nIntents < 1 || nIntents > 16) throw new Error(`T_SWAP_BATCH bad n_intents=${nIntents}`);
  const rawDeltaANet = c.takeBytes(9);
  const deltaANetSign = rawDeltaANet[0]!;
  const deltaANetMag = new Cursor(rawDeltaANet, 1).takeU64LE();
  const rawDeltaBNet = c.takeBytes(9);
  const deltaBNetSign = rawDeltaBNet[0]!;
  const deltaBNetMag = new Cursor(rawDeltaBNet, 1).takeU64LE();
  const RNetA = c.takeBytes(32);
  const RNetB = c.takeBytes(32);
  const feeBpsAtSettle = c.takeU16LE();
  if (feeBpsAtSettle > 1000) throw new Error(`fee_bps_at_settle > 1000`);
  const tipAAmount = c.takeU64LE();
  const tipBAmount = c.takeU64LE();
  const tipACSecp = c.takeBytes(33);
  const tipBCSecp = c.takeBytes(33);
  const rTipA = c.takeBytes(32);
  const rTipB = c.takeBytes(32);

  // Conditionally decode arbiter block
  let arbiter: SwapBatchArbiter | null = null;
  if (hasArbiter) {
    const expectedHeight = c.takeU32LE();
    const qualifyingSetHash = c.takeBytes(32);
    const arbiterM = c.takeU8();
    if (arbiterM < 1 || arbiterM > 16) throw new Error(`bad arbiter_m=${arbiterM}`);
    const signerIndices = c.takeBytes(arbiterM);
    const arbiterSigs = c.takeBytes(64 * arbiterM);
    arbiter = { expectedHeight, qualifyingSetHash, arbiterM, signerIndices, arbiterSigs };
  }

  // Per-intent blocks
  const intents: SwapBatchIntent[] = [];
  for (let i = 0; i < nIntents; i++) {
    const direction = c.takeU8();
    const traderPubkey = c.takeBytes(33);
    const CInSecp = c.takeBytes(33);
    const CInBJJ = c.takeBytes(32);
    const inXcurveSigma = c.takeBytes(169);
    const minOut = c.takeU64LE();
    const tipAmount = c.takeU64LE();
    const expiryHeight = c.takeU32LE();
    const intentSig = c.takeBytes(64);
    intents.push({ direction, traderPubkey, CInSecp, CInBJJ, inXcurveSigma, minOut, tipAmount, expiryHeight, intentSig });
  }

  // Per-receipt blocks
  const receipts: SwapBatchReceipt[] = [];
  for (let i = 0; i < nIntents; i++) {
    const COutSecp = c.takeBytes(33);
    const COutBJJ = c.takeBytes(32);
    const outXcurveSigma = c.takeBytes(169);
    receipts.push({ COutSecp, COutBJJ, outXcurveSigma });
  }

  const proofLen = c.takeU16LE();
  const proof = c.takeBytes(proofLen);
  const settlerMetaUriLen = c.takeU8();
  const settlerMetaUri = c.takeUtf8(settlerMetaUriLen);
  return { opcode: "T_SWAP_BATCH", payload, assetA, assetB, nIntents, deltaANetSign, deltaANetMag, deltaBNetSign, deltaBNetMag, RNetA, RNetB, feeBpsAtSettle, tipAAmount, tipBAmount, tipACSecp, tipBCSecp, rTipA, rTipB, arbiter, intents, receipts, proofLen, proof, settlerMetaUriLen, settlerMetaUri } as any;
}

### decodeTIntentAttest

```typescript
function decodeTIntentAttest(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const scopeId = bytesToHex(c.takeBytes(32));
  const intentPoolHash = c.takeBytes(32);
  const observedHeight = c.takeU32LE();
  const timestamp = c.takeU64LE();
  const intentCount = c.takeU16LE();
  const snapshotUriLen = c.takeU8();
  const snapshotUri = snapshotUriLen > 0 ? c.takeUtf8(snapshotUriLen) : "";
  const workerPubkey = c.takeBytes(33);
  const workerSig = c.takeBytes(64);
  return { opcode: "T_INTENT_ATTEST", payload, scopeId, intentPoolHash, observedHeight, timestamp, intentCount, snapshotUriLen, snapshotUri, workerPubkey, workerSig } as any;
}

### decodeTProtocolFeeClaim

```typescript
function decodeTProtocolFeeClaim(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const poolId = bytesToHex(c.takeBytes(32));
  const claimerPubkeyXOnly = c.takeBytes(32);
  const claimAmount = c.takeU64LE();
  if (claimAmount <= 0n) throw new Error(`claim_amount must be > 0, got ${claimAmount}`);
  const claimCSecp = c.takeBytes(33);
  const claimBlinding = c.takeBytes(32);
  let allZero = true;
  for (const b of claimBlinding) { if (b !== 0) { allZero = false; break; } }
  if (allZero) throw new Error("claim_blinding is all zero");
  const claimSig = c.takeBytes(64);
  return { opcode: "T_PROTOCOL_FEE_CLAIM", payload, poolId, claimerPubkeyXOnly, claimAmount, claimCSecp, claimBlinding, claimSig } as any;
}

### decodeTSwapVar

```typescript
function decodeTSwapVar(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const envelopeVersion = c.takeU8();
  if (envelopeVersion !== 0x01) throw new Error(`T_SWAP_VAR bad envelope_version=${envelopeVersion}`);
  const poolId = bytesToHex(c.takeBytes(32));
  const direction = c.takeU8();
  if (direction > 1) throw new Error(`bad direction=${direction}`);
  const RAPre = c.takeU64LE();
  const RBPre = c.takeU64LE();
  const deltaIn = c.takeU64LE();
  if (deltaIn <= 0n) throw new Error(`delta_in must be > 0`);
  const deltaInMin = c.takeU64LE();
  const deltaInMax = c.takeU64LE();
  if (deltaInMin > deltaIn || deltaIn > deltaInMax) throw new Error(`delta_in not in [min, max]`);
  const deltaOut = c.takeU64LE();
  const minOut = c.takeU64LE();
  const tipAmount = c.takeU64LE();
  const tipAsset = c.takeU8();
  if (tipAsset > 1) throw new Error(`bad tip_asset=${tipAsset}`);
  const expiryHeight = c.takeU32LE();
  const traderPubkey = c.takeBytes(33);
  const CInSecp = c.takeBytes(33);
  const CChangeOrSentinel = c.takeBytes(33);
  const CReceiptSecp = c.takeBytes(33);
  const rReceipt = c.takeBytes(32);
  const rangeProofLen = c.takeU16LE();
  const rangeProof = c.takeBytes(rangeProofLen);
  const kernelSig = c.takeBytes(64);
  const intentSig = c.takeBytes(64);
  return { opcode: "T_SWAP_VAR", payload, envelopeVersion, poolId, direction, RAPre, RBPre, deltaIn, deltaInMin, deltaInMax, deltaOut, minOut, tipAmount, tipAsset, expiryHeight, traderPubkey, CInSecp, CChangeOrSentinel, CReceiptSecp, rReceipt, rangeProofLen, rangeProof, kernelSig, intentSig } as any;
}

### decodeTAxferVar

```typescript
function decodeTAxferVar(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const assetId = bytesToHex(c.takeBytes(32));
  const assetInputCount = c.takeU8();
  if (assetInputCount !== 0x01) throw new Error(`T_AXFER_VAR bad asset_input_count=${assetInputCount}`);
  const N = c.takeU8();
  if (N !== 0x02) throw new Error(`T_AXFER_VAR bad N=${N}`);
  const commitments: Uint8Array[] = [];
  const amountCts: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    commitments.push(c.takeBytes(33));
    amountCts.push(c.takeBytes(8));
  }
  const rpLen = c.takeU16LE();
  const rangeproof = c.takeBytes(rpLen);
  const kernelSig = c.takeBytes(64);
  return { opcode: "T_AXFER_VAR", payload, assetId, assetInputCount, N, commitments, amountCts, rpLen, rangeproof, kernelSig } as any;
}

### decodeTWrapperAttest

```typescript
function decodeTWrapperAttest(payload: Uint8Array, c: Cursor): DecodedEnvelope {
  const networkTag = c.takeU8();
  if (networkTag > 0x02) throw new Error(`T_WRAPPER_ATTEST bad network_tag=${networkTag}`);
  const assetId = bytesToHex(c.takeBytes(32));
  const issuerPubkey = c.takeBytes(33);
  const reserves = c.takeU64LE();
  const supply = c.takeU64LE();
  const asOfHeight = c.takeU32LE();
  const timestamp = c.takeU64LE();
  const attestationSig = c.takeBytes(64);
  return { opcode: "T_WRAPPER_ATTEST", payload, networkTag, assetId, issuerPubkey, reserves, supply, asOfHeight, timestamp, attestationSig } as any;
}
---
**Reference:** [Tacit SPEC.md §5.19](https://github.com/z0r0z/tacit/blob/main/SPEC.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
