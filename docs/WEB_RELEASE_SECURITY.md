# Web release security

Workout Studio is an invited beta and must not be indexed. `index.html`, `robots.txt`, and the Firebase Hosting `X-Robots-Tag` express that policy independently. This is not access control: authentication and owner-scoped repositories remain mandatory.

Firebase Hosting applies the CSP, HSTS, clickjacking, MIME-sniffing, referrer, and permissions headers to every SPA route. The CSP permits this origin plus the minimum Firebase web channels used by Auth and Firestore. It deliberately excludes `unsafe-eval`; inline style attributes remain allowed for the existing React interaction layer. Google sign-in popups require `same-origin-allow-popups` and the listed Google/Firebase frame origins.

The service worker handles only same-origin `GET` navigation and static shell requests. It does not intercept Firebase, API, mutation, or cross-origin traffic. Each production build derives a SHA-256 content identity from the lockfile, application source, public assets, and HTML. Vite embeds that identity in the registration URL and generated worker cache name, so a changed build cannot silently reuse the prior shell cache.

No web app manifest is supplied. The invited beta does not currently promise installability, icons, standalone display, or OS integration; adding a manifest would make that unsupported promise. Reconsider it only with an explicitly reviewed installable-app product requirement.

Before any preview or live release, run the web-readiness test, TypeScript, production build, and bundle-isolation scan. Inspect `dist/service-worker.js` to confirm the placeholder was replaced, and verify the deployed response headers and Google sign-in popup on the authorized domain. Deployment and production access require separate authorization.
