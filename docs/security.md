# Security and troubleshooting

## Implemented controls

- Environment validation; no embedded provider keys; ignored `.env.local`, caches, traces and build outputs.
- Server-side provider calls and privileged Supabase access; public read-only RLS and service-only usage RPC.
- Input/body/message/context/output caps, Zod response validation and fixed provider endpoints.
- Shared database per-client hourly limits and atomic daily request/token reservations. Missing controls stop chat before inference. Vercel supplies the trusted forwarding header; non-Vercel requests share a conservative local bucket. Configure a trusted-proxy adapter before using another host; do not trust arbitrary client forwarding headers.
- One recoverable free AI fallback before output; no SDK retries; timeouts and cancellation; no quota-identity switching.
- HTTPS-only source links, no raw HTML or generated images, React escaping, bounded Markdown rendering. Security headers forbid framing, object embedding via default policy and external script/connect sources.
- Diagnostics require constant-time bearer verification of a >=32-character configured token. CLI ingestion requires local operator access.
- Retrieved content remains untrusted evidence. Prompt-injection patterns are rejected, no arbitrary tools or SQL are exposed, and every synthesis prompt restricts answers to supplied facts. The router is heuristic; prompt injection and topic precision cannot be guaranteed solely by regex/system instructions.

## Before public launch

Run a live RLS probe and provider tests; configure HTTPS and account-side spend controls. Check `.gitignore`, stage only intended source, and run `npm run secrets:scan` before any commit. Review dependency advisories (`npm audit`) and lockfile changes. Keep schema and application source under protected review. Restrict secret-bearing Actions to reviewed branches. Prune expired operational rows according to a documented retention policy. Publish operator contact details in the privacy policy. Do not publish Playwright traces from real credential-bearing sessions.

The CSP permits inline scripts/styles for Next's rendered output and no arbitrary external scripts. A stricter nonce policy is a future hardening improvement; the site does not load third-party analytics. News URLs are operator configuration, never public request input. Configure only trusted public HTTPS feeds; redirects are rejected. This is not a general-purpose URL fetch service.

## Troubleshooting

| Symptom                    | Check                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows blocks `npm.ps1`   | Use `npm.cmd`; no system execution-policy change needed.                                                                                       |
| npm cache access denied    | `npm.cmd ci --cache .npm-cache` inside the workspace.                                                                                          |
| Directories empty          | `/status`, Supabase public key/URL, migrations and first bounded import. No fabricated demo dataset is seeded.                                 |
| Chat 503 before streaming  | Server secret, database connectivity and `consume_budget` migration/RPC privileges. Limits fail closed.                                        |
| AI synthesis unavailable   | Groq key/model availability, daily reservations, provider status; enable only authorized free fallback.                                        |
| 429 from UFC data          | Stop provider calls, retain cache; verify real allocation renewal. Never add a different account. A quota block persists until next UTC month. |
| History/statistics empty   | Import event detail/fighter detail first, then the documented history/stats command. Confirm provider plan coverage.                           |
| News empty                 | No permitted feed is configured by default; validate URL and licensing, then run `--kind=news`.                                                |
| Embeddings fail            | Keep disabled for lexical retrieval; check model download access, 384 dimensions, local CPU/ONNX compatibility and cache permissions.          |
| Playwright CDN unavailable | Use an installed Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; otherwise CI installs supported Chromium.                                      |
| Schedule not running       | Workflow must reach the default branch; check Actions enablement, secrets, quota and concurrency.                                              |
| Missing provider key       | Configure the exact variable name from `.env.example` privately; never put values in an issue or chat.                                         |

Live provider failures are deliberately sanitized. Use provider dashboards and recorded status/error codes rather than logging full SDK exception objects, headers or request bodies.
