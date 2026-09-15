# NovaDrop 01 — ArchiveNova v4.7

## Theme

**Discovery & Creation**

The first NovaDrop moves ArchiveNova from a feature-complete foundation toward a product experience centered on:

**Discover → Read → Follow → Create → Return**

## User-facing changes

- Discovery 2.0 with instant work/author/fandom/tag suggestions.
- Saved searches and reusable discovery filters.
- Personalized Home with continue-reading, followed authors, transparent recommendations and recent works.
- Recommendation reasons are shown to the reader instead of using opaque ranking labels.
- Under-discovered works receive a bounded discovery boost so popularity is not the only ranking signal.
- Larger Kudos and Bookmark actions with solid active states and improved touch targets.
- Profile 2.0 with optional avatar, banner, website, location, favorite fandoms and featured work.
- Public series and collections can appear on creator profiles.
- Fandom/Tag/Character/Relationship pages are expanded into content hubs.
- Notifications 2.0 adds categories and date grouping.
- Admin Center adds platform health and runtime feature flags.

## Performance work

- /home no longer loads the legacy monolithic ArchiveNovaApp.
- Normal /explore traffic uses a dedicated Discovery component.
- The legacy auth experience is preserved as a separate lazy chunk for /explore?auth=login|register.
- Tiptap local editor code is lazy-loaded in WriterStart.
- DOCX and PDF parsers are imported only when the corresponding format is uploaded.
- Card-heavy sections use content-visibility where safe.
- Supabase work-card normalization is centralized for new surfaces.
- Feature flags are cached locally for five minutes to avoid repeated rollout checks.

## Compatibility / rollback

- Existing RPCs and user flows remain available.
- The legacy ArchiveNovaApp is intentionally retained as a compatibility path.
- NovaDrop database work is additive except for same-signature RPC upgrades that preserve existing payload fields.
- Feature flags allow Discovery 2.0, personalized Home, Profile 2.0, Fandom Hubs and Saved Searches to be disabled independently.
- No existing user data is deleted by NovaDrop migrations.

## Database migrations

- 202609150004_novadrop_discovery_creation.sql
- 202609150005_novadrop_hardening.sql

Both migrations were applied to the production Supabase project and the remote migration history was normalized to the repository filenames.

## Validation

Database:
- authenticated NovaDrop smoke test: NOVADROP_DB_SMOKE_OK
- anonymous public-surface smoke test: NOVADROP_ANON_OK

Security/performance advisors after hardening:
- no RLS init-plan warnings
- no uncovered foreign-key warning introduced by NovaDrop
- no duplicate permissive-policy warning
- no duplicate-index warning
- remaining SECURITY DEFINER warnings are reviewed public/authenticated RPC surfaces
- unused-index warnings are intentionally retained until meaningful production traffic exists

## Release rule

Do not merge the NovaDrop PR unless:
1. GitHub typecheck/build is green on the final SHA.
2. Vercel reports a successful preview deployment.
3. Supabase migrations are present in remote history.
4. Core public and authenticated RPC smoke tests pass.