---
name: crossword-engine
description: Design, generate, test, and debug music crossword puzzles, prompt steering, keyword extraction, and LLM judgment.
---

# Crossword Engine Skill

Use this skill when developing or debugging crossword puzzle generation, prompt parsing, keyword extraction, clue distribution, or the Gemini LLM judge.

## Key Files & Modules

- `server/services/crosswordGenerator.js`: Backtracking crossword grid layout placement engine.
- `server/services/keywordExtractor.js`: Extracts canonical answers, cleans titles, handles artist collaborations, and balances length variety.
- `server/services/promptParser.js`: Parses user prompt directives (genres, decades, artists, popularity).
- `server/services/crosswordJudge.js`: Automated crossword judgment suite (`judgePuzzle`, `judgeMultiGenerationSuite`) evaluating theme fidelity, language compliance, and track diversity.
- `server/services/musicService.js`: Aggregates candidates from SQLite catalog, isolated anime catalog, Deezer, and iTunes.
- `server/db/animeCatalog.js`: Isolated anime SQLite database with OP/ED discrimination and multi-sample offset selection.
- `scripts/eval_crossword_factory.js`: Automated benchmark & batch evaluation runner (`npm run eval:crosswords`).
- `scripts/test_prompts_crossword_suite.js`: Comprehensive multi-prompt crossword verification suite (`npm run test:prompts`).

## Key Rules & Heuristics

1. **Answer Extraction Rules**:
   - Strip feature credits `(feat. ...)`, `[feat. ...]`, `ft. ...` before generating answers.
   - Strip remaster annotations `(Remastered ...)`, `[2024 Remaster]`.
   - Titles up to 14 characters can be concatenated without spaces (e.g. `DIE WITH A SMILE` -> `DIEWITHASMILE`).
   - For collaborating artists (`Artist A & Artist B` or `Artist A feat. Artist B`), never concatenate into a single word. Extract individual candidates (`ARTISTA`, `ARTISTB`).
   - For single-entity bands with ampersands (`Above & Beyond`, `Mumford & Sons`), expand `&` to `AND` (`ABOVEANDBEYOND`).

2. **Anime OP/ED Sourcing Isolation**:
   - When prompt is anime (`isAnimeTarget()`), routing automatically bypasses general music catalogs and queries `animeCatalog` directly.
   - Discriminate theme types (`OP`, `ED`, or all) via `getAnimeThemeType()`.
   - Audio previews serve locally via `/audio/anime/...` with rotation across multi-sample variations (e.g., 5s, 35s, 65s offsets) for enhanced replay variety.

3. **Homonym & Foreign Artist Protection**:
   - Guard against name prefix collisions (e.g. `DJ AniMe` for anime prompts, `The Game` for gaming prompts, `The Japanese House` for Japanese City Pop).
   - Enforce storefront routing (e.g. `JP` for Japanese City Pop, `KR` for Korean Trot) to prevent western lookalike leakage.

4. **Artist Directives & Keyphrase Deduplication**:
   - If user asks for "songs by [Artist]", the engine must allow multiple songs from that artist.
   - For single-artist crosswords, enforce **0% "Artist name" clues** and **100% "Song title" or "Keyword" clues** (since all answers would otherwise be identical to the artist name).
   - For custom prompts with specific keyphrases (e.g. `anime gundam` or `country songs by dolly parton`), multiple tracks from that franchise or artist are allowed without deduplication rejection (`isKeyphraseAnimeMatch`, `isTargetArtist`).
   - The target keyphrase tokens (e.g. `GUNDAM`, `DOLLY`, `PARTON`) are blacklisted from grid answers in `seenAnswers` so the puzzle never asks for the franchise or artist name as a grid solution.

5. **Zero-Spoiler Clue Discipline & Entity Isolation (`shared/clueGenerator.js`)**:
   - Clues must **never** leak the solution (`containsAnswerLeak()`).
   - For Anime tracks: Crosswords variate across **Anime title**, **Song title**, **Artist name**, and **Song title keyword**.
     - **Anime title clues**: The anime franchise name is strictly excluded from clue text (e.g. `Anime featuring the OP2 theme (2007)`).
     - **Artist name clues**: The performer name is strictly excluded from clue text, while providing series and theme context (e.g. `Performer behind the OP2 of "Sola" (2007)`).
     - **Song title & Keyword clues**: Song titles and keywords are strictly excluded, and artist names (`by <Artist>`) are omitted to keep clues focused on the requested solution (e.g. `Key word in the OP2 of "Sola"` instead of `... by Aira Yuuki`).
   - For General `Artist name` clues: Clue text mentions the hit song title, **never** the artist name.
   - For General `Song title` clues: Clue text mentions the artist and release year, **never** the song title.
   - Universal fallback sanitizer (`sanitizeClue`): If any token of length >= 3 from the answer appears in the clue text, automatically fallback to a spoiler-free template.

6. **Testing Procedures**:
   ```bash
   # Run full unit and integration test suite (423 tests)
   npm test

   # Run prompt steering and theme generator test suite
   npm run test:prompts

   # Run comprehensive crossword evaluation benchmark
   npm run eval:crosswords
   ```
