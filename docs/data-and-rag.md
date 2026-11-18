# Data ingestion and retrieval

All import commands load `.env.local` using Next's environment loader. They are local privileged processes; there is no public ingestion endpoint.

```sh
npm run ingest -- --kind=events --limit=3 --dry-run
npm run ingest -- --kind=events --limit=3
npm run ingest -- --kind=events --limit=3 --resume
npm run ingest -- --kind=events --status=completed --limit=1
npm run ingest -- --kind=fighters --limit=1
npm run ingest -- --kind=rankings
npm run ingest -- --kind=fighter-history --fighter=IMPORTED-SLUG
npm run ingest -- --kind=fight-stats --fight=IMPORTED-FIGHT-ID
npm run ingest -- --kind=news --limit=5
npm run ingest -- --kind=index --limit=5
```

Dry-run performs no provider or database calls and consumes no quota. A live run logs a `sync_runs` entry, progress and terminal status. Run caps default to three actual attempts; `limit` bounds rows requested, not the number of permitted API calls. One list request is followed by individual detail requests while budget remains. Pending detail slugs and pagination cursors are checkpointed to ignored `.sync-state.json`. `--resume` finishes pending details before continuing to the next page. The state is per kind; use separate checkouts/state files for distinct historical filters. Re-importing a page is safe because identities are upserted. The monthly local limit defaults to 80 and can be tightened. These limits do not discover calls made by other clients; the provider's real quota remains authoritative.

The free API tier may not cover every detail field or historical dataset. Empty fields remain unavailable; MMA totals and UFC-only records are kept separate. Event timestamps retain UTC instants and venue IANA zones. Cancelled fights stay labelled on cards and never become completed results. No odds or predictions are requested or exposed.

## News rights

No feed is enabled by default because a publisher license or feed permission was not supplied. RSS existence is not a license. Configure `NEWS_FEEDS` as a JSON array of `{ "url": "https://publisher.example/permitted-feed", "license": "Description of your permission" }` only after verifying the actual URL, published terms and your permission. The example hostname is illustrative and is not a real configured feed. This remains an external setup blocker.

Ingestion fetches HTTPS XML with a timeout, rejects redirects and oversized feeds, filters UFC entries, strips markup and keeps at most 240 characters of permitted excerpt plus headline, URL and publication date. Canonical URL hashes deduplicate entries; tracking parameters are removed. Fighter/event links are matched to imported names. All incoming items are labelled `report`, never automatically confirmed. An authorized operator can label confirmed announcements only after verifying an official source. No full-article scraping is implemented.

## Licensed knowledge

```sh
npm run ingest -- --kind=licensed --file=YOUR-LOCAL-DOCUMENTS.json --license=YOUR-PERMISSION-REFERENCE --limit=5
```

Input is an array of `{title, body, source_url}`. Only import material you have permission to store. Source URL identity, deterministic chunk IDs and content comparisons avoid redundant indexing. Numeric fighter records are kept structured and never embedded wholesale.

## RAG

Routing identifies UFC intents in English/Persian and contextual followups, rejects obvious unrelated requests and instruction-extraction attempts, and resolves fighter names/nicknames from imported records. Structured retrieval reads typed tables and parameterized filters, capped fight history/statistics, event cards, news, or official ranking snapshots. PostgreSQL full-text retrieval adds at most six knowledge chunks, retaining document source URL and timestamp. Context is bounded to 18,000 characters; the request accepts at most 16 messages of 2,500 characters. Evidence is cached privately for one minute. No generated SQL or commands are used.

Optional `ENABLE_EMBEDDINGS=true` enables the local free `Xenova/paraphrase-multilingual-MiniLM-L12-v2` model. Index jobs store 384-dimensional normalized vectors, model ID and dimensions. Only unindexed chunks are processed. Hybrid search combines lexical rank with cosine similarity; query embeddings are generated only when vector search is enabled, and lexical search remains available if model loading fails. The model must be downloadable and its model-card license reviewed. CPU model inference/download size and cold starts are not verified on Vercel; leave it disabled for the initial free-tier deployment. PostgreSQL full-text retrieval requires no model download.

Simple English upcoming-event requests use deterministic source data without LLM spending. Other answers use only the bounded retrieved evidence and cite provided URLs. Unsupported questions receive an explicit unavailable reply. Citation links are HTTPS-only; HTML and images in generated Markdown are not rendered. Retrieved text is always untrusted evidence, never system instructions. No system can guarantee perfect topic classification or AI faithfulness; check original sources.
