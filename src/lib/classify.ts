// Keyword tagging for the dashboard filters. The LLM's JSON has no category
// field (the prompt is fixed), so these are worked out from the notice text.

export type Category = "audition" | "grant" | "other";

const GRANT =
  /\b(grants?|funding|fund|bursar(y|ies)|scholarships?|fellowships?|residenc(y|ies)|commission(ing)?|arts council|creative europe|prize|award money|apply for support)\b/i;
// Strong words beat a grant word; weak ones ("roles", "seeking") also appear in funding calls.
const STRONG_AUDITION = /\b(auditions?|casting calls?|now casting|self[- ]?tapes?|showreel|understud(y|ies))\b/i;
const WEAK_AUDITION = /\b(casting|roles?|breakdown|seeking|open call for (actors|performers)|ensemble|swing)\b/i;
const ACTOR_MUSICIAN =
  /\b(actor[- /]?musicians?|actor who plays|actors who play|multi[- ]?instrumentalists?|must play|play(s|ing)? (the )?(piano|keys|violin|fiddle|guitar|cello|an instrument|instruments)|instrumental ability|on[- ]stage band)\b/i;

export function classify(text: string): { category: Category; isActorMusician: boolean } {
  const category: Category = STRONG_AUDITION.test(text)
    ? "audition"
    : GRANT.test(text)
      ? "grant"
      : WEAK_AUDITION.test(text)
        ? "audition"
        : "other";
  return { category, isActorMusician: ACTOR_MUSICIAN.test(text) };
}
