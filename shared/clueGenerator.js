/**
 * Zero-Spoiler Clue Generation & Sanitization Engine
 *
 * Ensures that crossword clues never leak or spoil the solution (answer, artist name,
 * song title, or title keywords) while providing rich, context-aware musical clues.
 */

const IGNORED_LEAK_WORDS = new Set([
  'the', 'and', 'for', 'you', 'not', 'are', 'one', 'two', 'new', 'all', 'our',
  'out', 'who', 'how', 'man', 'boy', 'day', 'way', 'say', 'see', 'hit', 'let'
]);

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips diacritics, feature annotations, and extraneous brackets from a title.
 */
export function cleanClueTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[)\]]/gi, '')
    .replace(/\s*[([][^)\\]]*[)\\]]/g, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .trim();
}

/**
 * Detects whether a clue text leaks the answer or any non-trivial component tokens of the solution.
 *
 * @param {string} clueText - The candidate clue text
 * @param {string} answer - The crossword grid answer (uppercase alphanumeric)
 * @param {string[]} [extraTokens=[]] - Additional source tokens (e.g. raw artist or raw title)
 * @returns {boolean} True if a spoiler or leak is detected
 */
export function containsAnswerLeak(clueText, answer, extraTokens = []) {
  if (!clueText || !answer) return false;

  const lowerClue = clueText.toLowerCase();

  // 1. Direct answer string check (stripped of non-alphanumeric characters)
  const normAnswer = String(answer).toLowerCase().replace(/[^a-z0-9]/g, '');
  const normClue = lowerClue.replace(/[^a-z0-9]/g, '');
  if (normAnswer.length >= 3 && normClue.includes(normAnswer)) {
    return true;
  }

  // 2. Tokenize answer and extra source strings (e.g. artist or title parts)
  const tokenSet = new Set();
  const splitRegex = /[^a-zA-Z0-9]+/;

  String(answer).split(splitRegex).forEach(t => {
    if (t.length >= 3) tokenSet.add(t.toLowerCase());
  });

  for (const extra of extraTokens) {
    if (typeof extra === 'string') {
      extra.split(splitRegex).forEach(t => {
        if (t.length >= 3) tokenSet.add(t.toLowerCase());
      });
    }
  }

  for (const token of tokenSet) {
    if (IGNORED_LEAK_WORDS.has(token)) continue;

    // Word boundary check: ensure whole-word match
    const boundaryPattern = new RegExp(`(?:^|[^a-zA-Z0-9])${escapeRegex(token)}(?:$|[^a-zA-Z0-9])`, 'i');
    if (boundaryPattern.test(lowerClue)) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes a clue text by validating it against the answer.
 * If a leak is detected, falls back to a guaranteed spoiler-free template.
 *
 * @param {string} clueText - The generated candidate clue text
 * @param {string} answer - The crossword answer
 * @param {string} fallback - The fallback clue text if a spoiler is detected
 * @param {string[]} [extraTokens=[]] - Optional additional strings (e.g. artist or title) that shouldn't appear
 * @returns {string} Sanitized clue text
 */
export function sanitizeClue(clueText, answer, fallback, extraTokens = []) {
  if (containsAnswerLeak(clueText, answer, extraTokens)) {
    return fallback;
  }
  return clueText;
}

/**
 * Formats a rich, context-aware, spoiler-free crossword clue for a track.
 *
 * @param {object} track - Track metadata
 * @param {object} keyword - Extracted answer candidate ({ answer, clueType, clueText, artistName })
 * @param {object} [options={}] - Formatting options
 * @returns {string} Formatted, leak-proof clue text
 */
export function formatCrosswordClue(track, keyword, _options = {}) {
  if (!track || !keyword) {
    return keyword?.clueText || 'Musical clue for this track';
  }

  const answer = keyword.answer || '';
  const ansLen = answer ? ` (${answer.length} letters)` : '';
  const clueType = keyword.clueType || 'Song title';
  const isAnime = Boolean(track.isAnimeOped);
  const releaseYear = track.releaseYear || track.release_year || track.year || null;
  const yearSuffix = releaseYear ? ` (${releaseYear})` : '';

  // ---------------------------------------------------------------------------
  // Case A: Anime OP/ED Tracks
  // ---------------------------------------------------------------------------
  if (isAnime) {
    const animeTitle = track.animeTitle || keyword.animeTitle || track.album || 'Anime';
    const themeType = track.themeType || 'OP';
    const themeSlug = track.themeSlug || `${themeType} Theme`;
    const validArtist = track.artist && !/^(unknown artist|various artists|ost|soundtrack)$/i.test(String(track.artist).trim())
      ? String(track.artist).trim()
      : '';
    const cleanTitle = cleanClueTitle(track.title);

    if (clueType === 'Anime title') {
      // User is guessing the anime series/franchise. NEVER mention animeTitle!
      const fallback = `Anime series featuring this theme${ansLen}`;
      // Context: can mention themeSlug, year, and cleanTitle (if it doesn't leak answer)
      const hasTitleLeak = cleanTitle ? containsAnswerLeak(cleanTitle, answer) : true;
      const hasArtistLeak = validArtist ? containsAnswerLeak(validArtist, answer) : true;

      let candidateClue;
      if (cleanTitle && !hasTitleLeak) {
        candidateClue = `Anime featuring the ${themeSlug} theme "${cleanTitle}"${yearSuffix}`;
      } else if (validArtist && !hasArtistLeak) {
        candidateClue = `Anime featuring the ${themeSlug} theme by ${validArtist}${yearSuffix}`;
      } else {
        candidateClue = `Anime series featuring this ${themeSlug} theme${yearSuffix}`;
      }

      return sanitizeClue(candidateClue, answer, fallback, [animeTitle, track.animeTitle, keyword.animeTitle].filter(Boolean));
    }

    if (clueType === 'Artist name') {
      // User is guessing the artist/performer. NEVER mention track.artist!
      const fallback = `Performer behind this anime theme${ansLen}`;
      const candidateClue = `Performer behind the ${themeSlug} of "${animeTitle}"${yearSuffix}`;
      return sanitizeClue(candidateClue, answer, fallback, [track.artist, keyword.artistName].filter(Boolean));
    }

    if (clueType === 'Song title') {
      // User is guessing the song title. NEVER mention track.title or track.songTitle!
      // Do NOT include artist in title clue to keep clue focused on the requested solution
      const fallback = `Theme title from "${animeTitle}"${ansLen}`;
      const candidateClue = `${themeSlug} theme of "${animeTitle}"${yearSuffix}`;

      return sanitizeClue(candidateClue, answer, fallback, [track.title, track.song_title, cleanTitle].filter(Boolean));
    }

    if (clueType === 'Song title keyword') {
      // User is guessing a keyword from the song title. NEVER mention keyword or title!
      // Do NOT include artist in keyword clue
      const fallback = `Key word in theme title from "${animeTitle}"${ansLen}`;
      const candidateClue = `Key word in the ${themeSlug} of "${animeTitle}"`;

      return sanitizeClue(candidateClue, answer, fallback, [answer, track.title, track.song_title, cleanTitle].filter(Boolean));
    }

    // Default anime fallback
    return `Theme from "${animeTitle}"${ansLen}`;
  }

  // ---------------------------------------------------------------------------
  // Case B: General Catalog Tracks (Pop, Rock, Hip-Hop, Decades, etc.)
  // ---------------------------------------------------------------------------
  const cleanTitle = cleanClueTitle(track.title);

  if (clueType === 'Artist name') {
    // User is guessing the artist name. NEVER mention track.artist!
    const fallback = `Celebrated performer of this track${ansLen}`;

    if (cleanTitle) {
      // Check if cleanTitle leaks the artist answer (e.g. self-titled songs)
      const hasTitleLeak = containsAnswerLeak(cleanTitle, answer, [track.artist, keyword.artistName].filter(Boolean));
      if (!hasTitleLeak) {
        const candidateClue = `Performer behind the hit "${cleanTitle}"${yearSuffix}`;
        return sanitizeClue(candidateClue, answer, fallback, [track.artist, keyword.artistName].filter(Boolean));
      }
    }

    return fallback;
  }

  if (clueType === 'Song title') {
    // User is guessing the song title. NEVER mention track.title!
    const fallback = `Iconic track title${ansLen}`;
    const hasArtistLeak = containsAnswerLeak(track.artist, answer, [track.title, cleanTitle].filter(Boolean));

    if (track.artist && !hasArtistLeak) {
      const yearPrefix = releaseYear ? `${releaseYear} ` : '';
      const candidateClue = `${yearPrefix}track by ${track.artist}`;
      return sanitizeClue(candidateClue, answer, fallback, [track.title, cleanTitle].filter(Boolean));
    }

    return fallback;
  }

  if (clueType === 'Song title keyword') {
    // User is guessing a keyword from the title. NEVER mention the keyword!
    const fallback = `Key word in this track title${ansLen}`;
    const hasArtistLeak = containsAnswerLeak(track.artist, answer, [answer]);

    if (track.artist && !hasArtistLeak) {
      const candidateClue = `Key word in ${track.artist}'s track title`;
      return sanitizeClue(candidateClue, answer, fallback, [answer]);
    }

    return fallback;
  }

  return keyword.clueText || `Musical clue for this track${ansLen}`;
}
