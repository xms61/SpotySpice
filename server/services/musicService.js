import crypto from 'crypto';
import { extractAnswerKeyword, splitArtistNames, formatCrosswordClue } from '../../shared/musicKeywords.js';
import { blacklistMatchesTrack, canonicalArtistKey, canonicalTrackKey, toCrosswordAnswer } from '../../shared/musicIdentity.js';
import { shuffleArray } from '../../shared/shuffle.js';
import { deezerMusicProvider } from './deezerMusicProvider.js';
import { itunesMusicProvider } from './itunesMusicProvider.js';
import { buildQueryPlan, extractAnimeKeyphrase } from './queryBuilder.js';
import { sqliteCatalog } from '../db/sqliteCatalog.js';
import { animeCatalog } from '../db/animeCatalog.js';
import { resolveAnimeCoverImages } from './animeImageService.js';
import { batchResolvePreviews } from './previewResolver.js';
import { logger } from '../logger.js';

let musicProvider = deezerMusicProvider;

export { extractAnswerKeyword, splitArtistNames };

export function setMusicProviderForTesting(provider) {
  musicProvider = provider || deezerMusicProvider;
}

/**
 * Checks if a genre or query prompt specifically targets authentic Anime OP/ED themes.
 */
export function isAnimeTarget(genre = '', prompt = '') {
  const combined = `${genre || ''} ${prompt || ''}`.toLowerCase();
  return /\b(anime|animes|anime opening|anime openings|anime ending|anime endings|anime ost|anime themes?)\b/i.test(combined);
}

/**
 * Resolves whether an anime query targets Openings ('OP'), Endings ('ED'), or both (null).
 */
export function getAnimeThemeType(genre = '', prompt = '') {
  const combined = `${genre || ''} ${prompt || ''}`.toLowerCase();
  const hasOp = /\b(openings?|op)\b/i.test(combined);
  const hasEd = /\b(endings?|ed)\b/i.test(combined);
  if (hasOp && !hasEd) return 'OP';
  if (hasEd && !hasOp) return 'ED';
  return null;
}

/**
 * Language Policy: Enforces English for Western mainstream categories,
 * with explicit exemption for non-English cultural genres and prompts
 * (Japanese/Anime, City Pop, K-Pop, Latin, Reggaeton, etc.).
 */
