# Provider configuration

## Groq

Set `GROQ_API_KEY`; `GROQ_MODEL` defaults to the requested `openai/gpt-oss-120b`. The server uses the OpenAI-compatible chat model at `https://api.groq.com/openai/v1`. Confirm this model is enabled for your actual account. Set provider-side spend limits and use a free allocation; this application never purchases credits. See [Groq compatibility docs](https://console.groq.com/docs/openai).

## OpenRouter

Set `OPENROUTER_API_KEY` and explicitly enable `ALLOW_OPENROUTER_FALLBACK=true`. The default is `openrouter/free`; only that router or IDs ending in `:free` are allowed. The default state is disabled. Endpoint base: `https://openrouter.ai/api/v1`. No automatic paid model selection exists. Read [OpenRouter streaming documentation](https://openrouter.ai/docs/api-reference/streaming).

AI SDK APIs were checked against installed package documentation. The implementation streams text deltas, caps output at 1,200 tokens, uses a 45-second timeout and request abort signal, and sets SDK retries to zero. A recoverable failure (408/429/selected 5xx/network timeout) can use at most one configured free fallback **before any text is sent**. No fallback after partial output, on authentication errors or cancellation. Provider errors are normalized, never returned with secret-bearing request objects. Successful token usage and terminal errors are recorded in `provider_usage`.

Atomic daily requests and conservative token reservations apply across instances. Reservations use UTF-8 input bytes plus system/output headroom, multiplied by possible attempts. Reservations are intentionally not refunded, including cancellations, to prevent concurrent overspend. Actual token totals are recorded separately. Limits reset at UTC day boundaries. Provider reasoning overhead is capped by `maxOutputTokens`; verify current provider accounting and maintain account-side limits too.

## UFCalendar

Reference: [REST docs](https://api.ufcalendar.com/docs), [OpenAPI spec](https://api.ufcalendar.com/openapi.json). A retrieved copy is in `docs/ufcalendar.openapi.json`. Authentication is `Authorization: Bearer ...`. The adapter uses only documented events, fighter, career history, fight stats, official UFC rankings and usage paths. Schemas validate the fields consumed by the application; unconsumed provider fields are stripped rather than guessed.

Configure up to three `UFCALENDAR_API_KEY_1/2/3` values. Keys must represent the same authorized allocation. Do not configure multiple accounts to extend a free tier. Set `UFCALENDAR_ACTIVE_KEY=1`, `2`, or `3` to manually choose the preferred key. Selection otherwise falls back deterministically to a configured healthy key on connection/5xx or invalid-credential errors. Every credential status uses a slot identifier, not any portion of its secret.

```sh
npm run credentials:test
npm run credentials:test -- --slot=2
```

These local operator-only commands call the documented `/usage` endpoint. They can consume quota. A protected POST `/api/internal/credentials` also accepts `{ "slot": 2 }` with `Authorization: Bearer <INTERNAL_API_TOKEN>`. Never place the token in a URL. Connectivity tests update in-process health and return masked statuses; active selection persists through environment configuration, not an exposed admin UI. Health is not shared between independent serverless instances.

429/quota exhaustion stops all identity failover. Ingestion stores a persistent quota block through the next UTC month boundary and serves existing cached data in the public application. This is conservative even for a shorter rate limit. Operators may remove the block only after independently verifying quota renewal; never use another account. Per-run and persistent monthly local caps count **each actual attempted request**, including recoverable failover. Do not change `UFCALENDAR_ACCOUNT_ID` to bypass counters.

Live Groq and OpenRouter completion requests and independent `/usage` calls for all three UFCalendar credentials passed on 19 November 2026. The application also streamed a real Groq answer using imported UFC records. Six targeted mocked credential-manager tests verified active-slot selection, recoverable failover and no quota-exhaustion rotation without deliberately causing real account failures. No paid models were selected. Connectivity does not establish comprehensive coverage or redistribution rights.
