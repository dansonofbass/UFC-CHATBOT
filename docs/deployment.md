# GitHub Actions and Vercel

## GitHub

Use only `dansonofbass/UFC-CHATBOT`. Local development is on `feat/octagon-intelligence`. No new repository is needed.

The quality workflow installs the lockfile and runs lint, strict types, Vitest, production build and Playwright Chromium tests. It has read-only repository permissions and receives no application secrets. The ingestion workflow runs twice weekly and can be dispatched manually; its concurrency group prevents overlapping sync jobs. It preserves resume state using Actions cache. Idempotent upserts make a lost checkpoint safe to repeat. A global database budget still caps actual provider attempts across runners.

Before enabling scheduled ingestion on the default branch, configure these GitHub Actions Secrets directly in GitHub:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `UFCALENDAR_API_KEY_1` (and optionally `_2`, `_3` for the same authorized account)
- `NEWS_FEEDS` (only permitted, verified feed URLs with permission descriptions)

Optional repository variable: `ENABLE_EMBEDDINGS=true` after testing the model download/runtime. The scheduler imports upcoming events, weekly fighter details/ranking snapshots/completed events, permitted news, and incremental vector indexing. Default caps are two attempts per invocation and 60 monthly attempts across all jobs. It does not spend Groq/OpenRouter tokens. Run history and sanitized failure codes are stored in Supabase. GitHub reports failed jobs; no messages are sent to external people.

Only enable secret-bearing workflows for reviewed code on a protected default branch. Manual inputs are passed through environment variables and bounded by Zod, never interpolated as shell commands. Production workflow environments should restrict branches and reviewers. Action versions should be pinned to reviewed commit SHAs before enabling sensitive jobs. Local checks do not establish that the hosted workflow has run.

## Vercel checklist

The requested architecture is standard Next.js Node.js functions, with `maxDuration=60` for chat. No Redis, paid embedding service or separate Python backend is needed. Vercel's [Hobby plan documentation](https://vercel.com/docs/plans/hobby) and current [fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines) govern allowed usage; do not assume Hobby permits commercial deployment. No plan upgrade or credit purchase is authorized here.

1. Review the changes, run all checks and merge/push the existing repository when authorized. Confirm the intended commit and branch before release.
2. Apply all three Supabase migrations to the existing project. Run `npm run db:check` and inspect RLS.
3. Configure credentials privately in `.env.local`; run a one-record data import and inspect original source fields, timestamps and rights. Run credential tests with care for quota.
4. Connect the existing GitHub repository to the intended Vercel account/project; framework preset Next.js, Node 24, build `npm run build`, install `npm ci`, root repository root. Do not enable optional vector inference until its cold-start and bundle cost are measured.
5. Add the `.env.example` variable names to Vercel Preview and Production environments using its dashboard. Only URL and publishable key use `NEXT_PUBLIC_`. Groq, OpenRouter, Supabase secret, UFCalendar keys and internal diagnostic token must remain server-only. Do not place secrets in `vercel.json` or build command arguments.
6. Keep OpenRouter disabled unless explicitly desired; its model must remain `openrouter/free` or an allowed `:free` ID. Set conservative daily requests/tokens and account-side provider limits.
7. Build a Preview. Confirm Vercel build readiness, not merely deployment creation. Test a real grounded question, streaming/cancellation, Persian followup, comparison and citations. Inspect `/status` and sanitized usage rows.
8. Test 320px/mobile/desktop, keyboard focus, reduced motion and every route. Verify invalid details give 404, diagnostics return 401, and unavailable providers do not invent answers.
9. Configure operator contact and retention policy, obtain news rights, and review trademark attribution. Enable reviewed scheduled imports on the default branch.
10. Promote only a validated deployment and record its URL/commit. Check production logs and data freshness. Retain rollback information.

The existing Supabase schema and local credentials are configured and live-tested. No Vercel project, paid service, or production deployment was created. Deployment-specific secrets remain an operator setup step; `.env.local` is never pushed. The feature branch is the GitHub publication target requested by the user.
