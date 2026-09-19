/**
 * Extracts candidate crossword answers (Song title, Artist name, or Title keyword),
 * capped at 14 characters, supporting variable clue distributions.
 *
 * @param {string} title - Track title
 * @param {string} artist - Artist or band name
 * @param {{ preferredType?: 'title' | 'artist' | 'keyword', allowArtist?: boolean, seenAnswers?: Set<string>, artistIndex?: number } | string} [options]
 * @returns {{ answer: string, clueType: string, clueText: string } | null}
 */
import { toCrosswordAnswer } from './musicIdentity.js';

const SINGLE_ENTITY_AND_PATTERNS = [
  // 1. Groups with "... & The [Noun]" / "... and the [Noun]" / "... & His ..." / "... & Her ..." / "... & Their ..."
  /(?:^|\s)(?:&|\band\b|\+)\s+(the|his|her|their)\s+/i,
  // 2. Groups with "... & Sons" / "... & Daughters" / "... & Brothers" / "... & Bros" / "... & Co" / "... & Company"
  /(?:^|\s)(?:&|\band\b|\+)\s+(sons|daughters|brothers|bros\.?|co\.?|company)\b/i,
  // 3. Known collective nouns or band indicators following &
  /(?:^|\s)(?:&|\band\b|\+)\s+.*?\b(band|orchestra|ensemble|quartet|trio|choir|experience|players|syndicate|chorus)\b/i,
];

const KNOWN_SINGLE_ENTITY_NAMES = new Set([
  'above & beyond',
  'above and beyond',
  'earth, wind & fire',
  'earth wind & fire',
  'earth wind and fire',
  'blood, sweat & tears',
  'blood sweat & tears',
  'blood sweat and tears',
  'simon & garfunkel',
  'simon and garfunkel',
  'hall & oates',
  'hall and oates',
  'daryl hall & john oates',
  'daryl hall and john oates',
  'brooks & dunn',
  'brooks and dunn',
  'of mice & men',
  'of mice and men',
  'iron & wine',
  'iron and wine',
  'me & my',
  'me and my',
  'tegan and sara',
  'tegan & sara',
  'angus & julia stone',
  'angus and julia stone',
  'peaches & herb',
  'peaches and herb',
  'sam & dave',
  'sam and dave',
  'ike & tina turner',
  'ike and tina turner',
  'chas & dave',
  'chas and dave',
  'sonny & cher',
  'sonny and cher',
  'captain & tennille',
  'captain and tennille',
  'loggins & messina',
  'loggins and messina',
  'ashford & simpson',
  'ashford and simpson',
  'seals & crofts',
  'seals and crofts',
  'boyce & hart',
  'boyce and hart',
  'crosby, stills, nash & young',
  'crosby stills nash & young',
  'crosby stills nash and young',
  'arms and sleepers',
  'arms & sleepers',
  'stars and rabbit',
  'stars & rabbit',
  'fish & chips',
  'fish and chips',
  'flight of the conchords',
  'king gizzard & the lizard wizard',
  'king gizzard and the lizard wizard',
  'bonnie & clyde',
  'bonnie and clyde',
  'belle and sebastian',
  'belle & sebastian',
]);

/**
 * Checks whether an artist name containing '&' or 'and' represents a single,
 * unitary band or artistic entity (e.g. "Above & Beyond", "Mumford & Sons", "Simon & Garfunkel"),
 * rather than multiple collaborating artists (e.g. "Ski Aggu & Sira", "Drake & 21 Savage").
 */
export function isSingleEntityArtist(artistName) {
  if (!artistName) return false;
  const clean = String(artistName).trim().toLowerCase();
  if (KNOWN_SINGLE_ENTITY_NAMES.has(clean)) return true;
  return SINGLE_ENTITY_AND_PATTERNS.some(pattern => pattern.test(clean));
}

/**
 * Splits an artist string into distinct collaborating artists when multiple performers
 * are present (e.g. "Ski Aggu & Sira" -> ["Ski Aggu", "Sira"]), while preserving
 * single-entity group names (e.g. "Above & Beyond" -> ["Above & Beyond"]).
 */
