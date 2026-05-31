# Tacit Protocol Opcode Wire Formats

> Wire format reference for all Tacit protocol opcodes.
> The authoritative spec lives at [`tacit-spec/SPEC.md`](../tacit-spec/SPEC.md) §1.1 (canonical opcode table).

## Core shipped opcodes (SPEC.md wire format documented below)

| Opcode | Name | Section | Status | Wire Format Doc |
|--------|------|---------|--------|-----------------|
| `0x21` | T_CETCH | §5.1 | ✅ Shipped | [`0x21-cetch.md`](./0x21-cetch.md) |
| `0x22` | T_CXFER_BPP | CXFER-BPP §5.47 | ✅ Shipped | [`0x22-cxfer-bpp.md`](./0x22-cxfer-bpp.md) |
| `0x23` | T_CXFER | §5.2 | ✅ Shipped | [`0x23-cxfer.md`](./0x23-cxfer.md) |
| `0x24` | T_MINT | §5.3 | ✅ Shipped | [`0x24-t-mint.md`](./0x24-t-mint.md) |
| `0x25` | T_BURN | §5.4 | ✅ Shipped | [`0x25-t-burn.md`](./0x25-t-burn.md) |
| `0x26` | T_AXFER | §5.7 | ✅ Shipped | [`0x26-t-axfer.md`](./0x26-t-axfer.md) |
| `0x27` | T_PETCH | §5.8 | ✅ Shipped | [`0x27-t-petch.md`](./0x27-t-petch.md) |
| `0x28` | T_PMINT | §5.9 | ✅ Shipped | [`0x28-t-pmint.md`](./0x28-t-pmint.md) |
| `0x29` | T_DEPOSIT | §5.10 | ✅ Shipped | [`0x29-t-deposit.md`](./0x29-t-deposit.md) |
| `0x2A` | T_WITHDRAW | §5.11 | ✅ Shipped | [`0x2A-t-withdraw.md`](./0x2a-t-withdraw.md) |
| `0x2B` | T_DROP | §5.12 | ✅ Shipped | [`0x2B-t-drop.md`](./0x2b-t-drop.md) |
| `0x2C` | T_DCLAIM | §5.13 | ✅ Shipped | [`0x2C-t-dclaim.md`](./0x2c-t-dclaim.md) |
| `0x37` | T_AXFER_VAR | §5.7.9 | ✅ Shipped | [`0x37-t-axfer-var.md`](./0x37-t-axfer-var.md) |
| `0x38` | T_WRAPPER_ATTEST | §5.19 | ✅ Shipped | [`0x38-t-wrapper-attest.md`](./0x38-t-wrapper-attest.md) |

## Shipped amendment opcodes

| Opcode | Name | Section | Description |
|--------|------|---------|-------------|
| `0x43` | [T_SLOT_MINT](./0x43-slot-mint.md) | CBTC-ZK §5.21 | Self-custody-slot wrapper atomic mint |
| `0x44` | [T_SLOT_BURN](./0x44-slot-burn.md) | CBTC-ZK §5.22 | Self-custody-slot wrapper atomic redeem |
| `0x45` | [T_SLOT_ROTATE](./0x45-slot-rotate.md) | CBTC-ZK §5.23 | Self-custody-slot wrapper key rotation |
| `0x46` | [T_SLOT_SPLIT](./0x46-slot-split.md) | CBTC-ZK-FUNGIBILITY §5.24 | Atomic 1→N slot split |
| `0x47` | [T_SLOT_MERGE](./0x47-slot-merge.md) | CBTC-ZK-FUNGIBILITY §5.25 | Atomic N→1 slot merge |
| `0x49` | [T_CBTC_TAC_DEPOSIT](./0x49-cbtc-tac-deposit.md) | CBTC-TAC §5.47 | LP-shaped mint: cBTC.zk + TAC → cBTC.tac |
| `0x4A` | [T_CBTC_TAC_WITHDRAW](./0x4A-cbtc-tac-withdraw.md) | CBTC-TAC §5.47 | Cooperative cBTC.tac unwind |
| `0x4B` | [T_CBTC_TAC_FORCE_CLOSE](./0x4B-cbtc-tac-force-close.md) | CBTC-TAC §5.47 | Permissionless liquidation |
| `0x4C` | [T_CTAC_LIEN_CLAIM](./0x4C-ctac-lien-claim.md) | CBTC-TAC §5.47 | Burn cBTC.tac → pro-rata LP-share |
| `0x4F` | [T_CTAC_LIEN_SPLIT](./0x4F-ctac-lien-split.md) | CBTC-TAC §5.47 | Split liened LP-share UTXO |
| `0x57` | [T_CBTC_TAC_DEPOSIT_ATOMIC](./0x57-cbtc-tac-deposit-atomic.md) | CBTC-TAC §5.48 | Atomic LP_ADD + DEPOSIT |
| `0x58` | [T_CBTC_TAC_WITHDRAW_ATOMIC](./0x58-cbtc-tac-withdraw-atomic.md) | CBTC-TAC §5.49 | Atomic WITHDRAW + LP_REMOVE |
| `0x59` | [T_CBTC_TAC_TOP_UP](./0x59-cbtc-tac-top-up.md) | CBTC-TAC §5.50 | Lien top-up |
| `0x5A` | [T_CBTC_TAC_BOND_RELEASE](./0x5A-cbtc-tac-bond-release.md) | CBTC-TAC §5.51 | Partial bond release |
| `0x5B` | [T_PREAUTH_BID](./0x5B-preauth-bid.md) | PREAUTH-BID §5.7.11 | Buyer-offline preauthorized bid |
| `0x5C` | [T_PREAUTH_BID_VAR](./0x5C-preauth-bid-var.md) | PREAUTH-BID-VAR §5.7.12 | Partial-fill preauthorized bid |

