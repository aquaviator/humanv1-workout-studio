# Triathlon research fixtures

`src/fixtures/research/triathlon-research-dataset.json` is the canonical local dataset assembled from the eight explicitly supplied research parts. The inputs are untrusted research data and are not retained as an executable dependency. The output is always labelled `RESEARCH_CANDIDATE`; sports-science review remains required, and it is neither medical advice nor individualized coaching.

The assembler applies the accepted correction ledger semantically, converts all four plans to schedule schema 1.2, enriches each assignment with an immutable research workout-version dependency, and recomputes weekly discipline, required, optional, maximum, longest-session, priority, training/rest, and rolling four-week totals from the 43-session library. It never creates extra sessions. Invalid legacy evidence aliases are removed instead of being promoted or silently mapped to unrelated publications.

The validator independently checks schema/status, all manifest counts, stable identities, seven-day continuity, assignment ordering, REST/TRAINING invariants, session and immutable-version references, priority values, fixed-duration arithmetic, weekly and rolling arithmetic, race type/cardinality and variable-duration treatment, evidence coverage, and all embedded SHA-256 values.

Checksum scope is canonical UTF-8 JSON with sorted object keys, semantic array order, LF output, and no volatile timestamp or local path. The dataset checksum omits only `manifest.checksums.datasetSha256` from its own input. Session-library, individual-plan, and evidence/safety hashes cover the corresponding complete values.

Regeneration requires eight JSON paths followed by the output path:

```powershell
node scripts/assemble-triathlon-fixtures.mjs <sessions> <half-first> <half-intermediate> <iron-first-1-8> <iron-first-9-16> <iron-intermediate-1-8> <iron-intermediate-9-16> <evidence-safety> src/fixtures/research/triathlon-research-dataset.json
node scripts/validate-triathlon-fixtures.mjs src/fixtures/research/triathlon-research-dataset.json
```

Studio presents these plans in a separate research section. Cloning creates user-owned drafts and leaves the immutable fixtures unchanged. Nothing automatically publishes, imports to production, activates a catalogue release, or overwrites customer data.
