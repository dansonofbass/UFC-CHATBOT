# Supabase setup

Use the existing project `https://yncdhkxnzgvxacfvbjgm.supabase.co`. Do not create a replacement. Configure the URL and publishable key from its dashboard plus its server secret in `.env.local`. The secret is only referenced by server modules and CLI jobs; clients never initialize a privileged connection.

All three existing migrations were applied to the existing project on 19 November 2026 after inspection showed no public application tables. Its preinstalled pgvector extension lives in `extensions`, so vector types/operators and function search paths explicitly use that schema.

`npm run db:migrate` is an additive migration runner. Supply the verified `SUPABASE_DB_HOST` and `SUPABASE_DB_PASSWORD` through the process environment; the password is not persisted by the runner or embedded in a URL. It verifies the official Supabase CA and pooler hostname, locks concurrent migration sessions, refuses unreviewed public-table baselines, records checksums in private `app_migrations`, and commits each migration and ledger entry atomically. Applied migrations with matching checksums are skipped. Never edit an applied migration; add a new file. Direct IPv6 connectivity was unavailable locally, so the authenticated IPv4 session pooler was used without disabling TLS verification.

The schema contains fighters, aliases, events, fights, fight statistics, official ranking snapshots, news metadata, sources, knowledge documents/chunks, ingestion runs, usage counters, provider usage, private retrieval cache, and UFC-only career-history rows. Event and fighter identities use provider IDs; document and news IDs use deterministic SHA-256 digests. Upserts are idempotent. Records keep original source URLs and import timestamps. Rankings separately retain source snapshot dates.

RLS is enabled on every table. Public roles have only SELECT policies for public records, and no INSERT, UPDATE or DELETE privileges. Operational tables are private. `consume_budget` is an atomic, parameterized service-role-only RPC, with a fixed search path. `search_knowledge` returns bounded public source chunks. Arbitrary model-generated SQL is never executed.

`npm run db:check` passed live: public reads succeed, anonymous inserts are denied, operational usage is isolated, and anonymous budget RPC execution is denied. It performs a disposable sentinel write probe; if the write unexpectedly succeeds it removes the sentinel using the admin client and reports a security failure. Repeat only against the reviewed project when RLS changes justify it.

Optional maintenance in an authorized SQL session: delete expired `query_cache` and `usage_buckets`, and prune old `provider_usage` / `sync_runs` according to your published retention policy. Expiry checks already enforce logical expiration. Verify migrations and indexes in your actual project; local schema review is not live RLS verification.