## Drafted AMM opcodes (AMM.md)

| Opcode | Name | Section | Wire Format |
|--------|------|---------|-------------|
| `0x2D` | T_LP_ADD | AMM.md §5.14 | [`0x2D-t-lp-add.md`](./0x2d-t-lp-add.md) |
| `0x2E` | T_LP_REMOVE | AMM.md §5.15 | [`0x2E-t-lp-remove.md`](./0x2e-t-lp-remove.md) |
| `0x2F` | T_SWAP_BATCH | AMM.md §5.16 | [`0x2F-t-swap-batch.md`](./0x2f-t-swap-batch.md) |
| `0x30` | T_INTENT_ATTEST | AMM.md §5.17 | [`0x30-t-intent-attest.md`](./0x30-t-intent-attest.md) |
| `0x31` | T_PROTOCOL_FEE_CLAIM | AMM.md §5.18 | [`0x31-t-protocol-fee-claim.md`](./0x31-t-protocol-fee-claim.md) |
| `0x32` | T_SWAP_VAR | SPEC-SWAP-VAR-AMENDMENT.md §5.20 | [`0x32-t-swap-var.md`](./0x32-t-swap-var.md) |
| `0x33` | T_SWAP_ROUTE | SPEC-SWAP-ROUTE-AMENDMENT.md §5.22 | [`0x33-t-swap-route.md`](./0x33-t-swap-route.md) |

## All opcodes (from SPEC.md §1.1 canonical table)

The canonical opcode table in [`tacit-spec/SPEC.md §1.1`](../tacit-spec/SPEC.md) defines the complete set of all shipped (✅), drafted (📝), reserved (🔒), and free (⬜) opcode bytes. All opcode constants, names, and status metadata are maintained in [`src/config.ts`](../src/config.ts) as `OPCODES_INFO`.

| Status | Count | Key hex ranges |
|--------|-------|----------------|
| ✅ **Shipped** | 30 | `0x21`–`0x28`, `0x37`–`0x38`, `0x43`–`0x47`, `0x49`–`0x4C`, `0x4F`, `0x57`–`0x5C` |
| 📝 **Drafted** | 27 | `0x2D`–`0x36`, `0x39`–`0x3E`, `0x50`–`0x56`, `0x60`–`0x63` |
| 🔒 **Reserved** | 9 | `0x3F`–`0x42`, `0x48`, `0x4D`–`0x4E`, `0x5D`–`0x5E` |
| ⬜ **Free** | 151 | `0x5F`, `0x64`–`0xFF` |

> Each opcode file in this directory contains: wire format table → constraints → TypeScript interface → decode function stub, referencing the authoritative [`tacit-spec/SPEC.md`](../tacit-spec/SPEC.md).
>
> Amendment-defined opcodes (slot, cBTC.tac, governance, etc.) are documented in their respective amendment specs under [`tacit-spec/spec/amendments/`](../tacit-spec/spec/amendments/).

---

## Decode function stubs

To add per-opcode payload structure parsing in `src/lib/envelope.ts`, wire each decode function into the `decodePayload` switch:

```typescript
case OPCODES.CETCH:
  envelope = decodeCetch(payload, c);
  break;
case OPCODES.CXFER:
  envelope = decodeCxfer(payload, c);
  break;
// ... (see individual opcode files for the decode function body)
case OPCODES.T_WRAPPER_ATTEST:
  envelope = decodeTWrapperAttest(payload, c);
  break;
```

Each opcode file includes a `function decode<Opcode>(...)` stub at the bottom that parses the payload, validates constraints, and returns a structured `DecodedEnvelope`.