export function isLanguagePermitted(track, genre = 'all', prompt = '') {
  // Anime OP/ED tracks from the dedicated anime catalog are always permitted
  if (track?.isAnimeOped) {
    return true;
  }

  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  const title = String(track?.title || '');
  const artist = String(track?.artist || '');

  // Reject foreign animated soundtrack dubs and localized karaoke/sing-along tracks across all genres
  // e.g. "Soda Pop (version française)", "How Far I'll Go (Spanish Version)", "Sing-Along"
  const foreignDubMarkers = /\b(?:version\s+française|french\s+version|spanish\s+version|versión\b|portuguese\s+version|german\s+version|italian\s+version|tagalog\s+version|sing-along|karaoke)\b/i;
  if (foreignDubMarkers.test(title)) {
    return false;
  }

  // Cultural and international exemptions
  const internationalPatterns = /\b(anime|kpop|k-pop|korean|japanese|japan|city\s*pop|j-pop|jpop|latin|spanish|french|german|brazil|bossanova|reggaeton|cumbia|salsa|flamenco|afrobeats|bollywood|mandopop|cantopop)\b/i;
  if (internationalPatterns.test(context)) {
    return true;
  }

  // Reject tracks categorized under explicit foreign language genres unless theme permits
  const trackGenre = String(track?.selection?.genre || track?.genre || '').toLowerCase();
  const foreignGenres = /\b(pop\s+latino|música\s+mexicana|urbano\s+latino|latin|música\s+tropical|mpb|sertanejo|french\s+pop|german\s+pop|deutschrap|chanson|russian|arabic|punjabi|bollywood|c-pop|cantopop|mandopop)\b/i;
  if (foreignGenres.test(trackGenre)) {
    return false;
  }

  // Reject non-Latin alphabets (Cyrillic, Greek, Arabic, Kanji, Hiragana, Hangul, Thai, etc.)
  // \u0020-\u024F encompasses standard printable characters and Latin Extended (common Western European accents)
  if (/[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(title) || /[^\u0020-\u024F\s\d.,!?'"&()/-]/u.test(artist)) {
    return false;
  }

  // Reject tracks containing common non-English linguistic markers (Spanish/Portuguese/French/German/Italian/Dutch stopwords)
  const foreignMarkers = /\b(despacito|bailando|danza|gasolina|fonsi|amor|vida|corazón|fiesta|feliz|navidad|noche|como|mais|pra|você|sen|ben|bir|del|los|las|por|para|una|uno|dans|avec|pour|des|une|und|nicht|ist|dass|les|le|la|el|aux?|sur|sans|nous|vous|sont|mon|ma|mes|ton|ta|tes|son|sa|ses|qui|que|quoi|dont|où|mais|ou|et|donc|der|die|das|dem|den|ein|eine|einem|einen|einer|eines|mit|auf|für|von|zu|aus|durch|nach|bei|seit|con|sin|sobre|gli|della|delle|dello|dei|degli|nel|nella|je|tu|il|elle|ils|elles|un'|non|più|tutto|tutti|tutta|se|yo|ella|ellos|ellas|pero|más|muy|está|están|hacer|tiempo|año|años)\b/i;
  if (foreignMarkers.test(title) || foreignMarkers.test(artist)) {
    return false;
  }

  // Reject classical/orchestral movements and choir works from mainstream puzzles unless classical requested
  const isClassicalContext = /\b(classical|baroque|orchestra|symphon|opera|choir|choral)\b/i.test(context);
  if (!isClassicalContext) {
    const classicalMarkers = /\b(symphonie|symphony|concerto|sonata|opus|\bop\.\s*\d+|bwv\s*\d+|larghetto|allegro|adagio|andante|presto|philharmonic|orchester|orchestra|chœur|chor\b)\b/i;
    if (classicalMarkers.test(title) || classicalMarkers.test(artist)) {
      return false;
    }
  }

  // Reject nursery rhymes and children's music from general puzzles unless requested
  const isKidsContext = /\b(kids?|children|nursery|lullab)\b/i.test(context);
  if (!isKidsContext) {
    const kidsMarkers = /\b(nursery\s+rhymes?|lullaby|cocomelon|baby\s+songs?|toddler\s+songs?|kids\s+songs?|chansons\s+pour\s+enfants)\b/i;
    if (kidsMarkers.test(title) || kidsMarkers.test(artist)) {
      return false;
    }
  }

  return true;
}

/**
 * Detects whether a candidate track is an unintended homonym or keyword collision
 * for cultural/regional or compound genre themes.
 */
export function isThematicallyPermitted(track, genre = 'all', prompt = '') {
  const context = `${typeof genre === 'string' ? genre : ''} ${typeof prompt === 'string' ? prompt : ''}`.toLowerCase();
  const artist = String(track?.artist || '').trim();
  const title = String(track?.title || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const candidateGenre = String(track?.selection?.genre || track?.genre || '').toLowerCase();

  // Cultural keyword homonym check
  // E.g. prompt is "Japanese City Pop" or "French House" or "German Krautrock"
  const culturalMatch = context.match(/\b(japanese|korean|french|german|italian|spanish|brazilian|irish|british|african|russian|chinese)\b/i);
  if (culturalMatch) {
    const culture = culturalMatch[1].toLowerCase();

    // Reject Western acts where the artist name is literally "The [Culture] [Noun]" or "[Culture] [Western Name]"
    // e.g. "The Japanese House", "The Japanese Popstars", "French Montana", "German Brigante"
    // Also reject when appearing in artist or title (e.g. feat. French Montana)
    const westernHomonymPattern = new RegExp(`(^|\\bthe\\s+|feat\\.?\\s+|ft\\.?\\s+|with\\s+|\\()${culture}\\s+(house|popstars|montana|brigante|band|project|connection|experience|breakfast|brothers|boys|girls)\\b`, 'i');
    if (westernHomonymPattern.test(artist) || westernHomonymPattern.test(title)) {
      return false;
    }

    // Reject novelty track titles like "[Culture] Boy", "[Culture] Girl", "[Culture] Porn"
    // e.g. Aneka - "Japanese Boy", Doctor Flake - "Japanese Porn"
    const westernNoveltyTitlePattern = new RegExp(`^${culture}\\s+(boy|girl|porn|breakfast|girl\\s+remix)\\b|\\b${culture}\\s+(boy|girl|porn)\\b`, 'i');
    if (westernNoveltyTitlePattern.test(title)) {
      return false;
    }
  }

  // Compound genre homonym check
  // E.g. "City Pop": reject tracks where "Pop" was in the artist name and "City" in title (like Iggy Pop - Kill City)
  if (/\bcity\s*pop\b/i.test(context)) {
    if (/\bpop\b/i.test(lowerArtist) && !/\b(japanese|city|j-pop)\b/i.test(lowerArtist)) {
      if (/\b(city|kill city|motor city|sin city|inner city)\b/i.test(lowerTitle)) {
        return false;
      }
    }
  }

  // K-POP THEMATIC & STOREFRONT GUARDRAILS
  if (/\b(kpop|k-pop)\b/i.test(context)) {
    // 1. Reject tracks simply named after the search query ("K-POP", "NEW GEN", "4TH GEN")
    if (/^(k-?pop|new\s+gen|4th\s+gen|5th\s+gen)$/i.test(lowerTitle)) {
      return false;
    }

    // 2. Reject Western pop/country/rock/indie acts matched on fuzzy token collisions ("gen", "pop", "korean")
    const westernActsInKpop = /\b(m4rkim|steven\s+wilson|carrie\s+underwood|destiny'?s\s+child|billy\s+idol|hozier|maroon\s+5|selena\s+gomez|dua\s+lipa|adele|kid\s+cudi|foster\s+the\s+people|becky\s+g|ton\s+koopman|nelis\s+leeman|michael\s+jackson|oasis|chappell\s+roan|billie\s+eilish|travis\s+scott|the\s+weeknd|lacrim|410|snoop\s+dogg|eminem|post\s+malone|drake)\b/i;
    if (westernActsInKpop.test(lowerArtist)) {
      return false;
    }

    // 3. iTunes Genre Verification: Disallow non-Asian genres on iTunes unless Korean Hangul text is present
    if (track?.provider === 'itunes' || track?.selection?.source === 'itunes') {
      const itunesGenre = (track?.selection?.genre || track?.genre || '').toLowerCase();
      const nonKpopGenres = ['country', 'rock', 'alternative', 'metal', 'r&b/soul', 'blues', 'punk', 'latin'];
      if (nonKpopGenres.includes(itunesGenre)) {
        const hasHangul = /[\uac00-\ud7af\u1100-\u11ff]/.test(`${artist} ${title}`);
        if (!hasHangul) {
          return false;
        }
      }
    }
  }

  // GAMING THEMATIC GUARDRAILS
  if (/\bgaming\b/i.test(context) || /\bvideo\s+game\b/i.test(context)) {
    if (track?.provider === 'itunes' || track?.selection?.source === 'itunes') {
      const itunesGenre = (track?.selection?.genre || track?.genre || '').toLowerCase();
      if (!['soundtrack', 'video game', 'anime', 'instrumental'].includes(itunesGenre)) {
        const hasGamingAffiliation = /\b(video\s*game|game|soundtrack|ost|theme|zelda|mario|sonic|pokemon|final\s+fantasy|halo|cyberpunk|skyrim|genshin|undertale|megalovania|toby\s+fox)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`);
        if (!hasGamingAffiliation) {
          return false;
        }
      }
    }
  }

  // CINEMATIC THEMATIC GUARDRAILS
  if (/\b(cinematic|movie\s+ost|film\s+score)\b/i.test(context)) {
    if (/^(the\s+)?movies?$/i.test(lowerTitle) && !/\b(soundtrack|score|theme|original|motion\s+picture)\b/i.test(`${track?.album || ''} ${candidateGenre}`)) {
      return false;
    }
  }

  // EDM THEMATIC GUARDRAILS
  if (/\b(edm|electro|dance)\b/i.test(context)) {
    if (/^(édith\s+piaf|edith\s+piaf|yo\s+la\s+tengo)\b/i.test(lowerArtist)) {
      return false;
    }
  }

  // ANIME THEMATIC & STEM COLLISION GUARDRAILS
  if (/\banime\b/i.test(context)) {
    // 1. Block Deezer Artist ID 147485 (Italian hardcore techno producer "AniMe" / "Anime")
    if (String(track?.providerArtistId) === '147485' || String(track?.artistId) === '147485') {
      return false;
    }
    if (Array.isArray(track?.contributorArtistIds) && track.contributorArtistIds.includes('147485')) {
      return false;
    }

    // 2. Reject if artist or any collaborator is "Anime" or "DJ AniMe"
    const artists = splitArtistNames(artist).map(a => a.toLowerCase().trim());
    if (artists.some(a => /^(dj\s+)?anime$/i.test(a))) {
      return false;
    }
    if (/^(dj\s+)?anime$/i.test(lowerArtist) || /^anime$/i.test(lowerTitle)) {
      return false;
    }
    if (toCrosswordAnswer(artist) === 'ANIME') {
      return false;
    }

    // 3. Hardcore techno DJ "AniMe" anthem tracks and label affiliations
    if (/\b(official\s+dominator|ground\s+zero\s+\d+|toxicator\s+\d+|hardcore|anthem|masters\s+of\s+hardcore|traxtorm|thunderdome|aftermath|break\s+your\s+mind)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`)) {
      return false;
    }

    // 3. Deezer prefix/stem collisions on "anim*" (Animal, Animals, Animais, Animosity, Animate, Animatrix, Anima)
    // When track contains non-anime Latin/English stems and lacks Japanese/Anime context
    const hasJapaneseAnimeAffiliation =
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(track?.title || '') ||
      /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(track?.artist || '') ||
      /\b(ost|opening|ending|theme|tv\s*size|soundtrack|version\s*tv|j-rock|j-pop|frieren|naruto|kenshin|bleach|one\s*piece|dragon\s*ball|attack\s*on\s*titan|shingeki|jujutsu|demon\s*slayer|kimetsu|bocchi|evangelion|dandadan)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`);

    if (!hasJapaneseAnimeAffiliation) {
      if (/\b(animals?|animais|animosity|animate|animated|animation|animatrix|anima)\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
        return false;
      }
    }

    // 4. Storefront chart leakage: Reject non-anime genres (e.g. K-Pop charting on Apple Music JP)
    if (candidateGenre && /\b(k-?pop|korean\s+hip-?hop|country|latin)\b/i.test(candidateGenre)) {
      return false;
    }

    // 5. Western animation studio and soundtrack leakage (Disney, Pixar, DreamWorks, etc.)
    if (/\b(disney|pixar|dreamworks|illumination|moana|frozen|encanto|lion\s*king|aladdin|beauty\s+and\s+the\s+beast|little\s+mermaid|tangled|coco|zootopia|shrek|toy\s*story)\b/i.test(`${lowerTitle} ${lowerArtist} ${track?.album || ''}`)) {
      return false;
    }

    // 6. Generic novelty titles matching literally "Anime Theme" or "Anime Song"
    if (/^anime\s+(theme|song|ost|music)$/i.test(lowerTitle)) {
      return false;
    }

    // 7. Non-Japanese television cast, hip-hop, or Latin pop leakage without anime affiliation
    if (!hasJapaneseAnimeAffiliation) {
      if (/\b(empire\s+cast|glee\s+cast|nashville\s+cast|dizzy\s+dros|sandoval)\b/i.test(lowerArtist)) {
        return false;
      }
      if (/\b(sabía|sabia)\b/i.test(lowerTitle)) {
        return false;
      }
    }
  }

  // GAMING / VIDEO GAME THEMATIC GUARDRAILS
  if (/\b(gaming|video\s*games?)\b/i.test(context)) {
    if (/^(the\s+)?game$/i.test(lowerArtist)) {
      return false;
    }
    if (/\bgamin(e|s)?\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
      return false;
    }
  }

  // POP PUNK / PUNK GUARDRAILS
  if (/\b(pop-?punk|punk\s+rock)\b/i.test(context)) {
    if (/\bdaft\s+punk\b/i.test(lowerArtist)) {
      return false;
    }
  }

  // EDM / ELECTRONIC / DANCE GUARDRAILS
  if (/\b(edm|electro|dance)\b/i.test(context)) {
    if (/\bdance\s+gavin\s+dance\b/i.test(lowerArtist) || /\bdance\s+hall\s+crashers\b/i.test(lowerArtist)) {
      return false;
    }
    if (/\bprivate\s+dancer\b/i.test(lowerTitle)) {
      return false;
    }
  }

  // LATIN GUARDRAILS
  if (/\blatin\b/i.test(context)) {
    if (/\blatin\s+quarter\b/i.test(lowerArtist) || /\blatin\s+alliance\b/i.test(lowerArtist)) {
      return false;
    }
  }

  return true;
}

/**
 * Rejects low-quality imitation tracks, workout mixes, generic cover/tribute artists,
 * and sped-up/slowed-down audio modifications.
 */
export function isAuthenticTrack(track) {
  const artist = String(track?.artist || track?.display_name || '').trim();
  const title = String(track?.title || track?.display_title || '').trim();
  const album = String(track?.album || track?.album_name || track?.collectionName || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerAlbum = album.toLowerCase();

  // 1. Generic compilation/workout/soundalike artists and unofficial YouTube/fan cover artists
  const fakeArtistPatterns = /\b(workout\s+(music|dj|mix|party|electronica|hits|mafia)|power\s+music\s+workout|fitness\s+workout|running\s+songs|gym\s+music|8-bit\s+arcade|tribute\s+(band|crew|artists?)|cover\s+band|karaoke\s+band|soundalike|classic\s+rock|rock\s+classics|\d{4}\s+rock\s+classics|hits\s+band|various\s+artists|sounds?\s+dj|dj\s+remix\s+crew|music\s*box\s*(ensemble|lullaby|collection|band)|lullaby\s*(baby|ensemble|band)|anime\s*(keys|piano|relax|chill|cafe|project|ensemble|orchestra|tribute|band|music|soundtrack)|peaceful\s*(anime|piano|music)|ultra\s*beats|relaxing\s*piano|pellek|little\s*v\.?|shironeko|jonathan\s*young|natewantstobattle|tsuko\s*g\.?|richaadeb|rainych|amalee|cao|fonzi\s*m)\b/i;
  if (fakeArtistPatterns.test(lowerArtist)) {
    return false;
  }

  // 2. Audio modifications, covers, karaoke, and utility releases in titles
  const audioModPatterns = /\b(?:workout\s+mix|\d+\s*bpm|slowed(?:\s*\+?\s*reverb)?|sped\s+up|speed\s+up|nightcore|music\s*box|musicbox|lullaby|bgm\s+cover|fan\s*cover|metal\s*cover|rock\s*cover|guitar\s*cover|guitar\s+version|violin\s*cover|piano\s*cover|piano\s+version|acoustic\s+version|harp\s+version|synth\s*cover|lo-?fi\s*remix|phonk\s*remix|tribute\s+version|tribute\s+to|8-bit|computer\s+game\s+version|instrumental(?:\s+version)?|originally\s+performed\s+by|in\s+the\s+style\s+of|made\s+famous\s+by|karaoke(?:\s+version)?|backing\s+track|sans\s+paroles|no\s*vocals?|track\s*-\s*no\s*vocal|guide\s*vocal|minus\s*one|bass\s*boost(?:ed)?|drum\s*loop|waiting\s*loop|synth\s*loop)\b|[([](?:piano|acoustic|instrumental|orchestral|violin|cello|harp|flute|guitar|music\s*box|karaoke|backing\s*track)[)\]]/i;
  if (audioModPatterns.test(lowerTitle)) {
    return false;
  }

  // 3. Covers or tribute compilations in album title
  if (lowerAlbum) {
    const fakeAlbumPatterns = /\b(?:cover\s+music\s+selection|cover\s+versions?|tribute\s+album|karaoke|music\s*box|lullaby|8-?bit|workout\s+music|fitness\s+beats)\b/i;
    if (fakeAlbumPatterns.test(lowerAlbum)) {
      return false;
    }
  }

  return true;
}

/**
 * Distinguishes authentic anime openings, endings, insert songs, and official anime soundtracks
 * from generic Japanese pop/rock or foreign homonym collisions.
 */
export function isAnimeTrack(track) {
  if (!track) return false;
  if (!isAuthenticTrack(track)) return false;

  const title = String(track.title || track.display_title || '').trim();
  const artist = String(track.artist || track.display_name || '').trim();
  const album = String(track.album || track.album_name || '').trim();
  const lowerTitle = title.toLowerCase();
  const lowerArtist = artist.toLowerCase();
  const lowerAlbum = album.toLowerCase();
  const combined = `${lowerTitle} ${lowerAlbum} ${lowerArtist}`;

  // 1. Strict homonym, foreign language, and Latin collision rejection
  if (/^(?:dj\s+)?anime$/i.test(lowerArtist) || /^anime$/i.test(lowerTitle)) return false;
  if (/^(?:\u00e9dith\s+piaf|ben\s+mazu\u00e9|les\s+goldies)\b/i.test(lowerArtist)) return false;
  if (/\b(?:le\s+coeur\s+nous\s+anime|dessin\s+anim\u00e9)\b/i.test(lowerTitle)) return false;

  // 2. Reject Western pop/rap acts with accidental "anime" stem or collision
  if (/lisa/i.test(lowerArtist)) {
    if (/\b(?:rockstar|lalisa|sa-wa-di-ka|sawadika|money|moonlit|rapunzel|kiss\s*me|new\s*woman)\b/i.test(lowerTitle)) return false;
    if (/megan\s*thee\s*stallion|rosal[ií]a/i.test(lowerTitle)) return false;
  }
  if (/eve/i.test(lowerArtist) && /\b(?:blow\s+ya\s+mind|who'?s\s+that\s+girl|ruff\s+ryders|gangsta\s+lovin)\b/i.test(lowerTitle)) return false;

  // 3. Reject non-anime Latin/English stems (animal, animals, animosity, etc.)
  if (/\b(?:animals?|animais|animosity|animate|animated|animation|animatrix|anima)\b/i.test(`${lowerArtist} ${lowerTitle}`)) {
    if (!/(?:ost|opening|ending|theme|soundtrack|naruto|bleach|one\s*piece|attack\s*on\s*titan)/i.test(combined)) {
      return false;
    }
  }

  // 4. Must have verified anime opening/ending/soundtrack credentials:
  // a) Explicit English anime markers
  const animeEnglishMarkers = /\b(?:tv\s*anime|anime\s*(?:version|ver|ed|op|best|shibari)|tv\s*size|tv\s*version|tv\s*animation|anisong|gekiban)\b/i;
  if (animeEnglishMarkers.test(combined)) return true;

  // b) Generic OST / Opening Theme markers require connection to anime or Japanese production
  const genericThemeMarkers = /\b(?:opening\s*theme|ending\s*theme|theme\s*song|original\s*soundtrack|\bost\b)\b/i;
  if (genericThemeMarkers.test(combined)) {
    // Reject known Western indie/jazz/live score collisions
    if (/^(?:alex\s+g|bouke|jan\s+savitt|krzysztof\s+komeda)\b/i.test(lowerArtist)) return false;
    if (/quaker\s+city\s+jazz|see\s+see\s+rider|pink\s+opaque|opening\s+tomorrow/i.test(combined)) return false;
    if (isJapaneseTrack(track) || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(combined) || /\b(?:anime|manga|tokyo|japan|animation|studio\s*ghibli|ghibli|totoro)\b/i.test(combined)) {
      return true;
    }
  }

  // c) Explicit Japanese kanji/kana anime markers
  const animeJpMarkers = /(?:\u30a2\u30cb\u30e1|\u4e3b\u984c\u6b4c|\u30aa\u30fc\u30d7\u30cb\u30f3\u30b0|\u30a8\u30f3\u30c7\u30a3\u30f3\u30b0|\u5287\u4e2d\u6b4c|\u30b5\u30f3\u30c8\u30e9)/;
  if (animeJpMarkers.test(combined)) return true;

  // d) Explicit anime franchise in title or album
  const animeFranchises = /\b(?:naruto|bleach|one\s*piece|attack\s*on\s*titan|shingeki|demon\s*slayer|kimetsu|jujutsu|evangelion|death\s*note|dragon\s*ball|daima|my\s*hero\s*academia|boku\s*no\s*hero|fullmetal|sword\s*art\s*online|sao|tokyo\s*ghoul|cowboy\s*bebop|frieren|bocchi|chainsaw\s*man|dandadan|oshi\s*no\s*ko|sailor\s*moon|inuyasha|hunter\s*x\s*hunter|haikyuu|spy\s*x\s*family|ghibli|totoro|spirited\s*away|howl'?s\s*moving\s*castle|mononoke|your\s*name|kimi\s*no\s*na\s*wa|suzume|weathering\s*with\s*you|akira|specialz|kaikai\s*kitan|gurenge|zankyosanka|unravel|silhouette|blue\s*bird|colors|go!!!|fairy\s*tail|sakamoto\s*days)\b/i;
  if (animeFranchises.test(combined)) return true;

  // e) Iconic anisong artist performing an authentic anime release
  const anisongSpecialists = /^(?:flow|linked\s*horizon|yoko\s*takahashi|burnout\s*syndromes|claris|aimer|radwimps|ikimonogakari)$/i;
  if (anisongSpecialists.test(lowerArtist)) {
    return true;
  }
  if (lowerArtist === 'lisa') {
    const jpLisaRepertoire = /\b(?:gurenge|homura|crossing\s*field|oath\s*sign|catch\s*the\s*moment|adamas|unlasting|shirushi|rising\s*hope|best\s*day|demon\s*slayer|sword\s*art|sao|fate)\b/i;
    if (jpLisaRepertoire.test(lowerTitle) || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(`${lowerTitle} ${lowerAlbum}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifies that a candidate track represents authentic Japanese music
 * while rejecting western homonyms and foreign collisions.
 */
export function isJapaneseTrack(track) {
  if (!track) return false;
  if (!isAuthenticTrack(track)) return false;

  const title = String(track.title || track.display_title || '').trim();
  const artist = String(track.artist || track.display_name || '').trim();
  const lowerArtist = artist.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Reject Western homonyms and novelty acts
  if (/^(?:the\s+)?japanese\s+(?:house|popstars|breakfast|brothers|band)\b/i.test(lowerArtist)) return false;
  if (/\b(?:the\s+japanese\s+house|japanese\s+boy|japanese\s+porn)\b/i.test(`${lowerArtist} ${lowerTitle}`)) return false;

  // Language must be Japanese ('ja') or have Japanese characters or belong to recognized Japanese artist roster
  if (track.language === 'ja') return true;
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(`${title} ${artist}`)) return true;

  const japaneseArtists = /\b(?:tatsuro\s*yamashita|miki\s*matsubara|mariya\s*takeuchi|anri|taeko\s*onuki|junko\s*ohashi|toshiki\s*kadomatsu|takako\s*mamiya|tomoko\s*aran|meiko\s*nakahara|minako\s*yoshida|hiroshi\s*satoh|one\s*ok\s*rock|radwimps|king\s*gnu|kenshi\s*yonezu|official\s*hige\s*dandism|yoasobi|aimer|flow|lisa)\b/i;
  return japaneseArtists.test(lowerArtist);
}

/**
 * Detects whether a candidate track's release year falls within the requested yearRange,
 * accounting for digital remaster and reissue vintage tags.
 */
export function isTemporalPermitted(track, yearRange) {
  if (!yearRange || (yearRange.start === undefined && yearRange.end === undefined)) {
    return true;
  }
  const dateStr = track?.releaseDate || track?.selection?.releaseDate || track?.release_date || '';
  let year = track?.release_year ? Number(track.release_year) : null;
  if (!year && dateStr) {
    const match = String(dateStr).match(/\b(\d{4})\b/);
    if (match) {
      year = parseInt(match[1], 10);
    }
  }

  // Universal Remaster / Reissue Historical Vintage Detection
  const titleAndAlbum = `${track?.title || ''} ${track?.album || ''}`;
  const vintageMatch =
    titleAndAlbum.match(/\b(19\d{2}|20[0-1]\d)\b.*?\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition)\b/i) ||
    titleAndAlbum.match(/\b(?:remaster|re-?mastered|anniversary|deluxe|live|edition).*?\b(19\d{2}|20[0-1]\d)\b/i);

  if (vintageMatch) {
    const vintageYear = parseInt(vintageMatch[1], 10);
    if (!isNaN(vintageYear)) {
      year = vintageYear;
    }
  }

  // If user requested contemporary era (e.g. 2020-2026 or 2024-2026):
  // Any track explicitly tagged as a legacy remaster/reissue is not a contemporary original release
  if (yearRange.start !== undefined && yearRange.start >= 2020) {
    if (/\b(?:remaster|re-?mastered|anniversary\s+edition|deluxe\s+edition)\b/i.test(titleAndAlbum)) {
      return false;
    }
  }

  // If still no year, inspect title and album for standalone 4-digit year or 2-digit apostrophe year
  if (year === null) {
    const standaloneMatch = titleAndAlbum.match(/\b(19\d{2}|20[0-2]\d)\b/);
    if (standaloneMatch) {
      year = parseInt(standaloneMatch[1], 10);
    }
  }

  // If yearRange is active and no release year can be established, reject candidate
  if (year === null || isNaN(year)) {
    return false;
  }

  if (yearRange.start !== undefined && year < yearRange.start) {
    return false;
  }
  if (yearRange.end !== undefined && year > yearRange.end) {
    return false;
  }

  // Synchronize track release year and normalized release date
  track.releaseYear = year;
  track.releaseDate = `${year}-01-01`;

  return true;
}

const PREFERRED_CLUE_ROTATION = ['title', 'artist', 'title', 'artist', 'keyword'];

/**
 * Selects playable, distinct tracks combining Deezer & iTunes with
 * deterministic seed sorting and variety rejection sampling.
 */
export async function getRandomSongPool({
  genre = 'all',
  minFans = 250000,
  count = 25,
  blacklist = [],
  recentIds = [],
  prompt = '',
  artist = '',
  album = '',
  decade = '',
  popularity,
  seed,
} = {}) {
  const queryPlan = buildQueryPlan({
    genre,
    minFans,
    prompt,
    artist,
    album,
    decade,
    popularity,
  });

  logger.info('query', `Plan: genre="${queryPlan.genre}" searches=${JSON.stringify(queryPlan.deezerSearches)} offset=${queryPlan.randomOffset}`);

  const recentFrequency = new Map();
  const allRecentList = Array.isArray(recentIds) ? recentIds : [];
  for (const item of allRecentList) {
    if (!item) continue;
    const key = String(item);
    recentFrequency.set(key, (recentFrequency.get(key) || 0) + 1);
  }

  function getTrackRecentCount(track) {
    const providerTrackId = String(track.providerTrackId);
    const artistKey = canonicalArtistKey(track.artist);
    const keys = [
      String(track.id),
      providerTrackId,
      `deezer:${providerTrackId}`,
      `itunes:${providerTrackId}`,
      `hit-${providerTrackId}`,
    ];
    let playCount = 0;
    for (const k of keys) {
      if (recentFrequency.has(k)) {
        playCount = Math.max(playCount, recentFrequency.get(k));
      }
    }
    // Also penalize repeated artists from recent games to boost artist diversity
    if (recentFrequency.has(artistKey) || recentFrequency.has(`artist:${artistKey}`)) {
      const artCount = recentFrequency.get(artistKey) || recentFrequency.get(`artist:${artistKey}`) || 1;
      playCount = Math.max(playCount, artCount);
    }
    return playCount;
  }

  const seenTracks = new Set();
  const seenArtists = new Set();
  const seenTitles = new Set();
  const seenAnswers = new Set();
  const limit = Math.min(250, Math.max(120, count * 10));

  // 1. Candidate harvesting across providers
  const candidateTasks = [];
  const isAnimeTheme = isAnimeTarget(queryPlan.genre, prompt);
  const animeKeyphrase = queryPlan.targetAnimeKeyphrase || extractAnimeKeyphrase(prompt, queryPlan.genre);
  const isTargetingAnimeKeyphrase = Boolean(isAnimeTheme && animeKeyphrase);

  // Clue & Answer Discipline: Prevent prompt target keyphrases from appearing as grid solutions
  if (queryPlan.artist) {
    queryPlan.artist.split(/[^a-zA-Z0-9]+/).forEach(token => {
      if (token.length >= 3) seenAnswers.add(token.toUpperCase());
    });
  }
  if (isTargetingAnimeKeyphrase && animeKeyphrase) {
    animeKeyphrase.split(/[^a-zA-Z0-9]+/).forEach(token => {
      if (token.length >= 3) seenAnswers.add(token.toUpperCase());
    });
  }

  if (isAnimeTheme) {
    // Dedicated Anime OP/ED catalog isolated from standard music providers
    const themeType = getAnimeThemeType(queryPlan.genre, prompt);
    try {
      const cleanAnimeSearch = animeKeyphrase || (prompt && !/^(anime|anime openings?|anime endings?|anime themes?|anime ost)$/i.test(prompt.trim()) ? prompt : null);
      const animeCandidates = animeCatalog.getRandomAnimeTracks({
        count: limit,
        yearRange: queryPlan.yearRange,
        type: themeType,
        search: cleanAnimeSearch,
        requireSamples: true,
      });
      if (animeCandidates && animeCandidates.length > 0) {
        candidateTasks.push(Promise.resolve(animeCandidates));
      }
    } catch (err) {
      logger.warn('music_service', `Anime catalog candidate harvest failed: ${err.message}`);
    }
  } else {
    candidateTasks.push(
      musicProvider.getCandidateTracks({
        genre: queryPlan.genre,
        minFans: queryPlan.minFans,
        maxFans: queryPlan.maxFans,
        minRank: queryPlan.minRank,
        maxRank: queryPlan.maxRank,
        searches: queryPlan.deezerSearches,
        offset: queryPlan.randomOffset,
        popularity: queryPlan.popularity,
        limit,
      })
    );

    // If using live default provider (not a unit test mock), fetch iTunes candidates too
    if (musicProvider === deezerMusicProvider && queryPlan.itunesSearches.length > 0) {
      for (const term of queryPlan.itunesSearches.slice(0, 4)) {
        candidateTasks.push(
          itunesMusicProvider.getCandidateTracks({ query: term, limit: 100 })
            .catch(err => {
              console.warn('[MusicService] iTunes harvesting error:', err.message);
              return [];
            })
        );
      }
    }

    // If using live default provider (not a unit test mock), also harvest candidates from local SQLite catalog
    if (musicProvider === deezerMusicProvider && typeof sqliteCatalog?.getRandomPlayableTracks === 'function') {
      try {
        const localTracks = sqliteCatalog.getRandomPlayableTracks({
          count: Math.min(60, limit),
          minPopularity: queryPlan.popularity || 0,
          yearRange: queryPlan.yearRange || null,
          allowSampleless: true,
        });
        if (localTracks && localTracks.length > 0) {
          const mappedLocal = localTracks.map(t => ({
            id: `sqlite:${t.id}`,
            catalogTrackId: t.id,
            provider: t.provider || 'deezer',
            providerTrackId: t.provider_track_id || t.deezer_id || String(t.id),
            deezer_id: t.deezer_id,
            spotify_id: t.spotify_id,
            itunes_id: t.itunes_id,
            title: t.title,
            artist: t.artist,
            album: t.album || 'Single',
            audioUrl: t.sample_url || '',
            sample_url: t.sample_url || '',
            duration_ms: t.duration_ms,
            isrc: t.isrc,
            release_year: t.release_year,
            releaseDate: t.release_date || (t.release_year ? `${t.release_year}-01-01` : null),
            popularity: t.popularity,
          }));
          candidateTasks.push(Promise.resolve(mappedLocal));
        }
      } catch {
        // Non-fatal if sqliteCatalog is not yet initialized or in an isolated test
      }
    }
  }

  const harvestStart = Date.now();
  const results = await Promise.all(candidateTasks);
  const rawCandidates = results.flat();
  logger.harvest('Aggregator', rawCandidates.length, Date.now() - harvestStart);

  // 2. Ordering: Deterministic SHA-256 seed hashing or Fisher-Yates shuffle
  let orderedCandidates;
  if (seed !== undefined && seed !== null && String(seed).trim()) {
    const seedKey = String(seed).trim();
    orderedCandidates = [...rawCandidates].sort((a, b) => {
      const hashA = crypto.createHash('sha256').update(`${seedKey}:${a.id}`).digest('hex');
      const hashB = crypto.createHash('sha256').update(`${seedKey}:${b.id}`).digest('hex');
      return hashA.localeCompare(hashB);
    });
  } else {
    orderedCandidates = shuffleArray(rawCandidates);
  }

  // 2b. Partition into play-frequency tiers to enforce strict round-robin catalog rotation
  const tier0 = []; // unplayed
  const tier1 = []; // played 1x
  const tier2 = []; // played 2x
  const tier3Plus = []; // played 3x or more

  for (const track of orderedCandidates) {
    const playCount = getTrackRecentCount(track);
    if (playCount === 0) tier0.push(track);
    else if (playCount === 1) tier1.push(track);
    else if (playCount === 2) tier2.push(track);
    else tier3Plus.push(track);
  }


  // 3. Variety Rejection Sampling & Language Filtering
  const isTargetingSingleArtist = Boolean(queryPlan.artist);
  const songs = [];
  const clueStats = { title: 0, artist: 0, keyword: 0, anime: 0 };
  const rejections = {
    recent: 0,
    duplicateTrack: 0,
    duplicateTitle: 0,
    duplicateArtist: 0,
    duplicateAnswer: 0,
    blacklist: 0,
    language: 0,
    thematic: 0,
    temporal: 0,
    noKeyword: 0,
  };

  function trySelectTracks(candidateList, maxPlays, targetList = songs, excludedKeys = new Set()) {
    for (const track of candidateList) {
      if (targetList.length >= count) break;

      const trackIdentity = `${canonicalArtistKey(track.artist)}|${canonicalTrackKey(track.title)}`;
      const artistIdentity = canonicalArtistKey(track.artist);
      const titleIdentity = canonicalTrackKey(track.title);
      const playCount = getTrackRecentCount(track);

      if (excludedKeys && excludedKeys.has(trackIdentity)) {
        continue;
      }
      if (playCount > maxPlays) {
        rejections.recent++;
        continue;
      }
      if (seenTracks.has(trackIdentity)) {
        rejections.duplicateTrack++;
        continue;
      }
      if (seenTitles.has(titleIdentity)) {
        rejections.duplicateTitle++;
        continue;
      }
      if (blacklistMatchesTrack(blacklist, track)) {
        rejections.blacklist++;
        continue;
      }

      // Language constraint: enforce English for all categories except anime, kpop, and international themes
      if (!isLanguagePermitted(track, queryPlan.genre, prompt || queryPlan.prompt)) {
        rejections.language++;
        continue;
      }

      // Thematic relevance constraint: reject cultural homonyms and split-genre collisions
      if (!isThematicallyPermitted(track, queryPlan.genre, prompt || queryPlan.prompt)) {
        rejections.thematic++;
        continue;
      }

      // Authenticity constraint: reject workout remixes, tribute bands, slowed/8-bit modifications
      if (!isAuthenticTrack(track)) {
        rejections.thematic++;
        continue;
      }

      // Temporal constraint: enforce release year range if requested
      if (!isTemporalPermitted(track, queryPlan.yearRange)) {
        rejections.temporal++;
        continue;
      }

      // Unless the user explicitly asked for a single artist or anime franchise, enforce max 1 track per artist
      const targetArtistKey = queryPlan.artist ? canonicalArtistKey(queryPlan.artist) : '';
      const isTargetArtist = isTargetingSingleArtist && (
        artistIdentity.includes(targetArtistKey) ||
        targetArtistKey.includes(artistIdentity)
      );

      const isKeyphraseAnimeMatch = isTargetingAnimeKeyphrase && Boolean(track.isAnimeOped);

      const artistNames = splitArtistNames(track.artist);
      const isDuplicateArtist = !isTargetArtist && !isKeyphraseAnimeMatch && (
        seenArtists.has(artistIdentity) ||
        artistNames.some(name => seenArtists.has(canonicalArtistKey(name)))
      );

      if (isDuplicateArtist) {
        rejections.duplicateArtist++;
        continue;
      }

      // Clue type selection:
      // When targeting a single artist, NEVER use 'Artist name' clues (100% title or keyword)
      // When playing anime themes, variate between 'anime', 'title', 'artist', and 'keyword'
      const isAnimeTrack = Boolean(track.isAnimeOped);
      const allowArtist = !isTargetingSingleArtist;
      let preferredType;
      if (isTargetingSingleArtist) {
        preferredType = (targetList.length % 2 === 0) ? 'title' : 'keyword';
      } else if (isAnimeTrack) {
        // Variate across anime title, song title, artist, and keyword
        const ANIME_ROTATION = ['anime', 'title', 'artist', 'keyword'];
        preferredType = ANIME_ROTATION[targetList.length % ANIME_ROTATION.length];
      } else {
        preferredType = PREFERRED_CLUE_ROTATION[targetList.length % PREFERRED_CLUE_ROTATION.length];
        if (seenArtists.has(artistIdentity) && preferredType === 'artist') {
          preferredType = 'title';
        }
      }

      // Answer length variation (2-14 letters) rotation:
      const LENGTH_BUCKET_ROTATION = ['short', 'medium', 'long', 'medium', 'short', 'long', 'medium'];
      const targetLengthBucket = LENGTH_BUCKET_ROTATION[targetList.length % LENGTH_BUCKET_ROTATION.length];

      let keyword = extractAnswerKeyword(track.title, track.artist, {
        preferredType,
        allowArtist,
        animeTitle: track.animeTitle,
        seenAnswers,
        targetLengthBucket
      });

      // If answer already exists on the grid, fallback:
      if (keyword && seenAnswers.has(keyword.answer)) {
        if (keyword.clueType === 'Artist name') {
          // If there is a co-performer (e.g. Sira in "Ski Aggu & Sira"), try them before giving up on artist clues
          keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'artist', allowArtist, animeTitle: track.animeTitle, seenAnswers, artistIndex: 1, targetLengthBucket });
        }
        if (keyword && seenAnswers.has(keyword.answer)) {
          keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'anime', allowArtist, animeTitle: track.animeTitle, seenAnswers, targetLengthBucket });
          if (keyword && seenAnswers.has(keyword.answer)) {
            keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'title', allowArtist, animeTitle: track.animeTitle, seenAnswers, targetLengthBucket });
            if (keyword && seenAnswers.has(keyword.answer)) {
              keyword = extractAnswerKeyword(track.title, track.artist, { preferredType: 'keyword', allowArtist, animeTitle: track.animeTitle, seenAnswers, targetLengthBucket });
            }
          }
        }
      }
      if (!keyword || seenAnswers.has(keyword.answer)) {
        // Fallback without strict length bucket
        keyword = extractAnswerKeyword(track.title, track.artist, { preferredType, allowArtist, animeTitle: track.animeTitle, seenAnswers });
      }
      if (!keyword || seenAnswers.has(keyword.answer)) {
        rejections.noKeyword++;
        continue;
      }

      // Guardrail against generic 2-letter soundtrack abbreviations (TV, OP, ED, OST, BGM)
      // unless the answer is for an authentic artist name
      if (['TV', 'OP', 'ED', 'OST', 'BGM'].includes(keyword.answer) && keyword.clueType !== 'Artist name') {
        const altKeyword = extractAnswerKeyword(track.title, track.artist, { preferredType: allowArtist ? 'artist' : 'title', allowArtist, animeTitle: track.animeTitle, seenAnswers, targetLengthBucket });
        if (altKeyword && !['TV', 'OP', 'ED', 'OST', 'BGM'].includes(altKeyword.answer)) {
          keyword = altKeyword;
        } else {
          rejections.thematic++;
          continue;
        }
      }

      if (seenAnswers.has(keyword.answer)) {
        rejections.duplicateAnswer++;
        continue;
      }

      seenTracks.add(trackIdentity);
      seenArtists.add(artistIdentity);
      artistNames.forEach(name => seenArtists.add(canonicalArtistKey(name)));
      seenTitles.add(titleIdentity);
      seenAnswers.add(keyword.answer);

      if (keyword.clueType === 'Song title') clueStats.title++;
      else if (keyword.clueType === 'Artist name') clueStats.artist++;
      else if (keyword.clueType === 'Anime title') clueStats.anime = (clueStats.anime || 0) + 1;
      else clueStats.keyword++;

      const clueText = formatCrosswordClue(track, keyword);

      targetList.push({
        ...track,
        answer: keyword.answer,
        clueType: keyword.clueType,
        clueText,
      });
    }
  }

  // Pass 1: Try fresh unplayed candidates (playCount === 0)
  trySelectTracks(tier0, 0);

  // Pass 2: If fresh unplayed catalog is exhausted or insufficient, admit candidates with 1 play
  if (songs.length < count && (tier0.length === 0 || songs.length < 3)) {
    trySelectTracks(tier1, 1);
  }

  // Pass 3: If still insufficient, admit candidates with 2 plays
  if (songs.length < count && (tier0.length === 0 && tier1.length === 0)) {
    trySelectTracks(tier2, 2);
  }

  // Pass 4: Last resort fallback to prevent complete failure on tiny catalogs
  if (songs.length < 6) {
    trySelectTracks(tier3Plus, Infinity);
  }

  // 3b. JIT Lazy Anime Cover Artwork Resolution
  if (isAnimeTheme && songs.some(s => s.isAnimeOped)) {
    try {
      await resolveAnimeCoverImages(songs, animeCatalog);
    } catch (err) {
      logger.warn('music_service', `Anime cover art resolution error: ${err.message}`);
    }
  }

  // 4. JIT Lazy Preview Hydration for tracks lacking verified audio previews
  const needsPreview = songs.filter(s => !s.audioUrl || (!s.audioUrl.startsWith('http') && !s.audioUrl.startsWith('/audio/')));
  if (needsPreview.length > 0 && musicProvider === deezerMusicProvider) {
    try {
      const { resolvedTracks } = await batchResolvePreviews(needsPreview);
      const resolvedMap = new Map(resolvedTracks.map(t => [t.id, t.audioUrl]));
      for (const song of songs) {
        if ((!song.audioUrl || (!song.audioUrl.startsWith('http') && !song.audioUrl.startsWith('/audio/'))) && resolvedMap.has(song.id)) {
          song.audioUrl = resolvedMap.get(song.id);
          song.sample_url = song.audioUrl;
        }
      }
    } catch (err) {
      logger.warn('preview_resolver', `Error during batch lazy preview hydration: ${err.message}`);
    }
  }

  // Filter out any songs that could not resolve an audio preview in live mode
  const playableSongs = songs.filter(s => {
    if (musicProvider !== deezerMusicProvider) return true;
    const hasAudio = s.audioUrl && typeof s.audioUrl === 'string' && (s.audioUrl.startsWith('http') || s.audioUrl.startsWith('/audio/'));
    if (!hasAudio) {
      logger.warn('music_service', `Filtered out track "${s.artist} - ${s.title}" due to missing audio preview`);
    }
    return hasAudio;
  });

  logger.sampling(orderedCandidates.length, playableSongs.length, clueStats, rejections);

  return playableSongs;
}
