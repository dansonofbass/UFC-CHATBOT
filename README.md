# OCTAGON AI

Independent UFC research assistant built in the existing [UFC-CHATBOT repository](https://github.com/dansonofbass/UFC-CHATBOT). Next.js App Router, strict TypeScript, React, Tailwind, a shadcn-style Radix button, Lucide and Motion. All real-world data starts empty: there are no invented fighters, scores, news items or production chatbot replies.

## Run locally

Node.js 24 and npm are supported. On Windows with PowerShell script restrictions use `npm.cmd` instead of `npm`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The UI works without credentials and explains unavailable data. Real chat requests fail closed until database usage controls are available. Configure secrets directly in `.env.local` or the host's secret settings; never paste them into chat, source files or command arguments.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm start
npm run test:e2e
```

Playwright uses Chromium. Install with `npx playwright install chromium`. To use an existing local installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable path. The browser tests use a production build and assume no API credentials. `npm run test` uses synthetic fixtures and mocked networks, not live provider accounts.

## Setup and operations

- [Database, RLS and migrations](docs/supabase.md)
- [Providers, credentials and quota policy](docs/providers.md)
- [Imports, news rights, retrieval and embeddings](docs/data-and-rag.md)
- [GitHub Actions and Vercel deployment checklist](docs/deployment.md)
- [Security and troubleshooting](docs/security.md)
- [Verification and remaining work](docs/verification.md)
- [Intelligent chat refactor review and feature flags](docs/chat-architecture-refactor.md)

Routes: `/`, `/chat`, `/fighters`, `/fighters/[slug]`, `/events`, `/events/[slug]`, `/compare`, `/rankings`, `/news`, `/about`, `/status`, `/privacy`, `/terms`.

The homepage's floating cards are conceptual interface illustrations, labelled as a preview. They contain no claimed athlete statistics. Actual directories display only imported source records. No reference screenshots were present in the supplied attachment folder; the written dark/red design brief was used.

## External setup still required

Local credentials are configured in ignored `.env.local`; no secret values belong in this repository. Supabase migrations, live RLS checks, bounded fighter/event imports, Groq, OpenRouter and all three UFCalendar credential checks succeeded on 19 November 2026. A secure local diagnostic token was generated. See the verification record for evidence and remaining limitations.

Configure permitted news sources and deployment-specific secrets/rights before public deployment. Provider subscription coverage may not include all historical detail or statistics. A production deployment has **not** been performed. Local credentials are never automatically copied to GitHub Actions or Vercel.
