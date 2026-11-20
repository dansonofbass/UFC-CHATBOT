# Admin provider and key-slot switching

Branch: `feat/admin-provider-key-switching`, based on refactor commit `81f563f32a03582982964a3491832f9291040dbc`.

## Scope and location

Open the existing `/admin` dashboard and sign in using the existing Admin authentication. The compact **AI Provider Settings** section selects the active AI provider, each provider's configured key slot and an allowlisted model. **UFC Data Provider Settings** supports UFCalendar only and its genuinely configured credential slots. This replaces the previous UFCalendar test-only panel; the remaining dashboard stays in place.

There is no secret editor. Slot labels are masked and show Configured/Missing. Actual token values remain in server environment variables. Tests run only when an authenticated Admin clicks a test action; page load makes no provider calls.

## Environment variables

| Variables | Purpose |
| --- | --- |
| `GROQ_API_KEY`, `GROQ_API_KEY_2` | Groq primary/secondary key slots. The existing primary name is unchanged. |
| `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2` | OpenRouter primary/secondary key slots. |
| `GROQ_MODEL`, `OPENROUTER_MODEL` | Existing configured default models; defaults remain unchanged. |
| `GROQ_MODELS`, `OPENROUTER_MODELS` | Optional comma-separated additional model IDs shown by Admin. The default model is included automatically. OpenRouter retains the existing free-model-only policy (`openrouter/free` or IDs ending `:free`). |
| `UFCALENDAR_API_KEY_1`, `_2`, `_3` | Existing UFCalendar slots; only configured slots can be selected/tested. No new account or secret is created. |
| `UFCALENDAR_ACTIVE_KEY` | Existing bootstrap preference before a saved selection. If unavailable, the only/first configured slot is used for defaults. A saved missing slot fails validation rather than rotating silently. |
| `ALLOW_OPENROUTER_FALLBACK` | Existing Groq-to-free-OpenRouter fallback policy. No reverse fallback or automatic same-provider key rotation was added. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Existing server-side persistent settings access. Existing publishable-key configuration remains unchanged. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Existing Admin authentication; unchanged. |

Configure secrets privately in Vercel and `.env.local`. After adding/changing environment variables, redeploy the intended Preview (or restart local Next.js) so the server receives them. Once both slots exist in that deployment, switching the saved selection does not require another deployment. No Production environment values were changed by this task.

## Selecting Key 2

1. Configure `OPENROUTER_API_KEY_2` or `GROQ_API_KEY_2` server-side and deploy/restart as above.
2. In Admin, select **OpenRouter** or **Groq** under **Active AI Provider**.
3. Set that provider's **Active … key slot** to **Key 2** and choose a configured model.
4. Click **Save provider settings**. Subsequent generation/planning requests resolve the saved provider, slot and model from Supabase.
5. Optionally click **Test OpenRouter Key 2** or **Test Groq Key 2**. A draft selection can be tested before saving; testing does not change the active selection.

Use the UFCalendar credential selector to choose an existing slot, save, then test explicitly if desired. With one configured credential, it is shown as active and the selector is disabled.

## Storage, security and runtime

No schema migration is required. Non-secret preferences use the existing private `query_cache` table, under `admin:provider-settings:v1:<environment>`, with a far-future expiration. Production, Preview and development selections are separate. The row contains only provider names, slot numbers and model IDs. It persists across page refreshes, sessions, server restarts and deployments. The existing cache table is service-role-only; an actual anonymous-read check was denied.

The server rereads and validates saved selections for relevant requests; there is no indefinite process cache. Generation takes a validated selection snapshot for its budget reservation and provider call. Model planning uses the selected AI provider too. UFCalendar chat adapters use only the selected credential, retaining existing account-wide quota controls and response caching. Fighter ingestion, embeddings and sync scripts were not modified.

The Admin API is `/api/admin/provider-settings`: authenticated GET, origin-protected POST, strict Zod request/settings validation, bounded payloads and no-store responses. Neither endpoint returns keys. URLs are fixed server-side; clients cannot supply API hosts or arbitrary model IDs. Missing saved slots and removed models are rejected instead of silently selecting another key.

The answer system prompt, output-token configuration, chat UI, conversation history, streaming and retrieval flow are unchanged. Existing automatic fallback remains limited to configured free OpenRouter following a recoverable Groq failure before any text. Internal diagnostics include provider name, slot, model and whether the call is fallback; credentials and raw provider errors are excluded.

## Connection tests

AI tests make one bounded server-side completion request with an eight-token output cap and no application-level retry. Results distinguish missing configuration, rejected credentials/access, unavailable models, rate limits, exhausted credits and service failures. Tests obey existing internal AI allowances. No response text, raw exception, token or authentication header is returned.

UFCalendar tests use documented `/usage`, reserve the existing shared monthly account allowance, respect quota/rate cooldowns and permit at most one external request per action. The UI warns that a request is consumed. No key testing happens automatically on page load. The previous Admin credential-test endpoint now delegates to the same quota-aware adapter.

## Files changed

- `src/lib/provider-settings.ts`: private persistence, allowlists, slot validation and runtime selection.
- `src/lib/provider-connection-test.ts`: bounded, sanitized AI/UFCalendar connection actions.
- `src/app/api/admin/provider-settings/route.ts`: protected settings/test API.
- `src/components/admin-provider-settings.tsx`, `src/app/admin/page.tsx`: compact Admin controls and slot-aware status.
- `src/lib/env.ts`, `.env.example`: optional secondary keys and model allowlists.
- `src/lib/ai.ts`, `src/lib/model-understanding.ts`, `src/app/api/chat/route.ts`: selected AI resolution only; prompts/answer limits unchanged.
- `src/lib/live-retrieval.ts`, `src/lib/live-fighter.ts`, `src/lib/latest-completed.ts`: selected UFCalendar credential resolution only.
- `src/app/api/admin/credentials/route.ts`: reuse the bounded quota-aware test adapter.
- Focused unit/integration/browser tests and `playwright.admin.config.ts`.

## Verification

- Full Vitest suite: **161 passed**. Includes primary/secondary slots, both AI provider directions, model allowlisting, persistence, missing keys, authorization/origin checks, redaction, connection success/failure/429, UFCalendar selection/status and existing fallback/NDJSON streaming regression.
- ESLint, TypeScript and production build: **passed**.
- Focused Admin browser tests: **3 passed**, desktop/mobile/320px. Synthetic authenticated sessions and mocked settings/provider-test responses verify selection, save, refresh persistence, connection-action feedback and new-panel containment without external provider calls.
- Real Supabase development row: defaults written, separate reads matched, strict schema validation passed, anonymous access denied. No Production/Preview selection was changed by that persistence check.
- Secret scan: **passed**. No key values were printed or committed.
- Answer system prompt/output-token setting compared with the refactor baseline: **unchanged**. No homepage, chat UI, embeddings, ingestion or fighter-sync changes.

Real secondary-key connection tests were not automatically run: the new secret values are to be configured manually. Browser connection tests use synthetic responses, not live provider quota. Privileged Preview login requires the existing operator credentials. Production deployment/promotion is not authorized and was not performed.
