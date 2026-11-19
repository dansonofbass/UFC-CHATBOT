# OCTAGON chat refactor review

Prepared 19 November 2026. Branch: `feat/intelligent-source-grounded-chat`.

## Baseline and preservation

The initial local checkout was `1246134` on `feat/octagon-intelligence`, with a clean working tree. Before implementation: all 38 Vitest tests, TypeScript, ESLint, production build and the secret scan passed. Chromium was unavailable at Playwright's default location. With installed Chrome, six browser cases passed and three failed because an old test assumed missing credentials although this workspace has working integrations.

A later remote audit established that this checkout was stale. The current remote feature branch, `f7da881`, contained the Russo One styling, chat-focused navigation, Admin console, session authentication, additional live adapters and tighter model limits. It was merged into the dedicated refactor branch. The current UI, CSS, font, Admin implementation, routes and environment values are preserved. The final diff against that remote branch contains the chat refactor and its verification files, rather than reverting those remote changes. Main was never checked out for implementation or modified.

Audit boundaries covered chat request validation and client NDJSON consumption; classification and fighter matching; structured, lexical and optional vector retrieval; Supabase schemas/RLS/budget RPC; documented UFCalendar endpoints and ingestion; Groq/free OpenRouter fallback; cache keys and expiry; public/private diagnostics; Admin sessions; configuration, CI and existing tests.

## Files and architecture

| Files | Change |
| --- | --- |
| `src/lib/understanding.ts` | Directory-driven Unicode normalization, aliases/nicknames, bounded edit distance, confidence thresholds, multiple subjects/intents, nearest user context and ambiguity handling. No new fighter-name mapping table. |
| `src/lib/model-understanding.ts` | Optional schema-validated Groq planning for unresolved questions. No arbitrary tools, URLs, SQL or invented fighter IDs. Known deterministic intents bypass planning. |
| `src/lib/intelligent-retrieval.ts` | Source-aware orchestration of verified profiles, scoped records, history, bouts/statistics, events, rankings, news and lexical knowledge; validation, freshness checks, conflict withholding, deterministic answers and evidence gaps. |
| `src/lib/live-retrieval.ts` | Authorized UFCalendar requests sharing ingestion's monthly allocation and persistent quota block; optional explicitly configured Brave Search adapter. |
| `src/lib/retrieval-config.ts`, `.env.example` | Server-only opt-in flags and bounded request caps. Existing environment values are untouched. |
| `src/lib/cache.ts` | Cache version and configuration/history isolation; short evidence expiry; unavailable/ambiguous/degraded results are not persisted. |
| `src/lib/db.ts` | Honor caller cancellation in addition to the existing database timeout. |
| `src/app/api/chat/route.ts` | Select legacy or new retrieval using the master flag; maintain hourly/daily quotas, cancellation and NDJSON source/text/done/error frames. |
| `src/lib/ai.ts`, `src/lib/retrieval.ts` | Preserve 450-token/20-second generation and provider policy; stricter evidence/units/null handling; reject empty model completions; extend evidence metadata. Legacy retrieval remains available. |
| `tests/{understanding,intelligence,live-retrieval,cache,chat-api,model-understanding,admin}.test.ts` | New regression and integration coverage. |
| `tests/ai.test.ts`, `tests/e2e/site.spec.ts` | Empty-completion regression, explicit unavailable-API browser fixture, screenshots in ignored test outputs. |
| `scripts/verify-chat.ts`, `scripts/benchmark-chat.ts` | Opt-in real HTTP smoke checks and reproducible synthetic routing benchmark. |
| `docs/chat-live-results.json`, `docs/chat-context-live-results.json`, `docs/chat-benchmark.json` | Dated results and explicit benchmark limits. |

Request flow: validated chat → persistent client budget → directory understanding → configuration-isolated evidence cache → optional bounded model plan → Supabase → UFCalendar if insufficient → optional configured web discovery → validated evidence or clarification → deterministic response or bounded Groq synthesis → existing NDJSON UI.

Only private operational cache/budget/usage rows are written by the new path. There are no migrations, imports, deletions or fighter/event upserts in the refactor. Existing data and the legacy ingestion path remain intact. A live RLS probe confirmed anonymous write denial and private-table/RPC protection; its existing script includes cleanup only if its disposable unauthorized write unexpectedly succeeds.

## Flags and limits

All new flags default to `false`. Enable `CHAT_INTELLIGENCE_ENABLED` to select the new path; independently enable `CHAT_LIVE_RETRIEVAL_ENABLED` and `CHAT_MODEL_UNDERSTANDING_ENABLED` when desired. `CHAT_WEB_SEARCH_ENABLED` additionally requires `WEB_SEARCH_PROVIDER=brave` and a privately configured `BRAVE_SEARCH_API_KEY`. No search provider was configured or claimed to be live.

Request-time UFCalendar access retains credential slot one only. It reserves each attempted request against the same account/month bucket as ingestion and the existing persistent quota block. Its local monthly ceiling cannot exceed 80; a chat retrieval also has a maximum of three attempts and a default shared daily ceiling of 20. A 429 persists the quota block through the next UTC month and never rotates credentials. No counters were reset, quotas increased or provider failures deliberately triggered live.

Groq `openai/gpt-oss-120b` remains primary. Free OpenRouter fallback remains explicitly opt-in and retains the existing recovery restrictions. Generation remains capped at 450 output tokens, 20 seconds and zero SDK retries. Optional planning has its own shared AI reservation, 450-token cap, five-second timeout and no fallback. The request has a 55-second overall cancellation signal; retrieval providers share a 20-second signal and the existing per-call timeout.

