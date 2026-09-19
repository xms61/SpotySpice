# Changelog

All notable changes to the **SpotySpice** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.12.3] - 2026-09-19

### Added
- **Three-Way Entity Variation for Anime Crosswords (`shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Added support for extracting **Anime Series Titles** (`clueType: 'Anime title'`) as crossword answers alongside **Song Titles** and **Artist Names** (e.g. solving `SOLA`, `COWBOYBEBOP`, `EVANGELION`, `GUNDAM`).
  - Implemented 4-way balanced rotation across `['anime', 'title', 'artist', 'keyword']` for anime puzzles.
- **Strict Entity Isolation & Zero-Spoiler Clue Discipline (`shared/clueGenerator.js`)**:
  - **Anime Title Clues**: Whichever anime franchise is the solution is strictly excluded from clue text (e.g. `Anime featuring the OP2 theme (2007)` or `Anime featuring the OP2 theme by Aira Yuuki (2007)`).
  - **Artist Clues**: The performer name is strictly excluded from clue text, while providing series and theme context (e.g. `Performer behind the OP2 of "Sola" (2007)`).
  - **Song Title & Keyword Clues**: Song titles and keywords are strictly excluded, and gratuitous artist mentions (`by <Artist>`) have been eliminated from title/keyword clues to prevent confusion and leaks (e.g. `Key word in the OP2 of "Sola"` instead of `... by Aira Yuuki`).

### Changed
- **Suite 11 & Suite 12 Test Expansion (`scripts/run_tests.js`)**:
  - Updated Suite 11 and Suite 12 with tests asserting candidate extraction for anime titles, 3-way rotation, zero leakage across all entities, and strict absence of artist mentions in song title clues.

---

## [1.12.2] - 2026-09-19

### Added
- **AniList GraphQL Artwork Pipeline (`server/services/animeImageService.js`, `scripts/backfill_anime_images.js`)**:
  - Automated AniList GraphQL batch resolver (`Media(id: ..., type: ANIME)`) fetching high-res cover images (`coverImage.large`) for anime series.
  - SQLite migration: Added `image_url TEXT` column to `anime_tracks` with indexed lookups.
  - Just-In-Time (JIT) cover art hydration in `server/services/musicService.js` before returning anime puzzle song pools.
  - Added `npm run anime:images` backfill script for offline catalog artwork synchronization.
- **Anime Victory Screen Presentation & Visual Fallbacks (`src/components/EndScreenModal.tsx`)**:
  - Passed `animeTitle`, `themeSlug`, `themeType`, `imageUrl`, and `isAnimeOped` to client song list.
  - Added graceful `onError` fallback cards featuring stylized gradient backgrounds, vinyl icons, and `OP1`/`ED1` theme badges when images are loading or unavailable.
- **Targeted Keyphrase Deduplication & Solution Blacklisting (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Implemented `extractAnimeKeyphrase` extracting specific target phrases (e.g., `gundam` from `anime gundam`, `naruto` from `anime openings naruto`).
  - Relaxes artist/franchise deduplication for targeted keyphrases (allowing multiple Gundam tracks or multiple Dolly Parton tracks on dedicated prompts).
  - Blacklists target keyphrase tokens ($\ge 3$ characters) from `seenAnswers` so players are never asked to solve the prompt itself as a grid word.

### Changed
- **Strict 0% Artist Clues for Anime Tracks (`server/services/musicService.js`)**:
  - Anime tracks strictly alternate between `Song title` and `Song title keyword` clues (`allowArtist: false`), eliminating unengaging seiyuu name guesses and spoilers while retaining clean context formatting (e.g. `ED1 of "Jigoku Shoujo Futakomori" by Mamiko Noto (2006)`).
- **Comprehensive Test Suite 12 (`scripts/run_tests.js`)**:
  - Added Suite 12 verifying keyphrase extraction, target deduplication rules, prompt solution blacklisting, 0% artist clue distribution, and anime cover artwork SQLite persistence (expanding test suite to **486 passing tests**).

---

## [1.12.1] - 2026-09-19

### Fixed
- **Anime Audio Preview in Dev Mode (`vite.config.ts`)**:
  - Added `/audio` route proxying in Vite development configuration, forwarding local anime audio preview requests (`/audio/anime/...`) from port `3010` to the Express backend (`3011`). Resolves the `⚠️ Preview unavailable` badge during `npm run dev`.
- **Zero-Spoiler Clue System Overhaul (`shared/clueGenerator.js`, `server/services/musicService.js`)**:
  - Eliminated answer leakage where anime artist clues previously output `by ${track.artist}` (e.g., displaying the solution when asking for "Artist name").
  - Context-aware clue templates for Anime OP/ED:
    - Artist clues: `Vocalist / musical act behind the {themeSlug} of "{animeTitle}" ({year})` (never discloses artist name).
    - Song title clues: `{themeSlug} of "{animeTitle}" by {artist} ({year})` (never discloses song title).
    - Keyword clues: `Key word in the {themeSlug} of "{animeTitle}"` (never discloses keyword).
  - Universal Zero-Leak Sanitizer (`containsAnswerLeak`, `sanitizeClue`): Validates every generated clue against normalized answer strings and component tokens ($\ge 3$ characters), automatically falling back to non-spoilered descriptive templates if any leak is detected.
  - Added Suite 11 to test suite (`scripts/run_tests.js`), verifying audio proxy rules, zero leakage across 500 randomized stress test generations, and expanding test suite to **423 passing tests**.

---

## [1.12.0] - 2026-09-19

### Added
- **Dedicated Anime OP/ED Sourcing & Catalog Engine (`server/db/animeCatalog.js`, `server/services/musicService.js`)**:
  - Independent SQLite schema (`anime_catalog.sqlite`) managing authentic anime openings (OP), endings (ED), and insert tracks.
  - Sourcing isolation: Dedicated routing via `isAnimeTarget()` and `getAnimeThemeType()` ensures anime puzzle requests bypass external general-music collisions.
  - Multi-sample variations: Supports multiple 20-second playback segments (e.g., 5s, 35s, 65s offsets) per track for dynamic playback variation.
  - Local preview delivery: Express static file route at `/audio/anime` for serving locally verified OP/ED preview clips.
- **FFmpeg Preview Pipeline & Batch Generator (`server/services/ffmpegHelper.js`, `scripts/generate_anime_samples.js`)**:
  - Robust FFmpeg utility extracting precise 20-second audio clips at key chorus/hook timestamps without external API dependencies.
  - `npm run anime:samples`: Configurable batch generator with concurrent workers and duration validation.
- **Anime Catalog Sync & Ingest Scripts (`scripts/sync_anime_metadata.js`, `scripts/ingest_anime_catalog.js`)**:
  - `npm run anime:sync`: Synchronizes anime theme metadata including series titles, season years, artists, and media sources.
  - `npm run anime:ingest`: Ingests mapped themes and audio variations into the SQLite anime catalog.
- **Database Validation, Deduplication & Sanitization Engine (`server/db/catalogValidator.js`, `scripts/validate_and_sanitize_db.js`)**:
  - Structural and relational integrity audits via `PRAGMA integrity_check` and foreign key constraint validation.
  - Semantic duplicate clustering detecting identical tracks across normalized tokens and +/- 3-second duration variance.
  - Contamination detection purging corrupt audio entries, tracks < 15 seconds, and audiobook contaminations.
  - Added `npm run db:validate` and `npm run db:sanitize` CLI workflows with automated Markdown reporting (`reports/database_validation_report.md`).
- **Automated Test Expansion (`scripts/run_tests.js`)**:
  - Added Suites 9 and 10 testing catalog validation, duplicate deduplication, contamination purging, and isolated anime OP/ED routing, expanding automated coverage to **396 passing tests**.

### Changed
- **Git Hygiene & Media Safeguards (`.gitignore`)**:
  - Comprehensive blanket exclusions for raw audio media (`*.mp3`, `*.aac`, `*.m4a`, `*.wav`, `*.flac`, `*.ogg`, `*.opus`, `*.webm`), local sample folders (`data/anime_samples/`, `**/samples/`), and SQLite binaries (`*.sqlite*`, `*.db*`).

---

## [1.11.0] - 2026-09-19

### Added
- **Automated Crossword Judgment Suite (`server/services/crosswordJudge.js`)**:
  - `judgePuzzle(puzzle, context)`: Evaluates grid integrity, language compliance (with culturally bounded exemptions for K-Pop, Anime, Japanese, Latin, and Bossa Nova), single-artist thematic fidelity (0 leaked artist-name clues), and authenticity (rejection of covers, instrumentals, karaoke, and audio utilities).
  - `judgeMultiGenerationSuite(prompt, puzzles, context)`: Aggregates N generations per prompt to measure Jaccard similarity overlap, unique track ratios, popularity distribution (High, Mid, Catalog tiers), and length variety shares.
- **Cultural and Linguistic Guardrails (`server/services/musicService.js`)**:
  - `isAnimeTrack(track)`: Strictly validates authentic anime opening, ending, and soundtrack themes, guarding against Western collisions (e.g. DJ AniMe, Ben Mazué, French/Latin homonyms).
  - `isJapaneseTrack(track)`: Authenticates verified Japanese artists and City Pop icons while rejecting Western homonyms (e.g. The Japanese House, Aneka).
  - Expanded cover and audio modification rejection filters: filters out YouTube guitar/piano/harp covers (e.g. Fonzi M), backing tracks, and workout mixes.
- **Answer Word Length Variance & Stratified Querying (`server/services/queryFactory.js`, `server/db/sqliteCatalog.js`)**:
  - `LENGTH_ROTATION` ensures high-frequency injection of short (3-5 letter) words across all archetypes, achieving 48% to 94% short word representation across crosswords.
  - Stratified 10-tier popularity retrieval with random sampling (`CAST(t.popularity / 100000 AS INT) DESC, RANDOM()`) maximizes track diversity across queries.
- **Large-Scale Evaluation Suite (`scripts/eval_crossword_factory.js`, `npm run eval:crosswords`)**:
  - Scales generation trials to 150-300 per puzzle and runs 138 crossword executions (46 prompts x 3 generations) across Dense, Small, Themed, Custom, and Edge-Case suites.
  - Automatically produces detailed markdown evaluation report at `reports/crossword_evaluation_report.md`.
- **Comprehensive Unit Tests (`scripts/run_tests.js`)**:
  - Added 25 unit and integration tests for anime/Japanese separation, authenticity filtering, judge metrics, and multi-generation aggregation, expanding the automated suite to 350 passing tests.

### Changed
- **Placement Engine Trials Default (`shared/liveCrossword.js`)**:
  - Increased placement attempts from 50/80 to 150/300 trials with typed `options.trials` support.

---

## [1.10.2] - 2026-09-19

### Added
- **Dataset Preparation & Download Utility (`scripts/fetch_datasets.js`, `npm run fetch:datasets`)**:
  - Automatically fetches Anna's Archive Spotify Top 10k table into local `data/spotify_top10k.html`.
  - Scans and validates local `data/base_tables/` and `data/changes/` directories.
  - Comprehensive CLI guide and download links for MusicMoveArr datasets and incremental MEGA diffs.
- **Local File Fast-Path in Anna's Ingestor (`scripts/ingest_annas_spotify.js`)**:
  - Added support for `--file=...` and automatic fallback to `data/spotify_top10k.html`, enabling instant offline re-ingestion in under 2 seconds.

### Changed
- **Git Hygiene**:
  - Updated `.gitignore` to strictly exclude dataset dumps (`*.csv`, `*.tsv`, `*.sql`, `*.sql.gz`, `*.html`, `*.gz`, `*.tar*`, `data/downloads/`) while preserving tracked pools and directory structure (`.gitkeep`).

---

## [1.10.1] - 2026-09-19

### Fixed
- **MusicMoveArr Ingestor Initial DB Stats Logging (`scripts/ingest_musicmovearr.js`)**:
  - Resolved `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` by aligning stats property access with `audioSamples` and `crossReferencedTracks`.
  - Added backward-compatible alias properties (`samples`, `crossReferenced`) to `sqliteCatalog.getStats()` to ensure resilience across CLI commands and logging utilities.

---

## [1.10.0] - 2026-09-19

### Added
- **MusicMoveArr Dataset Streaming Ingestor (`scripts/ingest_musicmovearr.js`, `npm run ingest:dataset`)**:
  - Implemented streaming ingestion engine for the [MusicMoveArr Datasets](https://github.com/MusicMoveArr/Datasets) (Deezer, Spotify, Tidal, MusicBrainz base dumps and compressed incremental `.sql.gz` diffs from MEGA).
  - Enforces Scenario C filtering: strict `popularity > 30` (default `--min-popularity=31`) and `isAuthenticCandidate({ requireSample: false })`, pruning noise, amateur covers, and karaoke.
  - Memory-safe stream processing using Node.js `readline` and `zlib.createGunzip()`, batching 2,000 tracks per SQLite transaction via `sqliteCatalog.upsertBatch()`.
  - Automatic WAL journal compaction (`PRAGMA wal_checkpoint(TRUNCATE)`) every 100,000 tracks to keep disk footprint strictly controlled.
- **On-the-Fly Lazy JIT Preview Hydration Engine (`server/services/previewResolver.js`)**:
  - Implemented on-demand audio preview resolution: tracks ingested from MusicMoveArr start with instant metadata (`sample_url = NULL`) and are resolved JIT when selected for live gameplay.
  - Multi-tiered resolution pipeline:
    1. Instant existing URL hit (`sample_url` or `audioUrl`).
    2. Fast-path Deezer Track API lookup via stored `deezer_id` (sub-150ms).
    3. Fallback Deezer artist + title search.
    4. Fallback iTunes Search API lookup (by ISRC or artist + title).
  - Parallel batch resolution via `batchResolvePreviews(tracks)` using `Promise.allSettled`.
  - Asynchronously persists verified audio previews into SQLite `track_samples` table (`sqliteCatalog.insertSample`), turning first-time resolutions into zero-latency future cache hits.
  - Bounded in-memory preview cache (`inMemoryPreviewCache`) to eliminate redundant external API requests during active gameplay sessions.
- **High-Performance SQLite Engine (`server/db/sqliteCatalog.js`)**:
  - Configured `PRAGMA mmap_size = 2147483648;` (2GB memory-mapped I/O) and `PRAGMA cache_size = -64000;` (64MB page cache) enabling sub-10ms queries across millions of tracks.
  - Added covering indexes: `idx_tracks_pop_year`, `idx_tracks_lang_country`, `idx_providers_lookup`, `idx_providers_provider_id`.
  - Added `sqliteCatalog.insertSample(trackId, sampleData)` for runtime sample persistence.
  - Extended `sqliteCatalog.getRandomPlayableTracks({ allowSampleless: true })` to harvest sampleless candidate tracks and attach provider IDs (`deezer_id`, `spotify_id`, `itunes_id`).
- **Music Service Candidate Harvesting & JIT Hydration (`server/services/musicService.js`)**:
  - Integrated local SQLite candidate harvesting directly into candidate tasks when generating puzzles.
  - Embedded JIT Lazy Preview Hydration before crossword layout generation, filtering for 100% playable tracks with verified audio previews.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 30 new tests covering CSV/TSV parsing, SQL tuple parsing, candidate mapping, numeric track ID extraction, preview resolution, batch resolution, and SQLite sampleless/lazy hydration workflows (total: 321 passing tests).

---

## [1.9.7] - 2026-09-19

### Added
- **Agent Guidelines & Repository Manual (`agents.md`)**:
  - Created comprehensive agent operations manual detailing branching/PR discipline, version synchronization rules, secrets security, and SQLite concurrency/WAL invariants.
  - Documented crawler discovery vectors, two-tier deduplication, authenticity filtering, and live multiplayer WebSocket protocols.
  - Included a structured pre-commit checklist for automated AI agent sessions.
- **Agent Skills (`.agents/skills/`)**:
  - Added `catalog-crawler` skill (`.agents/skills/catalog-crawler/SKILL.md`) for crawler management, status inspection, and WAL compaction.
  - Added `crossword-engine` skill (`.agents/skills/crossword-engine/SKILL.md`) for crossword layout placement, answer extraction, and homonym protection.
  - Added `release-discipline` skill (`.agents/skills/release-discipline/SKILL.md`) for enforcing git hygiene, version bumps, test verification, and PR creation.
- **Git Hygiene (`.gitignore`)**:
  - Added `.gemini/` to `.gitignore` to prevent local AI runtime state from leaking into version control.

---

## [1.9.6] - 2026-09-19

### Added
- **Anna's Archive Spotify Top 10k Ingestor (`scripts/ingest_annas_spotify.js`)**:
  - Implemented streaming HTML table parser that downloads and ingests the top 10,000 songs by popularity from Anna's Archive (`https://annas-archive.gl/blog/spotify/spotify-top-10k-songs-table.html`).
  - Added strict `popularity > 30` filtering and multi-artist, ISRC, and explicit flag parsing.
  - Added `npm run crawl:top10k` script for one-command execution.
- **Dedicated Playlist Crawling Script (`npm run crawl:playlists` / `--playlists-only`)**:
  - Added `--playlists-only` CLI flag to `scripts/crawl_catalog.js` allowing dedicated playlist harvesting without running decades, artists, or lexicon vectors.
  - Added `npm run crawl:playlists` script to `package.json`.

### Improved
- **Authenticity Candidate Filter (`server/crawler/authenticityFilter.js`)**:
  - Added configurable `{ requireSample = true }` option to `isAuthenticCandidate` to allow ingesting high-reputation metadata records (e.g., Spotify top tracks) for subsequent iTunes/cross-provider preview backfills while filtering noise and tributes.
- **Crawler Batch Summary (`scripts/crawl_catalog.js`)**:
  - Extended crawl completion summary to report `yearGenreQueriesCrawled` and `bigramsCrawled`.

---

## [1.9.5] - 2026-09-19

### Improved
- **SQLite Concurrency & Lock Resilience (`server/db/sqliteCatalog.js`)**:
  - Configured `PRAGMA busy_timeout = 10000;` on SQLite initialization.
  - Automatically handles concurrent transaction retries up to 10 seconds, eliminating `database is locked` exceptions under heavy asynchronous ingestion.

---

## [1.9.4] - 2026-09-19

### Added
- **Decade/Genre Crawler Control (`--decades=<n>`)**:
  - Added `decadesLimit` option to `musicHarvester.runFullHarvest` and `--decades=<n>` CLI argument in `scripts/crawl_catalog.js`.
  - Enables skipping or scoping Vector 2 (e.g. `--decades=0`) when running targeted high-speed crawler runs.
  - Documented `--decades=<n>` in the `README.md` flags table.

---

## [1.9.3] - 2026-09-19

### Added
- **Country Code & Language Tracking (`server/db/sqliteCatalog.js`)**:
  - Added `country_code TEXT` and `language TEXT` columns with dedicated B-tree indexes (`idx_tracks_country`, `idx_tracks_lang`) to the `tracks` schema.
  - Implemented `extractIsrcCountryCode` to automatically extract the ISO 3166-1 2-letter country code from the standard 12-character ISRC registration prefix.
  - Implemented `detectTrackLanguage` to detect language tags (`en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `zh`, `ru`, `ar`) via Unicode script analysis and linguistic markers.
  - Added automated non-blocking migration and fast backfill across all existing catalog tracks.
- **500,000 Tracks Discovery Vectors (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Added **Vector 5: Fine-Grained Year (1960–2026) $\times$ Genre Matrix (`YEAR_GENRE_SEEDS`)** generating over 1,600 highly targeted historical and contemporary discography queries.
  - Added **Vector 6: High-Yield Bigram Sweeper (`BIGRAM_SEEDS`)** covering 60+ top musical n-grams.
  - Expanded `MUSIC_LEXICON_SEEDS` with 500+ rich musical, emotional, atmospheric, and multilingual vocabulary seeds.
  - Updated default `--target` to `500000` and added Country Code and Language counts to `crawl:status` output.

---

## [1.9.2] - 2026-09-18

### Changed
- **Gitignore Local SQLite Databases (`.gitignore`)**:
  - Added `*.sqlite` and `server/data/catalog.sqlite*` to `.gitignore` to keep the Git repository lightweight and free of binary database blobs.
  - Untracked `server/data/catalog.sqlite` from Git index while preserving local database files.
- **Documentation for SQLite Initialization & Population (`README.md`)**:
  - Documented automatic schema initialization via Node.js 24 native `node:sqlite` (`DatabaseSync`).
  - Added comprehensive step-by-step instructions and CLI options table for populating the database at various scales (quick seed, standard catalog, massive 100k catalog).

---

## [1.9.1] - 2026-09-18

### Changed
- **Music Catalog Milestone (100,033 Canonical Tracks)**:
  - Completed multi-vector lexicon harvest sweep, bringing the local SQLite music database (`server/data/catalog.sqlite`) to **100,033 canonical tracks**, **33,455 unique artists**, **100,036 verified audio samples**, and **6,590 cross-referenced tracks**.
  - Executed WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) consolidating all transaction journals directly into `catalog.sqlite` at an ultra-compact 88.0 MB file size.
  - Added unique constraint collision safeguards to `getOrCreateArtist` handling artist metadata updates.

---

## [1.9.0] - 2026-09-18

### Added
- **Massive 100,000+ Track Catalog Expansion (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Expanded the catalog crawler architecture with four high-yield discovery vectors targeting $\ge 100,000$ canonical songs:
    1. **Curated Playlist Vector (`harvestCuratedPlaylists`)**: Deep-spidering across 40+ genre and historical playlist searches (e.g. *Rock Classics*, *Billboard Hot 100*, *90s Alternative*, *Motown Essentials*, *Electronic Journey*, *City Pop Vibes*), ingesting entire curated tracklists.
    2. **Decade $\times$ Genre Matrix Sweeper (`DECADE_GENRE_SEEDS`)**: Cross-product matrix combining 7 eras (1960s to 2020s) across 15 musical genres (rock, pop, hip-hop, r&b, soul, jazz, electronic, indie, metal, latin, reggae, country, funk, punk, dance) with multi-offset pagination.
    3. **Foundation & Recursive Artist Graph Spider (`harvestArtistDiscography`)**: Expanded foundation artist roster to 200+ global musical icons across all genres and eras, spidering studio albums, top releases, and dynamically discovering authentic related artists with $\ge 100,000$ fans.
    4. **350+ Expanded Lexicon Vocabulary Sweep (`MUSIC_LEXICON_SEEDS`)**: Broadened high-frequency musical title vocabulary spanning English and international song titles across 3 paginated result windows per keyword.
  - Added CLI flag `--target=<number>` to `scripts/crawl_catalog.js` (defaulting to 100,000 tracks) with dynamic percentage completion tracking, live artist/track counters, and automatic graceful termination upon reaching the target goal.
- **Enhanced Authenticity & Deduplication at Scale**:
  - Upgraded normalization regexes to strip `(?:radio\s+)?edit` and multi-bracket qualifiers, ensuring radio edits seamlessly merge into their parent master recordings.
  - Verified cross-referencing with Apple Music / iTunes candidate mapping for acoustic duration delta $\le 3$s.

---

## [1.8.0] - 2026-09-18

### Added
- **Native SQLite Catalog & Storage Engine (`server/db/sqliteCatalog.js`)**:
  - Engineered a high-performance local SQLite database leveraging Node.js 24's native `node:sqlite` (`DatabaseSync`), requiring zero external native compilation or C++ dependencies.
  - Configured WAL mode (`PRAGMA journal_mode = WAL;`) and batched transaction commits (`upsertBatch`), supporting over 40,000 writes/sec and non-blocking reads.
  - Implemented FTS5 full-text indexing (`tracks_fts`) for sub-millisecond crossword clue lookups across titles, artists, and albums.
- **Autonomous Multi-Vector Catalog Crawler (`server/crawler/harvester.js`, `scripts/crawl_catalog.js`)**:
  - Multi-vector catalog crawler harvesting thousands of canonical songs beyond top charts:
    - **Artist Discography Spider**: Explores studio discographies and top releases for iconic artists across rock, pop, hip-hop, electronic, 80s/90s, jazz, K-Pop, anime, and Latin genres.
    - **Music Lexicon Vocabulary Sweeper**: Sweeps a dictionary of 100+ high-frequency musical title words across paginated search indices.
  - CLI management scripts (`npm run crawl`, `npm run crawl:status`) with live progress reporting, merge stats, and status summaries.
- **100% Deterministic Cross-Referencing & Deduplication Engine (`server/db/sqliteCatalog.js`)**:
  - **Tier 1 ISRC Matching**: Merges cross-platform master recordings deterministically via 12-character International Standard Recording Codes.
  - **Tier 2 Acoustic & Title Compound Keying**: Merges catalog entries across Deezer and Apple Music/iTunes using normalized artist canonical keys, noise-stripped core titles, and strict acoustic duration delta constraints ($\le 3$ seconds).
  - Unifies multi-provider audio samples (Deezer MP3 and iTunes AAC 30s clips) and external store links under single canonical track records.
- **Strict Multi-Layer Authenticity Filter (`server/crawler/authenticityFilter.js`)**:
  - Automatically screens out covers, tributes, karaoke, soundalikes, parody versions, lo-fi/phonk remixes, lullaby renditions, workout tracks, and non-official uploads.
  - Enforces mandatory playable 30s audio sample verification and legitimate musical duration bounds (45s to 20m).
- **Polite Token-Bucket Rate Limiting & Backoff (`server/crawler/rateLimiter.js`)**:
  - Enforces strict rate limits honoring provider constraints (Deezer at 5 req/s; iTunes at 15 req/min) with polite `User-Agent` identification and exponential backoff on HTTP 429/503.
- **Comprehensive SQLite & Crawler Automated Test Suite (`scripts/run_tests.js`)**:
  - Added 24 dedicated test cases covering in-memory SQLite schema initialization, multi-provider ISRC and compound deduplication, authenticity filtration, and token-bucket rate limiter refills (increasing test suite to 280 passing tests).

---

## [1.7.0] - 2026-09-18

### Removed
- **Gemini LLM Judge Layer (`server/services/geminiJudge.js`, `server/config.js`, `server/services/musicService.js`)**:
  - Completely removed the external LLM judge dependency, simplifying the backend pipeline, eliminating external network latency and 503 high-demand failures while relying on deterministic high-precision rule engines and verified catalog querying.

### Added
- **Word Field Audio Auto-Play on Click (`src/components/AudioPlayerBar.tsx`, `src/hooks/useCrosswordGame.ts`, `src/App.tsx`)**:
  - Selecting any clue or grid cell now instantly plays that track's audio preview. If audio was previously paused or finished, playback automatically rewinds to 0:00 and starts.
- **Dedicated Keyboard Shortcuts Cheat-Sheet (`src/components/HintModal.tsx`)**:
  - Separated `<kbd>` tags from action buttons into a dedicated, clean keyboard shortcuts card at the bottom of the hint modal (`Space` for letter, `Tab` for word, `Shift + Tab` for entire puzzle).
- **Persistent Input on "Next Puzzle" & Loading Indicator (`src/App.tsx`, `src/components/EndScreenModal.tsx`, `src/components/LiveGeneratorModal.tsx`)**:
  - Pressing "Next Puzzle" on the victory screen now faithfully regenerates another crossword using the exact active configuration (custom prompt, genre preset, popularity tier, target words), avoiding unwanted resets to generic random themes.
  - Added an interactive `Loader2` spinning indicator on the Next Puzzle button during generation.
- **Full Multi-Line Artist Typography on Victory Screen (`src/components/EndScreenModal.tsx`)**:
  - Replaced single-line clipping with flexible wrapping and `min-w-0` bounding, ensuring featuring artists, long band names, and multi-artist collaborations are fully legible.
- **Answer Length Variety Engine (`shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Introduced rotating answer length target buckets (`short`: 3–5, `medium`: 6–8, `long`: 9–14 characters) with graceful fallbacks, ensuring puzzles feature an engaging variety of short punchy words and sweeping title phrases.
- **Strict English Enforcement for Random Crosswords (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Directed random catalog queries to English billboard charts and expanded stopword detection against Spanish, French, German, Italian, Portuguese, and Dutch lyrics.
- **Strict Temporal Release Date Verification (`server/services/musicService.js`)**:
  - Fixed custom prompt temporal parsing (`yearRange`) to strictly verify actual track/album release years or vintage remaster stamps, rejecting out-of-range or unverified tracks.
- **Cross-Session Anti-Repetition Persistence (`src/services/dynamicMusicService.ts`, `server/services/musicService.js`)**:
  - Switched recent track history from `sessionStorage` to `localStorage` (storing up to 500 tracks and normalized artist keys across visits).
  - Deepened Deezer search offset steps (0–175) and added recent artist frequency penalties to ensure fresh catalog variety.

### Fixed
- **Selective Hint Validation (`src/hooks/useCrosswordGame.ts`)**:
  - Fixed a bug where applying a single letter or word hint invoked `validateGrid`, prematurely coloring untested letters on the board. Hints now validate only the revealed cells.

---

## [1.6.2] - 2026-09-18

### Added
- **Query Precision & Grounded Candidate Replenishment (`server/services/musicService.js`, `server/services/queryBuilder.js`, `server/services/deezerMusicProvider.js`, `server/services/geminiJudge.js`)**:
  - **Elevated Catalog Taxonomy Thresholds**: Raised Deezer minimum fans from 1,000 to 25,000 and minimum rank from 100,000 to 200,000 for anime catalog harvesting, pruning bedroom uploads, karaoke demos, and amateur meme audio while admitting verified anisong chart-toppers.
  - **Curated Official Japanese Anisong Artist Seeds**: Injected authentic anisong performers (*YOASOBI*, *LiSA*, *Ado*, *Kenshi Yonezu*, *FLOW*, *RADWIMPS*, *Asian Kung-Fu Generation*, *Eve*, *Official HIGE DANdism*, *TK from Ling tosite sigure*, *SawanoHiroyuki[nZk]*, *ClariS*, *Creepy Nuts*, *SPYAIR*, *UVERworld*) into the query planner to anchor candidate pools with legitimate anime soundtrack releases.
  - **Audio Mod, Fan Cover Channel & Music Box Filtering**: Hardened `isAuthenticTrack` to filter unofficial YouTube cover artists (*Pellek*, *Little V.*, *ShiroNeko*, *Jonathan Young*, *NateWantsToBattle*, *Tsuko G.*, *RichaadEB*, *Rainych*, *AmaLee*), generic music box/lullaby ensembles, and title modifications (*music box*, *lullaby*, *bgm cover*, *fan cover*, *metal cover*, *rock cover*, *guitar cover*, *violin cover*, *piano cover*, *synth cover*, *lo-fi remix*, *phonk remix*).
  - **Western Animation & Cross-Genre Leakage Guardrails**: Expanded `isThematicallyPermitted` in anime mode to reject Western animation soundtracks (*Disney*, *Pixar*, *DreamWorks*, *Illumination*, *Moana*, *Frozen*, *Encanto*, *Lion King*, *Aladdin*, *Toy Story*, *Shrek*), literal novelty titles matching `/^anime\s+(theme|song|ost|music)$/i`, American television drama releases (*Empire Cast*), and unrelated Latin pop (*Sandoval*) or Moroccan hip-hop (*Dizzy DROS*) lacking Japanese context.
  - **Generic Soundtrack Cue Abbreviation Filter**: Filtered out generic 2-letter soundtrack abbreviations as crossword answers (`TV`, `OP`, `ED`, `OST`, `BGM`) in `trySelectTracks`, falling back to artist names or alternative keywords.
  - **Compound Refinement Queries & Storefront Inheritance**: Re-engineered the replenishment loop to construct compound provider queries (`artist:"${artist}" track:"${title}"` for Deezer, `"${artist} ${title}"` for iTunes) whenever both artist and title are available, anchored single titles with theme context (`"${title} anime"`), and inherited the puzzle theme's regional storefront (e.g. `jp` for anime) to prevent cross-genre hit collisions during LLM Judge backfills.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 13 automated test cases verifying anime taxonomy thresholds, cover channel and audio mod filtering, Western animation exclusions, and compound prompt guidance (290 total automated tests).

---

## [1.6.0] - 2026-09-18

### Added
- **Gemini LLM Judge Song Selection Enhancement (`server/services/geminiJudge.js`, `server/services/musicService.js`)**:
  - Leverages Google Gemini to evaluate candidate song pools after initial sampling and filter out off-topic, novelty, or theme-inappropriate tracks.
  - **Model Priority, Intra-Model Retries & Fallback Cascade**: Evaluates with `gemini-3.8-flash` primarily, retrying up to 4 times per model with exponential backoff on temporary 503 high-demand spikes, 429 rate limits, or network timeouts before gracefully cascading to `gemini-3.7-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash` (with immediate break on 404s).
  - **Full Input Context Contract**: Injects the exact user configuration into the evaluation prompt—including mode (`preset theme` or `custom free-text prompt`), specific theme title or prompt string, popularity profile (`mainstream`, `balanced`, `obscure`, `pure`), and target word count.
  - **Negotiated Contract for Replacements**: When tracks are rejected, Gemini provides structured replacement query parameters (`artist`, `trackTitle`, `genre`, `searchTerms`, bounded `yearRange`, `targetStorefront`, `popularity`) that directly map to catalog query engines.
  - **Iterative Refinement Loop**: Dispatches replenishment queries across music providers (Deezer and iTunes), cleans tracking sets, and loops evaluation up to 4 iterations until the LLM Judge is satisfied or the pool is finalized.
  - **Zero-Overhead Standby Mode**: When `GEMINI_API_KEY` is `'TODO'` or unset, the service remains in standby mode without making network calls or adding latency, maintaining full backward compatibility.
- **Secure Key Configuration (`server/config.js`, `.env.example`)**:
  - Centralized environment loader reading `.env` (guarded by `.gitignore`).
  - Set default `GEMINI_API_KEY=TODO` in `.env.example` ensuring secrets are never committed to the repository.
- **Automated LLM Judge Test Suite (`scripts/run_tests.js`)**:
  - 47 automated test cases covering standby mode bypass, negotiated contract normalization, prompt context synthesis, 4x intra-model retries on 503 spikes, cascade fallback ladder (`3.8 -> 3.7 -> 3.6 -> 3.5`), and multi-round iterative replenishment (277 total automated tests).

---

## [1.5.2] - 2026-09-18

### Changed
- **Automatic Audio Silence on Puzzle Completion & Reveal (`src/components/AudioPlayerBar.tsx`, `src/App.tsx`, `src/hooks/useCrosswordGame.ts`, `src/components/EndScreenModal.tsx`)**:
  - Automatically pauses background music snippets and resets playback state whenever the full crossword puzzle is revealed (via hint modal or `Shift+Tab` hotkey) or completed (all words correctly solved).
  - Wired `isCompleted` and `showEndScreen` state into `AudioPlayerBar`, ensuring background audio immediately cuts out when opening the victory showcase.
  - Added guards to prevent automatic audio snippet playback on clue transitions when the puzzle has reached completion.
  - Enhanced `EndScreenModal` with lifecycle unmount cleanup ensuring audio previews stop cleanly without dangling audio elements.
  - Corrected `validateGrid` and `handleRestartPuzzle` state transitions so `isCompleted` reliably resets to `false` when a puzzle is restarted or cleared.

---

## [1.5.1] - 2026-09-18

### Added
- **Multi-Crossing Variety Engine (`shared/liveCrossword.js`)**:
  - Engineered dynamic intersection management ensuring crossword words cross each other **1 to 3 times** in an organic, distributed lattice.
  - Eliminated "starburst/telephone pole" patterns where single backbone words monopolized crossings leaving other words with only 1 intersection.
  - Placements enforce a strict maximum of 3 crossings per word and evaluate crossed words to prevent exceeding the 3-crossing ceiling.
  - Added variety distribution scoring in puzzle trials: awards bonuses for achieving a balanced combination of 1-crossing, 2-crossing, and 3-crossing words while penalizing over-concentrated single-crossing leaf branches.
  - Attached clue-level `crossings` metadata in `Clue` and `Puzzle` outputs.
  - Added unit test suite assertions verifying 1–3 crossing bounds and multi-crossing frequency diversity across puzzle generations (230 total automated tests).

---

## [1.5.0] - 2026-09-18

### Added
- **Lounge Settings Screen (`src/components/SettingsModal.tsx`, `src/App.tsx`, `src/components/LoungeDrawer.tsx`)**:
  - New dedicated Lounge Settings modal accessible via the header toolbar gear icon and slide-over menu.
  - Interactive toggle switch for word correct celebration animations (`enableWordAnimations`), persisted in `localStorage` (`spotyspice_settings`).
  - Interactive master default volume slider from 0% to 100% with live percentage readout.
  - Turntable keyboard shortcuts reference card.
- **K-Pop Generation Temporal Parsing (`server/services/queryBuilder.js`)**:
  - Added natural language parsing for K-Pop generations in free-text prompts:
    - `new gen`, `4th gen`, `5th gen` -> bounds release window to `2020-2026` and anchors genre to `kpop`.
    - `3rd gen` -> bounds release window to `2012-2019`.
    - `2nd gen` -> bounds release window to `2003-2011`.
    - `1st gen` -> bounds release window to `1990-2002`.
  - Added flagship modern K-Pop group seeding (`NewJeans`, `LE SSERAFIM`, `aespa`, `Stray Kids`, `IVE`, `ENHYPEN`, `TXT`, `ITZY`, `KISS OF LIFE`) to ensure prompt richness.
- **Authenticity & Imitation Filter (`server/services/musicService.js`)**:
  - Built `isAuthenticTrack` to reject workout compilations and soundalikes (`Power Music Workout`, `Fitness Workout`), 8-bit arcade tribute versions (`8-Bit Arcade`), generic retrospective packaging (`1981 Rock Classics`), and audio speed modifications (`(Slowed + Reverb)`, `(Sped Up)`, `(Nightcore)`, `(Instrumental Version)`).

### Changed
- **Default Master Volume Reduced to 15% (`src/components/AudioPlayerBar.tsx`, `src/components/EndScreenModal.tsx`)**:
  - Lowered base preview audio volume from 25% to a gentle, comfortable 15% across all audio elements with `localStorage` user persistence.
- **Open Shuffle & Random Crossword Quality Elevation (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - Elevated default popularity for open shuffle from uncurated `pure` (`minFans: 0`, `minRank: 0`) to `balanced` (`minFans: 25,000`).
  - Eliminated arbitrary 2-letter alphabetic random seeds (`"rh"`, `"gl"`, etc.) in open shuffle in favor of curated rotating genre chart pools.
  - Added strict multilingual stopword filtering and `foreignGenres` rejection (e.g. `Pop Latino`, `Música Mexicana`, `Urbano latino`, `MPB`, `French Pop`) to prevent non-English and obscure international tracks from slipping into standard puzzles.
  - Added filters for classical orchestral movements (`Symphonie`, `Concerto`, `Larghetto`) and children's nursery rhyme albums.
- **Crossword Grid Animation Control (`src/components/CrosswordGrid.tsx`)**:
  - Connected `enableWordAnimations` prop to conditionally trigger tile celebration ripples.

### Fixed
- **Thematic Precision & Western Collisions in K-Pop & Other Themes (`server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - Prevented generation prefix leakage (`"gen kpop"`) from entering search queries.
  - Added hard guardrails rejecting Western acts matched via token homonyms (Steven Wilson, Carrie Underwood, Destiny's Child, Billy Idol, Hozier, M4rkim, etc.).
  - Added foreign dub marker filtering, rejecting French dubs and language translations (e.g. `Saja Boys - Soda Pop (version française)`).
  - Cleaned up keyword taxonomies across `gaming`, `cinematic`, `poppunk`, `hiphop`, and `edm`.

---

## [1.4.9] - 2026-09-18

### Added
- **Audio Sample Interactive Scrubber & Playback Controls (`src/components/AudioPlayerBar.tsx`)**:
  - Replaced the static progress ribbon with an interactive scrubber bar equipped with playhead thumb, clickable track seek, current timestamp, total duration (`0:14 / 0:30`), and quick `-5s` / `+5s` jump buttons.
- **Word Completion Celebration Animation (`src/index.css`, `src/hooks/useCrosswordGame.ts`, `src/components/CrosswordGrid.tsx`)**:
  - Detects when an active word is fully filled and correct.
  - Plays a staggered tactile spring bounce animation (`@keyframes letter-correct-pop`) across each letter cell with an emerald and gold celebration aura.
- **Reveal Whole Puzzle Hotkey (`src/components/CrosswordGrid.tsx`, `src/components/HintModal.tsx`, `src/App.tsx`)**:
  - Bound `Shift + Tab` as a direct keyboard shortcut to solve and reveal the entire puzzle.
  - Updated `<kbd>` badges in the Hint modal and action tooltips.

### Changed
- **Crossword Tile Typography & Readability Rework (`src/components/CrosswordGrid.tsx`)**:
  - Increased letter font size from `48%` to `58%` of cell size (`15px` to `27px`) in bold/black uppercase (`font-sans font-black`).
  - Redesigned cell states for high-contrast legibility: crisp white cardstock for standard tiles, luminous amber for active words, and bright gold with radiant ring for selected tiles.
- **Dense Crossword Placement Engine with Multi-Crossing Scoring (`shared/liveCrossword.js`)**:
  - Overhauled crossword generation from first-intersection placement to an exhaustive multi-intersection compactness scoring algorithm.
  - Exponentially rewards 2+ crossing letters (+120 bonus), penalizes bounding box sprawl, and runs 30 randomized trials to select the densest layout with maximum interlocking words.
- **Answer Length Variation (2 to 14 Letters) (`shared/musicIdentity.js`, `shared/musicKeywords.js`, `server/services/musicService.js`)**:
  - Expanded answer length boundaries to 2–14 letters, allowing punchy short keywords (`UP`, `GO`, `DIE`, `APT`) and longer titles (`DIEWITHASMILE`).
  - Added rotating length buckets (`short`, `medium`, `long`) when assembling puzzle candidate tracks.
- **Two-Column Clue Layout (`src/components/ClueList.tsx`, `src/App.tsx`)**:
  - Split Across (Horizontal) and Down (Vertical) clues into a balanced 2-column side-by-side grid, utilizing the full screen width and eliminating empty dead space.

### Removed
- **Header Badge (`src/App.tsx`)**:
  - Removed the `LIVE SALON` badge from the header.

### Fixed
- **Feature & Collaboration Concatenation Elimination (`shared/musicKeywords.js`)**:
  - Ensured collaborating artists (e.g. `ROSÉ & Bruno Mars`) are strictly emitted as separate candidate entities (`ROSE` and `BRUNOMARS`), never concatenated into combined answers like `ROSEBRUNOMARS`.
  - Added case-insensitive feature stripping for unparenthesized and parenthesized features (`feat.`, `ft.`, `featuring`) while protecting genuine title words (`Die With A Smile`).

---

## [1.4.8] - 2026-09-18

### Fixed
- **Deezer Artist ID 147485 ("Anime" / DJ AniMe) & Collaborator Elimination (`server/services/queryBuilder.js`, `server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - Identified the exact source of Italian hardcore techno DJ Barbara Palermo (Deezer Artist ID `147485`, indexed as `"Anime"` with 15,791 fans): Deezer's search engine treated the raw search term `q=anime` as a direct artist lookup, surfacing her solo tracks and collaborating artists (*Broken Minds*, *DJ Paul Elstak*, *Miss K8*, *MAD DOG*).
  - Replaced raw bare `'anime'` queries in `generateThemeVariations` with compound Japanese animation terms (`'anime opening'`, `'anime ost'`, `'anime theme'`, `'japanese anime'`), preventing Deezer from returning artist ID 147485 and unrelated Latin/Gabber tracks.
  - Added strict guardrails in `isThematicallyPermitted`:
    - Explicitly blocks tracks where `providerArtistId === '147485'` or `contributorArtistIds` contains `'147485'`.
    - Recursively checks all collaborating artists (`splitArtistNames`) to block `Anime` / `DJ AniMe` when featured or co-credited.
    - Rejects any candidate in anime contexts where the generated crossword answer would be `ANIME`.
    - Disallows hardcore techno labels, festivals, and releases (*Masters of Hardcore*, *Traxtorm*, *Thunderdome*, *Dominator*, *Break Your Mind*, *Aftermath*).
  - Extended `mapDeezerTrack` to preserve `contributorArtistIds` for downstream filtering.

---

## [1.4.7] - 2026-09-18

### Fixed
- **Crossword UI Responsive Cell Geometry & Overlap Elimination (`src/components/CrosswordGrid.tsx`)**:
  - Replaced flexible grid track minmax sizing (`minmax(0, 1fr)`) with dynamically calculated pixel track dimensions (`repeat(${cols}, ${cellSize}px)` and `repeat(${rows}, ${cellSize}px)`).
  - Eliminated tile squishing, overlapping borders, and shadow distortion that occurred when puzzles generated with wider column counts (e.g. 10–15 columns) on constrained viewport widths.
  - Implemented automatic responsive cell calculation via `ResizeObserver` bounded between 24px (compact mobile layout) and 42px (spacious desktop display).
  - Explicitly sized tile buttons and empty block cells to match grid tracks, guaranteeing vertical alignment for intersecting words across all rows.
  - Dynamically scaled letter fonts (`12px` to `20px`) and clue number indicators (`7.5px` to `10.5px`) based on cell size.
  - Relocated selected tile corner studio tape marker to top-right to prevent obscuring top-left clue numbers.
  - Scaled vinyl turntable backdrop responsively (`360px` mobile, `460px` tablet, `560px` desktop) for a clean visual presentation across all device viewports.

---

## [1.4.6] - 2026-09-18

### Maintenance & CI/CD
- **GitHub Actions Node.js 24 Runtime & Modern Action Upgrades (`.github/workflows/ci.yml`, `.github/workflows/manual-release.yml`)**:
  - Upgraded GitHub Actions to official Node 24 native major releases, resolving runner deprecation warnings for Node.js 20:
    - `actions/checkout@v4` $\rightarrow$ `actions/checkout@v5`
    - `actions/setup-node@v4` $\rightarrow$ `actions/setup-node@v5` with `node-version: 22` (Active LTS)
    - `docker/setup-buildx-action@v3` $\rightarrow$ `docker/setup-buildx-action@v4`
    - `docker/build-push-action@v5` $\rightarrow$ `docker/build-push-action@v7`
    - `softprops/action-gh-release@v2` $\rightarrow$ `softprops/action-gh-release@v3`
  - Ensured future-proof execution ahead of GitHub runner image transitions.

---

## [1.4.5] - 2026-09-18

### Fixed
- **Multi-Artist Collaboration Separation & Title Concatenation Prevention (`shared/musicKeywords.js`, `shared/musicIdentity.js`, `server/services/musicService.js`)**:
  - Prevented collaborating artists from being combined into a single concatenated crossword answer like a title (e.g. `Ski Aggu & Sira` is no longer combined into `SKIAGGUSIRA`).
  - Added intelligent multi-artist parser (`splitArtistNames`, `isSingleEntityArtist`) recognizing distinct collaborators (`Ski Aggu` or `Sira`, `Drake` or `21 Savage`, `David Guetta` or `Bebe Rexha`).
  - Generated distinct candidate clues for each artist (`Lead performer` vs `Co-performer`), allowing graceful fallback between collaborators on the grid before falling back to song titles or keywords.
  - Tracked all individual collaborating artist identities in `seenArtists` to guarantee variety and prevent duplicate artist appearances across the crossword.
- **Single-Entity Band Ampersand Expansion to "AND" (`shared/musicIdentity.js`, `shared/musicKeywords.js`)**:
  - When an artist or group is a single entity with `&` (e.g. `Above & Beyond`, `Mumford & Sons`, `Kool & The Gang`, `Bob Marley & The Wailers`, `Of Mice & Men`), the `&` is expanded to `AND` (`ABOVEANDBEYOND`, `MUMFORDANDSONS`, `KOOLANDTHEGANG`) rather than being stripped out.
  - Expanded `&` to `AND` in song titles as well (e.g. `Rock & Roll` -> `ROCKANDROLL`).
  - Unified `canonicalMusicKey` to map `&` and `+` to `and` for consistent search and blacklisting comparisons.
- **Automated Test Suite Expansion (`scripts/run_tests.js`)**:
  - Added 20 automated unit assertions covering multi-artist splitting, collaboration clue generation, single-entity band identification, and ampersand expansion, bringing the test suite to **192 passing tests**.

---

## [1.4.4] - 2026-09-18

### Added
- **Hint Hotkeys (<kbd>Space</kbd> for Letter, <kbd>Tab</kbd> for Word) (`src/components/CrosswordGrid.tsx`, `src/components/HintModal.tsx`, `src/App.tsx`, `src/hooks/useCrosswordGame.ts`)**:
  - Bound <kbd>Space</kbd> to instantly reveal the letter at the current cursor cell, validate it, and automatically advance the cursor to the next empty cell in the active word.
  - Bound <kbd>Tab</kbd> to instantly fill and reveal the entire active word and automatically advance to the next clue.
  - Added visual keyboard badges (`<kbd>Space</kbd>` and `<kbd>Tab</kbd>`) inside `HintModal.tsx` and updated the header hint button tooltip.
  - Added real-time co-op synchronization for hints in multiplayer rooms.
- **Universal Remaster / Reissue Historical Vintage Detection (`server/services/musicService.js`)**:
  - Implemented regex vintage parser detecting original release stamps in track/album metadata (e.g. `(YYYY Remaster)`, `(Remastered YYYY)`, `(Live YYYY)`).
  - Automatically evaluates true musical vintage against requested temporal bounds, preventing legacy songs re-released recently (e.g. deathcore remasters) from falsely qualifying for contemporary prompts (`2020-2026`).
- **Cross-Theme Semantic Prefix & Homonym Guardrails (`server/services/musicService.js`, `server/services/queryBuilder.js`)**:
  - **Anime**: Filtered out Deezer prefix stem collisions matching `anim*` (`Animal Collective`, `Techno Animal`, `Animosity`, `Os Abelhudos - As Crianças e os Animais`), filtered hardcore techno DJ *AniMe*, and rejected Apple Music JP storefront leakage (K-Pop singles like *TWICE*).
  - **High-Intent Compound Anime Searches**: Upgraded search generation to query `"anime opening"`, `"anime ost"`, `"anime theme"` instead of bare `"anime"`.
  - **Gaming / Video Games**: Filtered out rapper *The Game* and non-gaming stem collisions (e.g. *Gamin*).
  - **Pop-Punk**: Filtered out electronic act *Daft Punk*.
  - **EDM / Dance**: Filtered out post-hardcore band *Dance Gavin Dance* and Tina Turner's *Private Dancer*.
  - **Latin**: Filtered out British 80s new wave band *Latin Quarter*.
- **Accurate Provider Badge Display (`src/components/EndScreenModal.tsx`)**:
  - Updated puzzle solve screen to display **"Apple Music"** with distinct rose badge styling when tracks originate from the iTunes/Apple Music provider, avoiding misleading "Spotify" badges.
- **Comprehensive Automated Test Expansion (`scripts/run_tests.js`)**:
  - Added 17 unit tests verifying cross-theme guardrails, remaster vintage detection, and storefront leakage, bringing the test suite to **172 passing tests**.

---

## [1.4.3] - 2026-09-18

### Changed
- **Audio Preamp Deck & End-Screen Base Volume Set to 25% (`src/components/AudioPlayerBar.tsx`, `src/components/EndScreenModal.tsx`)**:
  - Calibrated default audio playback volume to a comfortable 25% (0.25) across all preview players.
  - Initialized volume immediately upon audio element mount and clue transitions.
- **CI Test Suite Optimization (`.github/workflows/ci.yml`, `.github/workflows/manual-release.yml`)**:
  - Configured automated CI workflow to execute linting and the 155-case automated test suite (`npm test`) on every push and pull request, omitting the live network-harvesting prompt suite.
  - Reserved the 14-scenario multi-prompt crossword suite for manual execution via workflow dispatch (`run_prompt_suite: false` by default in `manual-release.yml`) or local CLI (`npm run test:prompts` / `npm run test:all`).

---

## [1.4.2] - 2026-09-18

### Added
- **Complete Test Suite Automation in Workflows & CI Pipeline**:
  - **CI Workflow (`.github/workflows/ci.yml`)**: Added automated CI workflow triggering on every `push` and `pull_request` to `main`, running ESLint, the 155-case automated test suite (`npm test`), and the 14-case live multi-prompt crossword verification suite (`npm run test:prompts`).
  - **Release Workflow Enhancement (`.github/workflows/manual-release.yml`)**: Configured `run_prompt_suite` to run by default (`default: true`), guaranteeing all tests execute before any Docker image build or GitHub Release creation.
  - **NPM Script Unification (`package.json`)**: Added `npm run test:all` and updated `npm run test:ci` to execute both linting, unit/integration tests, and prompt verification end-to-end.
- **Crossword Placement Engine & Full Multiplayer Sync Tests (`scripts/run_tests.js`)**:
  - **Live Crossword Placement Tests**: Validated bounding box computations, coordinate constraints, and non-empty placement grids directly in the automated test suite.
  - **Complete 2-Player Live Synchronization**: Validated the entire multiplayer lifecycle (host room creation, guest room join, synchronized game start, real-time co-op cell update broadcast, and versus race progress update).
  - Test suite expanded from 145 to **155 passing tests**.

---

## [1.4.1] - 2026-09-18

### Added
- **Multi-Prompt Crossword Generation Suite Expansion (`scripts/test_prompts_crossword_suite.js`)**:
  - Expanded automated crossword generation suite to 14 comprehensive test prompts.
  - Added dedicated test scenarios for:
    - **Single Artist**: `songs by Daft Punk` (asserts 0% artist name clues, 100% title/keyword clues, and multi-track selection).
    - **Temporal Range**: `anime from the years 2020-2026` (asserts 100% temporal fidelity within 2020-2026 and homonym protection).
    - **Temporal Upper Bound**: `grunge before 1994` (asserts 100% temporal fidelity strictly $\le 1993$).
    - **Temporal Range Bounds**: `rock between 1970 and 1976` (asserts 100% temporal fidelity within 1970-1976).
  - Achieved **100% suite pass rate (14/14)** with 10/10 words placed on every grid.

---

## [1.4.0] - 2026-09-18

### Added
- **Temporal Prompt Parsing & Release Date Validation (`server/services/queryBuilder.js`, `server/services/musicService.js`)**:
  - **Multi-Dimensional Temporal Parsing**: Full support for date spans (`from the years 2020-2026`, `between 1970 and 1976`, `2020-2026`), upper bounds (`before 1994`, `pre-2000`, `prior to 1990`), lower bounds (`after 2018`, `since 2020`, `post-2010`), single release years (`in 1999`, `released in 2022`), and decades (`80s`, `1990s`).
  - **Order-Dependent Extraction Pipeline**: Temporal parsing extracts date bounds before artist directive matching, preventing phrases like `from the years 2020-2026` or `from 1980` from misidentifying temporal ranges as artist names.
  - **Temporal Candidate Verification (`isTemporalPermitted`)**: Rejection sampling validates track release years against the parsed temporal window, tracking `rejections.temporal` in server diagnostics.
  - **Anchor-Year Provider Queries**: Automatically injects year-anchored search queries (start year, midpoint, end year) into Deezer and iTunes harvesting.
- **Single-Artist Dedicated Crosswords & Clue Policy (`server/services/musicService.js`, `shared/musicKeywords.js`, `server/services/queryBuilder.js`)**:
  - **Zero "Artist Name" Clue Policy**: For single-artist puzzles (e.g. `songs by Daft Punk`, `Queen`), clues asking for the artist name are strictly eliminated (0% Artist clues). 100% of clues resolve to Song Title or Song Title Keyword (`allowArtist: false`).
  - **Target Artist Multi-Track Exemption**: Allows multiple distinct songs by the queried artist while preserving strict duplicate title and duplicate answer protection on the puzzle grid. Non-target collaborating artists remain capped at 1 track.
  - **Noise & Filler Word Scrubbing**: Strips non-genre terms (`songs`, `tracks`, `music`, `discography`, `singles`) so queries like `songs by Daft Punk` do not contaminate the residual genre.
  - **Standalone Artist Recognition**: Direct artist prompts without `by` (e.g. `Queen`, `Daft Punk`) automatically map to target artists using the curated artist registry.
- **Anime Theme Homonym Guardrail (`server/services/musicService.js`)**:
  - Rejects tracks where the artist or song title is literally the word `"Anime"`, preventing non-soundtrack Western rap/pop collisions.
- **UI Clarifications (`src/components/LiveGeneratorModal.tsx`)**:
  - Renamed `"Steered Prompt & AI"` to `"Steered Prompt"`.
  - Updated example prompts to demonstrate temporal and single-artist steering (`Songs by Daft Punk`, `Anime from the years 2020-2026`, `90s Grunge before 1994`).

---

## [1.3.0] - 2026-09-18

### Added
- **Storefront Steering, Thematic Homonym Guardrails & Spoken Media Filters (`server/services/itunesMusicProvider.js`, `server/services/musicService.js`, `server/services/deezerMusicProvider.js`)**:
  - **Dynamic iTunes Storefront Steering (`detectStorefront`)**: Automatically directs cultural prompts to authentic regional storefronts (`JP` for Japanese/City Pop/Anime, `FR` for French House/Chanson, `DE` for German Krautrock, `BR` for Bossa Nova/MPB, `ES` for Latin, `JM` for Reggae, `NG` for Afrobeat, `GB` for Britpop/UK Garage, and `US` for K-Pop and Western pop/rock).
  - **Thematic Homonym & Novelty Act Filtering (`isThematicallyPermitted`)**: Rejects Western artist collisions matching cultural adjectives (e.g. *The Japanese House*, *The Japanese Popstars*, *French Montana*, *German Brigante*) and novelty titles (e.g. *Aneka - "Japanese Boy"*, *Doctor Flake - "Japanese Porn"*, or non-Korean rap tracks titled *"K-POP"*), including featured artist mentions in titles.
  - **Compound Genre Invariance (`server/services/queryBuilder.js`)**: Protects atomic compound sub-genres (`City Pop`, `French Touch`, `Krautrock`, `Bossa Nova`, `Classic Rock`, `Roots Reggae`) so compound themes are never broken or degraded into generic pop or rock tokens.
  - **Audiobook & Spoken Track Rejection (`mapDeezerTrack`, `mapItunesTrack`)**: Excludes audiobooks, spoken radio drama episodes (`Kapitel`, `Folge`, `Chapter`), and raw audio file rips (`.flac`, `.mp3`) from crossword clue generation.
  - **Grid Answer Duplicate Self-Healing (`server/services/musicService.js`)**: When multiple tracks by the same artist are permitted or when an artist answer would duplicate an existing grid entry, automatically falls back to song title instead of dropping the candidate track.
  - **Multi-Genre Crossword Verification Test Suite (`scripts/test_prompts_crossword_suite.js`, `npm run test:prompts`)**: Automated end-to-end test suite evaluating 10 diverse genres, eras, and cultures (`Japanese City Pop`, `French House`, `90s Grunge`, `Bossa Nova`, `Synthwave`, `Afrobeat`, `German Krautrock`, `K-Pop 2010s`, `Reggae Roots`, `Classic Rock 70s`), achieving **100% test pass rate**, **100% thematic purity (0 homonym leaks)**, **10/10 words placed on every grid**, and balanced clue distributions.
- **Enhanced Release Workflow (`.github/workflows/manual-release.yml`)**:
  - Added `run_prompt_suite` input parameter to trigger the live 10-genre crossword verification suite during pre-release validation.

---

## [1.2.0] - 2026-09-18

### Added
- **Extended Structured Server Logging (`server/logger.js`)**:
  - **Subsystem Categorization**: Contextual tagging across the backend stack (`[STARTUP]`, `[API]`, `[HARVEST]`, `[SAMPLING]`, `[CROSSWORD]`, `[STORE]`, `[WS]`, `[ROOM]`).
  - **ISO Timestamps & Colorized TTY Levels**: High-visibility console output (`DEBUG`, `INFO`, `WARN`, `ERROR`) with automatic TTY color detection and `NO_COLOR` compliance.
  - **Runtime Log Level Filtering**: Configurable via `LOG_LEVEL` environment variable (`debug`, `info`, `warn`, `error`).
  - **Deep Rejection Sampling Telemetry**: Real-time breakdown of candidate filtering metrics, pinpointing why tracks were discarded (recency, blacklist, non-English language markers, artist duplicates, title duplicates, and answer collisions).
  - **Clue Distribution Visibility**: Logs exact clue type distributions across generated song pools (`Title`, `Artist`, `Keyword`).
  - **Crossword Layout & Token Diagnostics**: Tracks layout generation execution time (ms), grid dimensions, word placement ratios, and live token lifecycle events.
  - **Multiplayer WebSocket Event Tracing**: Room creation, joins, game starts, disconnections, and cleanup logged with player and room metadata.
- **Prompt Priority & Thematic Query Precision (`server/services/queryBuilder.js`)**:
  - Prompts with themes/genres (e.g. `"80s Japanese City Pop"`) take priority over modal default `genre: 'all'`, preventing open catalog fallback.
  - Compound search term generation combining genre + era/decade (e.g. `"Japanese City Pop 1980s"`).
  - Strict guardrail: random alphanumeric entropy seeds (`generateDynamicSeed()`) are forbidden from executing whenever a user prompt is present.
- **Cultural & Regional Language Policy (`server/services/musicService.js`, `server/services/itunesMusicProvider.js`)**:
  - Automatically detects international/regional themes in prompts or genres (`Japanese`, `City Pop`, `K-Pop`, `Latin`, `Anime`, `Spanish`, `French`, `German`, etc.).
  - Grants language exemption allowing native titles, Kanji, Kana, Hangul, and accented characters.
  - Bypasses US iTunes storefront constraint for international and Asian soundtrack discovery.
- **Universal Multi-Query Harvesting & Repetition Cap ($\le 3$ repeats across 50 crosswords)**:
  - **Dynamic Theme Variations (`server/services/queryBuilder.js`)**: Generates complementary sub-genre, de-spaced (`synthwave`, `citypop`), and decade-specific queries generically for any prompt while preserving cultural identifiers (`Japanese`, `French`, `Korean`, etc.).
  - **Deep Multi-Provider Ingestion (`server/services/musicService.js`)**: Expanded aggregator candidate harvesting depth to 250 on Deezer and 4 parallel queries of 100 tracks on iTunes, discovering 400+ unique candidates per prompt without static seed lists.
  - **Multi-Pass Tiered Play-Frequency Sampling (`server/services/musicService.js`)**: Strictly prioritizes unplayed tracks (Tier 0). Only taps Tier 1 (1 previous play) and Tier 2 when unplayed tracks are exhausted, strictly capping any song at $\le 3$ repetitions across extended sessions.
  - **Session Memory Expansion (`src/services/dynamicMusicService.ts`)**: Expanded client session memory buffer from 50 to 300 tracks.
  - **50-Crossword Simulation Benchmark (`scripts/evaluate_city_pop_variance.js`)**: Evaluated 50 consecutive crosswords with live provider APIs and rolling session tracking, achieving **99.5% unique songs** (420 unique out of 422 slots) and a maximum repetition of only **2x** per song (exceeding the $\le 3$ benchmark).

---

## [1.1.0] - 2026-09-18

### Added
- **Dynamic Catalog Discovery (Zero Predetermined Lists)**:
  - Completely removed hardcoded artist lists, predetermined songs, and dictionary seed words to prevent repetitive output on requerying.
  - Dynamically randomized query exploration via random pagination offsets (`index`), randomized sort orders (`RANKING`, `TRACK_ASC`, `RATING_ASC`, `DURATION_ASC`), and uniform phonetic letter sampling for open catalog queries.
- **Genre Fidelity & Anime Search Precision**:
  - Eliminated generic English seed word pollution from genre searches. Selecting `anime` strictly queries anime soundtracks, openings, and Japanese animation music without unrelated pop songs.
- **English Language Enforcement (Except Anime & K-Pop)**:
  - Non-anime/non-kpop categories (Pop, Rock, Hip-Hop, EDM, etc.) are strictly filtered to the English language, discarding non-Latin scripts and foreign language tracks.
  - Explicitly permits Japanese soundtracks and artists for **Anime** and Korean tracks for **K-Pop**.
  - Localized iTunes queries with `country=US` and `lang=en_us` for English themes.
- **Balanced Clue Type Variance**:
  - Puzzles now feature an engaging, intentional balance of question types: **~40% Song Title**, **~40% Artist Name**, and **~20% Song Title Keyword**.
  - Clue types cycle across the crossword (`extractAnswerKeyword` accepts `preferredType`), with automatic graceful fallback.
- **14-Character Song Title Cap**:
  - Reduced combined song title maximum length from 16 to **14 characters** (3 to 14 letters), perfectly suited for standard physical crossword dimensions (e.g. `YOURLOVE`, `GETLUCKY`, `BLINDINGLIGHTS`).
  - Longer titles fall back to artist name (3 to 14 chars) or prominent title keyword (4 to 10 chars).
- **Duplicate Title Exclusion**:
  - Candidate pool rejection sampling tracks canonical song titles (`seenTitles`) in addition to tracks, artists, and answers, preventing duplicate or cover song titles in the same puzzle.
- **Prompt Parser & Multi-Endpoint Harvesting**:
  - Free-text prompt parser (`server/services/queryBuilder.js`) extracting decades, artist directives, and popularity spectrums.
  - iTunes search provider integration (`server/services/itunesMusicProvider.js`) with 600×600 album artwork and preview verification.
  - Deterministic SHA-256 seed hashing for reproducible puzzle sharing.
- **Manual CI/CD Release Pipeline (`.github/workflows/manual-release.yml`)**:
  - Added on-demand GitHub Actions workflow (`workflow_dispatch`) that runs ESLint, executes all 100 tests, builds the production Docker image, tags the git commit, extracts changelog notes, and generates the GitHub release.
- **Automated Test Coverage**:
  - Expanded automated test suite in `scripts/run_tests.js` to 100 passing tests covering 14-char limits, clue variance, language permission checks, anime genre isolation, and duplicate title exclusions.

### Changed
- `Dockerfile`: Added `COPY shared/ ./shared/` in runner stage to ensure shared modules are available at runtime.
- `package.json`: Bumped version to `1.1.0`.
- `shared/musicKeywords.js`: Updated combined song title answer cap to 14 letters; added candidate extraction supporting preferred clue types (`extractAllAnswerCandidates`, `extractAnswerKeyword`).
- `server/services/queryBuilder.js`: Replaced hardcoded seed words with dynamic entropy; ensured genre queries are never contaminated with unrelated search terms.
- `server/services/deezerMusicProvider.js`: Removed generic Asian pop chart 16 for anime; configured targeted anime and soundtrack searches.
- `server/services/musicService.js`: Added `isLanguagePermitted`, duplicate title rejection, and clue type rotation across crossword pools.

---

## [1.0.0] - 2026-09-17

### Added
- **Blind Audio Crossword Gameplay**:
  - 30-second audio previews with hidden track and artist titles until victory.
  - Floating 33⅓ RPM vinyl turntable rotating beneath interactive letter tiles.
- **Catalog & Theme Library**:
  - 220+ pre-generated puzzles across 11 curated musical themes (Rock, Pop, Hip-Hop, EDM, K-Pop, Anime, Gaming, Cinematic, Latin, Pop-Punk, Mixed).
- **On-The-Fly Live Crossword Generation**:
  - Real-time placement algorithm generating intersecting crossword grids from live streaming candidates.
- **Real-Time Multiplayer Lounge**:
  - WebSocket lounge supporting Co-Op (collaborative grid solving) and Versus Race modes.
  - Zero-account anonymous player sessions.
- **Multi-Tier Hints & Crate Blacklists**:
  - Reveal letter, solve word, or reveal puzzle hints.
  - Persistent user blacklist for silencing unwanted artists or songs.
- **Full Test Suite & Tooling**:
  - Automated CI-friendly test runner (`scripts/run_tests.js`).
