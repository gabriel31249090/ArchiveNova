# ArchiveNova v4.9.1 — Final Stabilization

This patch marks the feature freeze for the current ArchiveNova release line.

## Included

- Added covering indexes for all Writer Experience foreign keys reported by the Supabase performance advisor.
- Bumped the public service-worker cache namespace so existing clients receive the stabilized release cleanly.
- Kept Writer Experience tables RPC-only: direct table privileges remain revoked from `anon` and `authenticated`, while authenticated RPC functions enforce ownership and application rules.
- Preserved the existing public-only service-worker navigation cache. Private writer, beta, dashboard and account routes are not navigation-cached.

## Intentionally unchanged

- Existing public/authenticated `SECURITY DEFINER` RPCs were not bulk-converted or revoked. Their exposure must be evaluated function-by-function because many are the application's intended API surface.
- The `citext` extension was not moved between schemas in a stabilization patch because doing so can break dependent objects.
- Existing indexes were not removed merely because they are currently reported as unused; this project is young and usage statistics are not yet a reliable deletion signal.

## Release checks

The release is considered ready when:

1. TypeScript typecheck passes.
2. Next.js production build passes.
3. Supabase performance advisor no longer reports unindexed Writer Experience foreign keys.
4. Vercel preview and production deployments are READY.
5. No new production runtime errors appear after deployment.
