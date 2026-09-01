# Repository working agreement

These instructions apply to every automated worker in this repository.

- Inspect the real branch, HEAD, working tree, repository configuration, and existing tests before changing anything. Never rely on a prior conversational summary.
- Complete coherent user journeys across domain contracts, repositories, UI state, security rules, migrations, and tests. Preserve backward compatibility unless the task explicitly changes a contract.
- Keep trusted ownership and governed data checks inside authenticated repository boundaries. Browser code must not write identity mappings, entitlements, governed catalogue releases, active catalogue pointers, or immutable published versions after creation.
- Use focused tests while implementing. Whenever cloud behaviour or Firestore rules change, run the Auth and Firestore emulators and prove owner isolation, denial paths, retry behaviour, and acknowledgement-gated success.
- Run the full release gates in `docs/DEVELOPMENT_WORKFLOW.md` at preview and release boundaries. Do not weaken rules, types, tests, or timeouts to make a gate pass.
- Deploy only a named, expiring Firebase Hosting preview after authoritative repository configuration, approved production web configuration, and an authenticated CLI session are all present. Verify the preview in a browser.
- Production Firestore rules, production data mutations, live Hosting deployment, Authentication-provider changes, and custom-domain changes require explicit user authorization. A preview request does not authorize them.
- Never expose or commit secrets, tokens, Firebase login state, service-account files, real `.env` files, private workout payloads, emulator logs, caches, or temporary diagnostics.
- Preserve unrelated user changes. Commit coherent local work, but do not push unless explicitly authorized.
- Continue through ordinary defects without pausing for conversational approval. Stop only for an unsafe action, missing credential, absent authoritative deployment value, or external authorization.
- Finish with one concise Done/TODO receipt including verification totals, deployment state, remaining blockers, commit, and working-tree state.

