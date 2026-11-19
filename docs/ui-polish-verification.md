# Homepage and chat polish

Local branch: `feat/home-chat-polish`. No Git push, merge, deployment or production configuration change was performed.

## Implemented

- Compact red three-dot typing indicator, with “Working on your answer...” and a polite status announcement. It uses the existing `busy` state, remains visible during streamed partial text, and disappears on completion, error or cancellation. The answer subtree alone is marked busy so the status can be announced immediately.
- “A good answer has a corner.” now has equal desktop columns, exactly 32px above the content/poster area, stacked content-first mobile ordering, and polished cards that reveal from the left.
- Existing Motion infrastructure handles the reveal; CSS and Motion both honor reduced-motion preferences. The dots use lightweight CSS animation.
- The visual stage preserves all original content in a four-card arrangement. The UFC logo is centered in an independent glass card, with a six-pixel vertical float over five seconds. There is no UFC logo in the hero text or navbar.
- Below 1024px the stage becomes a static vertical stack: Preview, UFC fan card, Source-linked/English, Know What You Know. Existing “Beyond the record” content remains in the source/details card. Decorative orbits are hidden on these screens.
- Existing font configuration, scrollbars, chat API/streaming protocol, responsive shell and Admin authentication are preserved. New visible copy is English.

## Supplied assets integrated

The supplied `public/images/logo.webp` and `public/images/poster.webp` are integrated directly. Both source files remain unchanged. The logo retains its square aspect ratio and embedded checkerboard background. The poster is served without additional compression to preserve its quality.

The poster appears only in “A good answer has a corner.” The section has equal desktop columns and content-first mobile stacking, with exactly 32px above the content/poster area. The poster uses `object-fit: contain` and `max-height: 70vh`.

## Files

- `src/app/page.tsx`: section layout, cards, badge placement.
- `src/app/globals.css`: section, poster sizing, badges, typing animation and mobile/reduced-motion rules.
- `src/components/chat.tsx`: pending status and accessible busy handling.
- `src/components/motion.tsx`: optional reveal direction.
- `src/components/typing-indicator.tsx`: reusable chat status. The earlier draft badge component was removed because the logo now lives only in the visual stage.
- `public/images/logo.webp`, `public/images/poster.webp`, `public/images/README.md`: user-supplied assets and usage notes.
- `tests/chat.test.tsx`, `tests/e2e/site.spec.ts`: streaming lifecycle, error/cancel, layout, status, reduced-motion and screenshot checks.

## Verification

- Full Vitest suite: **93 passed** across 13 files. The four chat tests were rerun successfully after the accessibility adjustment.
- ESLint, TypeScript and production build: passed.
- Playwright: **18 passed** at desktop, mobile and 320px. Checks cover navigation, Admin sign-in visibility, controlled API failure, equal columns, 32px spacing, poster loading/contain/70vh sizing, stage card order/non-overlap, logo loading/placement, three dots, streamed partial content, completion and disabled animation with reduced motion. Stage sizing was also checked at 1920×1080, 1440×900, 1366×768 and 820×1180. Requests in the loading tests use controlled browser streams and do not consume real provider quota.
- Inspected local desktop, tablet and mobile screenshots, including the actual poster and the smallest requested desktop stage. Screenshots remain in ignored `test-results` outputs.
- The provided logo contains an embedded checkerboard; this remains visible by design because the supplied asset is preserved.