Evidence cache entries last at most 60 seconds. Current event/ranking freshness checks use 15 minutes, profile snapshots use 24 hours, and recent news requires publication within seven days. A source timestamp is an observation/snapshot, not proof of global dataset completeness. Unlike the legacy adapters, the new path does not mutate canonical tables on a cache miss. New behavior is opt-in; legacy provider cooldowns remain in the legacy adapters.

## Verification

- Final unit/regression/integration suite: 90 tests across 13 files passed. Network faults, quota exhaustion, invalid credentials and optional search behavior are mocked, not induced against real accounts.
- TypeScript, ESLint and production build passed after merging the current remote UI and Admin implementation.
- Nine browser cases passed against the merged application at desktop/mobile/320px, covering navigation, redirects, Admin sign-in visibility and a controlled infrastructure-failure response. The first merged run reused an older server/build; it was stopped and the tests rerun against a fresh server.
- Known-secret scan passed. `npm audit --audit-level=high` reported zero vulnerabilities, including development dependencies. These checks do not establish a complete security certification.
- Live Supabase RLS probe passed: public reads, anonymous write denial, private usage isolation and privileged budget-RPC denial.
- Real local HTTP chat checks: Jon Jones, John Jones, Jon Jons and Bones resolved to the stored Jon Jones identity; recent-event retrieval returned validated UFCalendar completed-event details; an unknown fixture fighter received a clarification without invented facts. Unauthorized internal diagnostics returned 401. Actual source-grounded responses are recorded in `chat-live-results.json`. A further real follow-up resolved ?he? to Jon Jones and retrieved dated career history (8.56 seconds). A comparison identified a missing Tom Aspinall profile, retrieved it without altering canonical tables, and returned both scoped records (6.52 seconds). The initial comparison gap and successful regression are retained in `chat-context-live-results.json`.
- The initial live generative profile check revealed incorrect interpretation of statistic units and missing counts. Simple profile and record answers now use scoped source strings directly, irrelevant statistics are omitted, and the synthesis prompt forbids those interpretations. Subsequent live checks showed concise deterministic answers with public publisher links.
- Synthetic routing benchmark: seven cases repeated 100 times, 100% expected identity/intent matches. The JSON report contains measured p50/p95 and live request latencies. This is not an independent real-world factual-accuracy benchmark.

## Preview deployment status

The connected destination was verified as Vercel team `dansonofbass-projects`, project `octagon-ai`. Existing Preview credentials were inspected only as metadata, without decrypting or copying secrets. No production configuration was changed.

**Blocked pending source-publication approval.** Automatic approval review rejected the push to the public `dansonofbass/UFC-CHATBOT` repository because the specific source/configuration payload had not been explicitly approved for public publication. No Git push occurred. Branch-scoped Preview flag setup was attempted before publication and Vercel rejected it because the branch does not yet exist remotely; no flags were created. No Preview deployment was created and no production deployment was requested.

After approval: push only the final reviewed commit on this feature branch, enable the three non-web flags for this branch's Preview target, create a deployment explicitly targeting Preview at the reviewed SHA, wait for READY, and verify real protected HTTP behavior and Admin access. Do not promote or modify production.

## Remaining limitations and readiness

- Ready for code review and local evaluation; **not approved for production**. Preview creation and deployed API verification remain outstanding.
- Optional Brave Search is implemented against its [official API contract](https://api-dashboard.search.brave.com/api-reference/web/search/get), but untested with a real credential. Results are restricted to public UFC/UFCStats links and labeled discovery-only. Excerpts cannot establish records, rankings, results or confirmed news; there is no arbitrary-page crawler or independent fact-verification service.
- Directory reads are bounded to 2,000 fighters and 4,000 imported aliases (the server/database row cap may be lower). Full-name fuzzy matching permits at most two edits at confidence ≥0.78; single nicknames require an exact normalized match. Low-confidence/ambiguous names require clarification. This is not universal multilingual entity recognition.
- Multi-fighter comparison works for recognized directory identities and can look up one explicitly named missing participant under the shared request budget. Ambiguous/unavailable participants require clarification; the retrieval budget may prevent fetching every missing record in a compound request.
- Dataset gaps, subscription coverage and source freshness still bound answers. The latest available event/bout is not necessarily globally complete. No permitted news feed or independent current-news verification was added.
- Cancellation is propagated to new database retrieval queries and provider calls; directory alias reads and legacy data helpers retain their existing per-call database timeout.
- Model-generated explanations can still require human review. Schema validation and source-only prompts do not prove semantic correctness. A larger independent, dated evaluation dataset is needed before claiming broad factual accuracy or a latency SLA.

## Rollback

Set `CHAT_INTELLIGENCE_ENABLED=false` in the affected environment and redeploy the reviewed commit to return to legacy routing/retrieval. Also disable the live/model/web flags for clarity. Cache keys include the retrieval mode, so new evidence entries are not reused by legacy mode. Do not delete database rows or reset quota counters.

The existing production deployment was not changed. The pre-refactor remote application is recorded at `f7da881eb74b444be6fdf2e7586316ff15d19197`; checkpoint `f1848c8` preserves the initial refactor before the remote UI merge. Keep the tested production deployment available until a separately reviewed release. Any future production rollback or promotion requires its own authorized release action.
