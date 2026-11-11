// Kernen i appen: sammenholder opskrifter med aktuelle tilbud og
// beregner, hvilke opskrifter der er mest oplagte at lave lige nu.

import { toBase } from './units.js';

/** Små bogstaver, ensartede mellemrum og bindestreger. */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Søgeord for en ingrediens: de eksplicitte søgeord, ellers navnet. */
export function searchTermsFor(ingredient) {
  const terms = (ingredient.match?.length ? ingredient.match : [ingredient.name])
    .map(normalizeText)
    .filter(Boolean);
  return [...new Set(terms)];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Findes `term` i `text` i starten af et ord? ("æg" matcher "æg" og "æggehvider",
 * men ikke "pålæg"; "løg" matcher ikke "rødløg").
 */
export function containsWordStart(text, term) {
  return new RegExp(`(?<!\\p{L})${escapeRe(term)}`, 'u').test(text);
}

/** Matcher et tilbud ingrediensen (titel indeholder et søgeord og intet udelukket ord)? */
export function offerMatchesIngredient(offer, ingredient) {
  const text = normalizeText(`${offer.title} ${offer.description ?? ''}`);
  const title = normalizeText(offer.title);
  const excludes = (ingredient.exclude ?? []).map(normalizeText).filter(Boolean);
  if (excludes.some((x) => containsWordStart(text, x))) return false;
  return searchTermsFor(ingredient).some((t) => containsWordStart(title, t));
}

/** Pris pr. basisenhed for et tilbud (kr/kg, kr/l, kr/stk) – eller null hvis ukendt. */
export function offerUnitPrice(offer) {
  const base = toBase(offer.amount, offer.unit);
  if (!base || !(offer.price > 0)) return null;
  return { dim: base.dim, unitPrice: offer.price / base.qty, packQty: base.qty };
}

/** Er tilbuddet gyldigt på den givne dato? Tilbud uden datoer regnes som gyldige. */
export function isOfferActive(offer, now = new Date()) {
  if (offer.validFrom && new Date(offer.validFrom) > now) return false;
  if (offer.validTo && new Date(offer.validTo) < now) return false;
  return true;
}

/**
 * Er tilbuddet økologisk? Kigger efter "økologisk(e)", "øko" og "organic" som
 * selvstændige ord, så fx "økonomipakke" ikke tæller med.
 */
export function isOrganicOffer(offer) {
  const text = normalizeText(`${offer.title} ${offer.description ?? ''}`);
  return /(?<!\p{L})(øko|økologisk|økologiske|organic)(?!\p{L})/u.test(text);
}

// Hvor meget økologi vægtes? 0 = ignorér, 1 = lidt (standard), 2 = meget.
//   preference: hvor mange procent dyrere et økologisk tilbud må være og stadig blive valgt
//   bonus:      ekstra point, hvis hele indkøbet er økologisk
export const ORGANIC_LEVELS = {
  0: { preference: 0, bonus: 0 },
  1: { preference: 0.15, bonus: 10 },
  2: { preference: 0.3, bonus: 20 },
};
export const DEFAULT_ORGANIC_LEVEL = 1;

export function organicLevel(level) {
  return ORGANIC_LEVELS[level] ?? ORGANIC_LEVELS[DEFAULT_ORGANIC_LEVEL];
}

/**
 * Finder det bedste relevante tilbud til en ingrediens – som udgangspunkt det billigste pr. kg/l/stk.
 * Med `organicPreference` får økologiske tilbud en rabat i sammenligningen (ikke i prisen),
 * så et lidt dyrere økologisk tilbud kan vinde over et konventionelt.
 * Med `maxUnitPrice` ses der bort fra tilbud, der ikke er billigere end den pris.
 */
export function bestOfferForIngredient(ingredient, offers, { organicPreference = 0, maxUnitPrice = null } = {}) {
  const need = toBase(ingredient.amount, ingredient.unit);
  if (!need) return null;
  let best = null;
  for (const offer of offers) {
    if (!offerMatchesIngredient(offer, ingredient)) continue;
    const up = offerUnitPrice(offer);
    if (!up || up.dim !== need.dim) continue;
    if (maxUnitPrice != null && up.unitPrice >= maxUnitPrice) continue;
    const organic = isOrganicOffer(offer);
    const rankPrice = up.unitPrice * (organic ? 1 - organicPreference : 1);
    if (!best || rankPrice < best.rankPrice) {
      best = { offer, unitPrice: up.unitPrice, rankPrice, organic, packs: Math.ceil(need.qty / up.packQty - 1e-9) };
    }
  }
  return best;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round2 = (x) => Math.round(x * 100) / 100;

// Vægte for den samlede score (0-100).
export const SCORE_WEIGHTS = {
  savings: 0.5, // hvor stor en procentdel man sparer
  coverage: 0.3, // hvor stor en del af indkøbet der er på tilbud
  convenience: 0.2, // hvor meget af besparelsen man kan hente i én enkelt butik
};
// Besparelse (i %) der giver fuldt point på "savings"-delen.
export const FULL_SAVINGS_PCT = 0.4;

/**
 * Evaluerer én opskrift mod en liste af (allerede filtrerede) tilbud.
 * @param {object} [opts]
 * @param {0|1|2} [opts.organic] Hvor meget økologi vægtes (se ORGANIC_LEVELS).
 */
export function evaluateRecipe(recipe, offers, opts = {}) {
  const eco = organicLevel(opts.organic ?? DEFAULT_ORGANIC_LEVEL);
  const lines = [];
  let normalCost = 0;
  let dealCost = 0;
  let coveredNormalCost = 0;
  let organicNormalCost = 0;
  let organicCount = 0;
  // "Værdi": den besparelse det billigste tilbud ville give. Bruges kun til scoren,
  // så det aldrig koster point at vælge et lidt dyrere økologisk tilbud.
  // Økologien belønnes i stedet med bonuspoint ovenpå.
  let valueSavings = 0;
  const storeSavings = new Map();
  const storeValue = new Map();

  for (const ing of recipe.ingredients ?? []) {
    if (ing.pantry) {
      lines.push({ ingredient: ing, pantry: true });
      continue;
    }
    const need = toBase(ing.amount, ing.unit);
    const refPrice = Number(ing.refPrice) || 0;
    const normal = need ? need.qty * refPrice : 0;
    // Kun tilbud under normalprisen tæller som tilbud. Findes der ingen, vises det
    // billigste match alligevel som information.
    const best = bestOfferForIngredient(ing, offers, {
      organicPreference: eco.preference,
      maxUnitPrice: refPrice > 0 ? refPrice : null,
    });
    const isDeal = Boolean(best);
    const fallback = isDeal ? null : bestOfferForIngredient(ing, offers);
    const cost = isDeal ? need.qty * best.unitPrice : normal;
    const saving = isDeal && refPrice > 0 ? normal - cost : 0;
    const cheapest = isDeal && best.organic && eco.preference > 0
      ? bestOfferForIngredient(ing, offers, { maxUnitPrice: refPrice > 0 ? refPrice : null })
      : best;
    const value = isDeal && refPrice > 0 ? normal - need.qty * cheapest.unitPrice : 0;
    valueSavings += value;

    normalCost += normal;
    dealCost += cost;
    if (isDeal) {
      coveredNormalCost += normal;
      if (best.organic) {
        organicNormalCost += normal;
        organicCount += 1;
      }
      const store = best.offer.store;
      storeSavings.set(store, (storeSavings.get(store) ?? 0) + saving);
      storeValue.set(store, (storeValue.get(store) ?? 0) + value);
    }

    lines.push({
      ingredient: ing,
      pantry: false,
      normalCost: round2(normal),
      cost: round2(cost),
      saving: round2(saving),
      offer: isDeal ? best.offer : null,
      offerUnitPrice: isDeal ? round2(best.unitPrice) : null,
      packs: isDeal ? best.packs : null,
      organic: isDeal ? best.organic : false,
      // Et match der ikke er billigere end normalprisen, vises som info.
      nonDealOffer: fallback ? fallback.offer : null,
    });
  }

  const savings = normalCost - dealCost;
  const savingsPct = normalCost > 0 ? savings / normalCost : 0;
  const coverage = normalCost > 0 ? coveredNormalCost / normalCost : 0;

  const stores = [...storeSavings.entries()]
    .map(([store, s]) => ({ store, savings: round2(s) }))
    .sort((a, b) => b.savings - a.savings);
  const bestStore = stores[0] ?? null;
  const valuePct = normalCost > 0 ? valueSavings / normalCost : 0;
  const bestStoreValue = Math.max(0, ...storeValue.values());
  const convenience = valueSavings > 0 ? bestStoreValue / valueSavings : 0;

  const baseScore = Math.round(
    100 *
      (SCORE_WEIGHTS.savings * clamp01(valuePct / FULL_SAVINGS_PCT) +
        SCORE_WEIGHTS.coverage * clamp01(coverage) +
        SCORE_WEIGHTS.convenience * clamp01(convenience)),
  );
  // Økologibonus: andel af indkøbet (i normalpris) der købes økologisk på tilbud.
  const organicShare = normalCost > 0 ? organicNormalCost / normalCost : 0;
  const organicBonus = Math.round(eco.bonus * organicShare);
  const score = Math.min(100, baseScore + organicBonus);

  const servings = Number(recipe.servings) || 1;
  const perServing = dealCost / servings;
  const protein = Number(recipe.proteinPerServing) || 0;

  return {
    recipeId: recipe.id,
    recipe,
    score,
    baseScore,
    organicBonus,
    organicCount,
    organicPct: round2(organicShare * 100),
    normalCost: round2(normalCost),
    dealCost: round2(dealCost),
    savings: round2(savings),
    savingsPct: round2(savingsPct * 100),
    coveragePct: round2(coverage * 100),
    costPerServing: round2(perServing),
    proteinPerServing: protein,
    proteinPer10Kr: perServing > 0 ? round2((protein / perServing) * 10) : null,
    stores,
    bestStore,
    storesNeeded: stores.length,
    lines,
  };
}

/**
 * Rangerer alle opskrifter.
 * @param {object} opts
 * @param {string[]} [opts.stores] Kun tilbud fra disse butikker (tom = alle).
 * @param {string[]} [opts.excludeStores] Se bort fra tilbud fra disse butikker.
 * @param {Date} [opts.now]
 * @param {'score'|'price'|'protein'|'savings'} [opts.sort]
 * @param {0|1|2} [opts.organic] Hvor meget økologi vægtes.
 */
export function rankRecipes(recipes, offers, opts = {}) {
  const now = opts.now ?? new Date();
  const allowed = opts.stores?.length ? new Set(opts.stores.map(normalizeText)) : null;
  const excluded = new Set((opts.excludeStores ?? []).map(normalizeText));
  const usable = offers.filter((o) => {
    const store = normalizeText(o.store);
    return isOfferActive(o, now) && (!allowed || allowed.has(store)) && !excluded.has(store);
  });
  const results = recipes.map((r) => evaluateRecipe(r, usable, { organic: opts.organic }));
  const sorters = {
    score: (a, b) => b.score - a.score || b.savings - a.savings,
    price: (a, b) => a.costPerServing - b.costPerServing,
    protein: (a, b) => (b.proteinPer10Kr ?? 0) - (a.proteinPer10Kr ?? 0),
    savings: (a, b) => b.savings - a.savings,
  };
  return results.sort(sorters[opts.sort] ?? sorters.score);
}

/** Alle unikke søgeord på tværs af opskrifter (bruges til at hente tilbud). */
export function collectSearchTerms(recipes) {
  const set = new Set();
  for (const r of recipes) {
    for (const ing of r.ingredients ?? []) {
      if (ing.pantry) continue;
      for (const t of searchTermsFor(ing)) set.add(t);
    }
  }
  return [...set];
}