export function splitArtistNames(artistName) {
  if (!artistName) return [];
  const raw = String(artistName).trim();
  if (!raw) return [];

  if (isSingleEntityArtist(raw)) {
    return [raw];
  }

  // Collaboration delimiters:
  // e.g. " & ", " and ", " feat. ", " ft. ", " featuring ", " with ", " x ", " X ", " / ", " vs. ", " vs ", ", "
  const parts = raw
    .split(/\s+(?:feat\.?|ft\.?|featuring|with|x|vs\.?|\/)\s+|\s*,\s*|\s+(?:&|and)\s+/i)
    .map(p => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [raw];
}

export function extractAllAnswerCandidates(title, artist, options = {}) {
  if (!title || !artist) return null;

  // Thoroughly strip featured artists and parenthetical annotations from song title
  // e.g. "APT. (feat. Bruno Mars)" -> "APT."
  // or "APT. feat. Bruno Mars" -> "APT."
  const unescapedTitle = String(title)
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  const cleanTitle = unescapedTitle
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s+[^)\]]+[)\]]/gi, '')
    .replace(/\s*[([][^)\\]]*[)\\]]/g, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '')
    .trim();

  // Combined full song title (2 to 14 letters)
  // e.g. "Go" -> "GO" (2), "Your Love" -> "YOURLOVE" (8), "Blinding Lights" -> "BLINDINGLIGHTS" (14)
  const combinedTitle = toCrosswordAnswer(cleanTitle, { minLength: 2, maxLength: 14 });
  const titleCandidate = combinedTitle ? {
    answer: combinedTitle,
    clueType: 'Song title',
    clueText: `Iconic track title (${combinedTitle.length} letters)`
  } : null;

  // Split artist names so multiple collaborating performers are NEVER concatenated together.
  // e.g. "ROSÉ & Bruno Mars" -> ["ROSÉ", "Bruno Mars"] -> individual candidates "ROSE" (4) and "BRUNOMARS" (9)
  // whereas single-entity groups with '&' ("Above & Beyond", "Mumford & Sons") remain unitary
  // and expand '&' to 'AND' ("ABOVEANDBEYOND", "MUMFORDANDSONS").
  const artistNames = splitArtistNames(artist);
  const artistCandidates = [];

  for (let i = 0; i < artistNames.length; i++) {
    const name = artistNames[i];
    if (/^(unknown(\s+artist)?|various(\s+artists)?|soundtrack)$/i.test(name.trim())) {
      continue;
    }
    const answer = toCrosswordAnswer(name, { minLength: 2, maxLength: 14 });
    if (answer) {
      artistCandidates.push({
        answer,
        clueType: 'Artist name',
        clueText: artistNames.length > 1
          ? (i === 0 ? `Performer of this track (${answer.length} letters)` : `Co-performer of this track (${answer.length} letters)`)
          : `Celebrated performer of this track (${answer.length} letters)`,
        artistName: name,
        isCollaboration: artistNames.length > 1,
      });
    }
  }

  const primaryArtistCandidate = artistCandidates[0] || null;

  // Common stopwords to exclude from standalone single-word crossword answers
  const COMMON_STOPWORDS = new Set([
    'THE', 'AND', 'FOR', 'WITH', 'FROM', 'INTO', 'THAT', 'THIS', 'WHAT', 'WHEN',
    'WHERE', 'WHICH', 'YOUR', 'MINE', 'THEM', 'THEY', 'THEIR', 'SOME', 'HAVE',
    'JUST', 'LIKE', 'OVER', 'DOWN', 'UNDER', 'AGAIN'
  ]);

  // Single keywords from multi-word title (2 to 12 letters)
  // Provides rich length variety: 3-5 letters (short), 6-8 letters (medium), 9-12 letters (long)
  const normalizedWords = cleanTitle
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => toCrosswordAnswer(w, { minLength: 2, maxLength: 12 }))
    .filter(Boolean);

  const wordCandidates = [];
  let keywordCandidate = null;
  let shortKeywordCandidate = null;

  if (normalizedWords.length > 0) {
    const meaningfulWords = normalizedWords.filter(w => !COMMON_STOPWORDS.has(w));
    const candidatePool = meaningfulWords.length > 0 ? meaningfulWords : normalizedWords;

    for (const w of candidatePool) {
      wordCandidates.push({
        answer: w,
        clueType: 'Song title keyword',
        clueText: `Key word in this track title (${w.length} letters)`
      });
    }

    const sorted = [...candidatePool].sort((a, b) => b.length - a.length);
    if (sorted[0]) {
      keywordCandidate = {
        answer: sorted[0],
        clueType: 'Song title keyword',
        clueText: `Key word in this track title (${sorted[0].length} letters)`
      };
    }
    const shortWord = candidatePool.find(w => w.length >= 2 && w.length <= 5 && w !== sorted[0]);
    if (shortWord) {
      shortKeywordCandidate = {
        answer: shortWord,
        clueType: 'Song title keyword',
        clueText: `Key word in this track title (${shortWord.length} letters)`
      };
    }
  }

  // Anime franchise / series title candidates (2 to 14 letters)
  let animeCandidate = null;
  const animeWordCandidates = [];
  const animeTitle = typeof options === 'object' ? options?.animeTitle : null;

  if (animeTitle) {
    const unescapedAnime = String(animeTitle)
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');

    // Clean brackets, parentheses, and season tags
    const cleanAnime = unescapedAnime
      .replace(/\s*[([](?:TV|OVA|OAV|ONA|Movie|Special|Season\s*\d+|2nd Season|\d+(?:st|nd|rd|th)\s*Season)[)\]]/gi, '')
      .replace(/\s*[([]\s*[^)\]]*\s*[)\]]/g, '')
      .trim();

    // If title has a subtitle after colon or hyphen, try main franchise title first (e.g. "Naruto: Shippuuden" -> "Naruto")
    const mainTitlePart = cleanAnime.includes(':')
      ? cleanAnime.split(':')[0].trim()
      : (cleanAnime.includes(' - ') ? cleanAnime.split(' - ')[0].trim() : cleanAnime);

    const combinedMain = toCrosswordAnswer(mainTitlePart, { minLength: 2, maxLength: 14 });
    const combinedFull = toCrosswordAnswer(cleanAnime, { minLength: 2, maxLength: 14 });
    const chosenCombined = combinedMain || combinedFull;

    if (chosenCombined) {
      animeCandidate = {
        answer: chosenCombined,
        clueType: 'Anime title',
        clueText: `Anime series title (${chosenCombined.length} letters)`,
        animeTitle: cleanAnime,
      };
    }

    // Also extract individual meaningful words from anime title (e.g. "Mobile Suit Gundam" -> "GUNDAM")
    const animeWords = cleanAnime
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .map(w => toCrosswordAnswer(w, { minLength: 2, maxLength: 12 }))
      .filter(w => Boolean(w) && !COMMON_STOPWORDS.has(w));

    for (const w of animeWords) {
      animeWordCandidates.push({
        answer: w,
        clueType: 'Anime title',
        clueText: `Anime series keyword (${w.length} letters)`,
        animeTitle: cleanAnime,
      });
      if (!animeCandidate && w.length >= 3 && w.length <= 12) {
        animeCandidate = {
          answer: w,
          clueType: 'Anime title',
          clueText: `Anime series keyword (${w.length} letters)`,
          animeTitle: cleanAnime,
        };
      }
    }
  }

  return {
    title: titleCandidate,
    artist: primaryArtistCandidate,
    artistCandidates,
    keyword: keywordCandidate,
    shortKeyword: shortKeywordCandidate,
    wordCandidates,
    anime: animeCandidate,
    animeWordCandidates,
  };
}

