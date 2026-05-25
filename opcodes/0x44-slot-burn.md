# 0x44 T_SLOT_BURN

> Opcode wire format from the [SPEC-CBTC-ZK-AMENDMENT.md](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) §5.22.
> See the [opcode index](./index.md) for all opcodes or [tacit.finance](https://tacit.finance) for the protocol.

**Self-custody-slot wrapper atomic redeem. Groth16 proof of unspent leaf membership.**

### Wire layout

```
T_SLOT_BURN(1)
|| network_tag(1)
|| asset_id(32)
|| denom_sats_LE(8)
|| merkle_root(32)           BN254 element; from recent-roots window
|| nullifier_hash(32)        Poseidon₁(ν)
|| recipient_commit(33)      compressed; same as leaf commit
|| r_leaf(32)                BN254 element / secp256k1 scalar
|| bind_hash(32)             per §5.11 binding formula
|| proof_length(2)           u16 LE
|| groth16_proof(proof_length)
```

### Constraints
- bind_hash domain: "tacit-withdraw-bind-v1"
- merkle_root must be in recent-roots window
- nullifier_hash must not be in spent-set
- Pedersen check: expected_commit = denom_sats·H + r_leaf·G_secp256k1

---
**Reference:** [SPEC-CBTC-ZK-AMENDMENT.md §5.22](../tacit-spec/spec/amendments/SPEC-CBTC-ZK-AMENDMENT.md) — authoritative wire format definition.
**Index:** [All opcodes](./index.md)
