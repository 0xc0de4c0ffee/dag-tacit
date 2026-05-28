# Ceremony Artifacts

Groth16 verification keys for tacit protocol circuits, fetched from IPFS ceremony bundles with original filenames preserved.

## Mixer Circuit (T_WITHDRAW 0x2A)

**Bundle CID**: `bafybeidq2ahzte4sfiqjsmhqta62ufenpppzpch5ppry55tzxzlvltxy2u`
**Source**: `tacit-spec/dapp/tacit.js:222` (`CANONICAL_CEREMONY_CID`)

| File | Size | Description |
|------|------|-------------|
| `mixer/verification_key.json` | 3.6 KB | Canonical Groth16 verifying key |
| `mixer/verification_key_final.json` | 3.6 KB | Identical to verification_key.json |
| `mixer/attestations.json` | 9.5 MB | Ceremony attestation chain (2,229 records) |

Large files (download on demand, gitignored):
- `withdraw_final.zkey` (~300 MB) — beacon-applied proving key
- `withdraw_pre_beacon.zkey` — pre-beacon head zkey
- `withdraw.r1cs` — circuit constraint system
- `pot14_final.ptau` — Phase 1 powers-of-tau

## AMM Circuits (T_SWAP_BATCH 0x2F, T_LP_ADD 0x2D, T_LP_REMOVE 0x2E)

**Standalone VK CID**: `bafkreibjpe4xfqtq2ziki4uupydnkeiakqi76m674xtdhmxnfbrn4iomp4`
**Source**: `tacit-spec/dapp/tacit.js:13558` (`CANONICAL_AMM_VK_CID`)

| File | Size | Description |
|------|------|-------------|
| `amm/amm_verification_key.json` | 29.8 KB | Combined VK for lp_add, lp_remove, swap_batch |

## Usage in Code

`src/lib/verify.ts` locates VKs at `ceremony/<circuit>/<file>`. Currently only structural proof checks (non-empty, well-formed) are performed. Full Groth16 verification requires a bn254 pairing library.
