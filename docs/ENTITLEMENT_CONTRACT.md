# Workout Studio entitlement contract

Workout Studio verifies HumanV1 introductory access through the authenticated
`initializeAccountTrial` backend in `hv1-platform`. The backend owns
`accounts/{firebaseUid}/entitlements/human_v1` and returns `ACTIVE`, `EXPIRED`,
or `DISABLED` with server time. Studio never creates an introductory period,
calculates one from account age, or writes entitlement documents directly.

The browser caches only an owner-bound backend receipt. Active receipts may be
used offline for at most seven days and never beyond the server-issued end
time. Expired evidence remains expired. Missing, malformed, stale, wrong-owner,
or unreachable verification maps to `VERIFICATION_UNAVAILABLE` and authoring
remains blocked.

Google Play subscription verification is a separate Strength/backend contract.
Until the backend publishes a user-addressable normalized current-entitlement
projection, Studio must not infer paid membership from the HumanV1
introductory-access record or token-keyed Play documents.
