# Shared Firestore rules compatibility

The deployable `hv1-platform` rules source is temporarily owned by
`aquaviator/Hv1Strength` at `firestore.rules`. This repository carries an exact
compatibility copy for local emulators only. Run `npm run rules:compat` before
tests; set `HV1_SHARED_RULES_PATH` to the governed Strength file to also prove
the two repositories match byte-for-byte. Never deploy this file as an isolated
Workout Studio fragment.
