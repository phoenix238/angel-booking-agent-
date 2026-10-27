// A free check (no AI) that skips notices that clearly have nothing to do with performing
// arts, casting or funding, before they are sent to Claude for scoring. It is deliberately
// generous: an odd notice that slips through just gets a low score; a good one must never
// be dropped. Applies to feeds, Instagram and email, never to Agent Angel's own finds.

const CORE = [
  // casting and screen
  "audition", "auditions", "casting", "castings", "cast", "actor", "actors", "actress", "acting", "performer", "performers", "performing", "performance",
  "self-tape", "self tape", "selftape", "showreel", "equity", "spotlight", "understudy", "swing", "ensemble", "principal", "chorus",
  "voiceover", "voice over", "voice-over", "dubbing", "voice actor", "narrator", "commercial", "film", "tv", "television", "drama", "screen", "extras",
  // stage
  "theatre", "theater", "stage", "musical", "musicals", "west end", "fringe", "cabaret", "panto", "pantomime", "opera", "play", "playwright",
  "tour", "touring", "cruise", "immersive", "rehearsal", "festival", "revue", "show",
  // music and movement
  "musician", "musicians", "singer", "singers", "singing", "vocal", "vocalist", "vocalists", "dancer", "dancers", "dance", "dancing", "choreographer",
  "choreography", "movement", "physical theatre", "piano", "pianist", "violin", "violinist", "strings", "orchestra", "band", "accompanist", "music",
  // funding and development for performers
  "grant", "grants", "funding", "fund", "bursary", "bursaries", "fellowship", "scholarship", "residency", "residencies", "commission",
  "arts council", "creative europe", "kulturrådet", "tilskudd", "stipend", "audisjon", "skuespiller",
  // Norwegian
  "utøvende", "scenekunst", "teater", "musikal", "dans", "danser", "sanger", "musiker", "prosjektstøtte", "rolle", "kulturfond", "norsk kulturfond",
];

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const build = (words: string[]) => new RegExp(`(^|[^\\p{L}])(${words.map(escape).join("|")})($|[^\\p{L}])`, "iu");

const BASE = build(CORE);
const extraCache = new Map<string, RegExp | null>();

export function passesFilter(text: string, extraWords = ""): boolean {
  if (BASE.test(text)) return true;
  const extras = extraWords
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!extras.length) return false;
  const key = extras.join("|");
  if (!extraCache.has(key)) extraCache.set(key, build(extras));
  return extraCache.get(key)!.test(text);
}