export function extractAnswerKeyword(title, artist, options = {}) {
  const candidates = extractAllAnswerCandidates(title, artist, options);
  if (!candidates) return null;

  const preferred = typeof options === 'string' ? options : options?.preferredType;
  const allowArtist = options?.allowArtist !== false;
  const seenAnswers = options?.seenAnswers;
  const targetBucket = options?.targetLengthBucket; // 'short' (2-5), 'medium' (6-8), 'long' (9-14)
  const artistIndex = typeof options?.artistIndex === 'number' ? options.artistIndex : null;

  function getBestArtistCandidate() {
    const list = candidates.artistCandidates || [];
    if (list.length === 0) return candidates.artist;
    if (artistIndex !== null && list[artistIndex]) {
      return list[artistIndex];
    }
    if (seenAnswers) {
      const unseen = list.find(c => !seenAnswers.has(c.answer));
      if (unseen) return unseen;
    }
    return list[0] || candidates.artist;
  }

  const allAvailable = [];
  if (candidates.anime) allAvailable.push(candidates.anime);
  if (Array.isArray(candidates.animeWordCandidates)) {
    allAvailable.push(...candidates.animeWordCandidates);
  }
  if (candidates.title) allAvailable.push(candidates.title);
  if (candidates.keyword) allAvailable.push(candidates.keyword);
  if (candidates.shortKeyword) allAvailable.push(candidates.shortKeyword);
  if (Array.isArray(candidates.wordCandidates)) {
    allAvailable.push(...candidates.wordCandidates);
  }
  if (allowArtist && candidates.artistCandidates) {
    allAvailable.push(...candidates.artistCandidates);
  }

  // Deduplicate candidates by answer
  const uniqueAvailable = [];
  const seenCandidateAnswers = new Set();
  for (const c of allAvailable) {
    if (c && c.answer && !seenCandidateAnswers.has(c.answer)) {
      seenCandidateAnswers.add(c.answer);
      uniqueAvailable.push(c);
    }
  }

  // Helper to test if a candidate matches the requested length bucket
  function inLengthBucket(candidate, bucket) {
    if (!candidate || !candidate.answer) return false;
    const len = candidate.answer.length;
    if (bucket === 'short') return len >= 2 && len <= 5;
    if (bucket === 'medium') return len >= 6 && len <= 8;
    if (bucket === 'long') return len >= 9 && len <= 14;
    return true;
  }

  // If a specific target length bucket was requested, check if any eligible candidate matches it
  if (targetBucket) {
    const bucketMatches = uniqueAvailable.filter(c => (!seenAnswers || !seenAnswers.has(c.answer)) && inLengthBucket(c, targetBucket));
    if (bucketMatches.length > 0) {
      // If preferred type matches within bucket, take it
      if (preferred === 'anime') {
        const anim = bucketMatches.find(c => c.clueType === 'Anime title');
        if (anim) return anim;
      } else if (preferred === 'artist' && allowArtist) {
        const art = bucketMatches.find(c => c.clueType === 'Artist name');
        if (art) return art;
      } else if (preferred === 'title') {
        const ttl = bucketMatches.find(c => c.clueType === 'Song title');
        if (ttl) return ttl;
      } else if (preferred === 'keyword') {
        const kw = bucketMatches.find(c => c.clueType === 'Song title keyword');
        if (kw) return kw;
      }
      return bucketMatches[0];
    }
  }

  if (preferred === 'anime') {
    if (candidates.anime && (!seenAnswers || !seenAnswers.has(candidates.anime.answer))) {
      return candidates.anime;
    }
    if (Array.isArray(candidates.animeWordCandidates)) {
      const altWord = candidates.animeWordCandidates.find(c => !seenAnswers || !seenAnswers.has(c.answer));
      if (altWord) return altWord;
    }
  } else if (preferred === 'artist') {
    if (allowArtist) {
      const bestArtist = getBestArtistCandidate();
      if (bestArtist && (!seenAnswers || !seenAnswers.has(bestArtist.answer))) return bestArtist;
    }
  } else if (preferred === 'title' && candidates.title) {
    if (!seenAnswers || !seenAnswers.has(candidates.title.answer)) return candidates.title;
  } else if (preferred === 'keyword' && (candidates.keyword || candidates.shortKeyword)) {
    const kw = candidates.keyword && (!seenAnswers || !seenAnswers.has(candidates.keyword.answer))
      ? candidates.keyword
      : (candidates.shortKeyword && (!seenAnswers || !seenAnswers.has(candidates.shortKeyword.answer)) ? candidates.shortKeyword : null);
    if (kw) return kw;
  }

  // Fallback priority order:
  // If preferred was anime: try title -> artist -> keyword -> shortKeyword
  // If preferred was title: try artist -> keyword -> shortKeyword -> anime
  // If preferred was artist: try title -> keyword -> shortKeyword -> anime
  if (preferred === 'anime') {
    if (candidates.title && (!seenAnswers || !seenAnswers.has(candidates.title.answer))) {
      return candidates.title;
    }
    if (allowArtist) {
      const bestArtist = getBestArtistCandidate();
      if (bestArtist && (!seenAnswers || !seenAnswers.has(bestArtist.answer))) return bestArtist;
    }
    if (candidates.keyword && (!seenAnswers || !seenAnswers.has(candidates.keyword.answer))) {
      return candidates.keyword;
    }
    if (candidates.shortKeyword && (!seenAnswers || !seenAnswers.has(candidates.shortKeyword.answer))) {
      return candidates.shortKeyword;
    }
  } else {
    if (candidates.title && (!seenAnswers || !seenAnswers.has(candidates.title.answer))) {
      return candidates.title;
    }
    if (allowArtist) {
      const bestArtist = getBestArtistCandidate();
      if (bestArtist && (!seenAnswers || !seenAnswers.has(bestArtist.answer))) {
        return bestArtist;
      }
    }
    if (candidates.keyword && (!seenAnswers || !seenAnswers.has(candidates.keyword.answer))) {
      return candidates.keyword;
    }
    if (candidates.shortKeyword && (!seenAnswers || !seenAnswers.has(candidates.shortKeyword.answer))) {
      return candidates.shortKeyword;
    }
    if (candidates.anime && (!seenAnswers || !seenAnswers.has(candidates.anime.answer))) {
      return candidates.anime;
    }
    if (Array.isArray(candidates.animeWordCandidates)) {
      const altWord = candidates.animeWordCandidates.find(c => !seenAnswers || !seenAnswers.has(c.answer));
      if (altWord) return altWord;
    }
  }

  if (candidates.title) return candidates.title;
  if (allowArtist) return getBestArtistCandidate();
  if (candidates.keyword) return candidates.keyword;
  if (candidates.anime) return candidates.anime;
  return null;
}

export {
  formatCrosswordClue,
  sanitizeClue,
  containsAnswerLeak,
  cleanClueTitle
} from './clueGenerator.js';

