// Fortolker danske ingredienslinjer ("1 dåse hakkede tomater (400 g)") og
// slår ingredienserne op i en lille vidensbase med vejledende normalpriser,
// søgeord og proteinindhold. Bruges når opskrifter importeres fra et link.

import { containsWordStart, normalizeText } from './matcher.js';

const PORK = ['svin', 'svine', 'gris', 'grise', 'flæsk', 'bacon', 'skinke'];
const EGG_EX = ['påskeæg', 'chokolade', 'nudler', 'pasta', 'kinderæg', 'mayonnaise', 'salat'];
const ONION_EX = ['forårsløg', 'rødløg', 'ristede', 'syltede', 'løgringe'];
const RICE_EX = ['risengrød', 'grødris', 'riskiks', 'risotto', 'rispapir', 'risalamande', 'nudler'];
const POTATO_EX = ['søde', 'chips', 'fritter', 'pommes', 'mos', 'både'];

/**
 * Vidensbase. `keys` er ord, der genkender ingrediensen (i starten af et ord).
 * `unit` er den enhed normalprisen gælder for (kg, l eller stk).
 * `refPrice` er en vejledende normalpris i kr. pr. `unit`.
 * `protein` er gram protein pr. 100 g (eller pr. stk., hvis unit er stk).
 * `pieceGrams` bruges til at omregne "2 kyllingebryst" til gram.
 */
export const KNOWN_INGREDIENTS = [
  { keys: ['kyllingebryst', 'kyllingefilet', 'kyllingeinderfilet'], unit: 'kg', refPrice: 130, protein: 23, pieceGrams: 150, match: ['kyllingebryst', 'kyllingefilet', 'kyllingeinderfilet'], exclude: ['pålæg', 'paneret', 'nuggets', ...PORK] },
  { keys: ['kyllingeoverlår', 'kyllingelår', 'overlår'], unit: 'kg', refPrice: 90, protein: 19, pieceGrams: 120, match: ['kyllingeoverlår', 'kyllingelår'], exclude: ['grillet', 'paneret', ...PORK] },
  { keys: ['hakket kylling', 'kyllingefars', 'hakket kyllingekød'], unit: 'kg', refPrice: 90, protein: 20, match: ['hakket kylling', 'hakket kyllingekød', 'kyllingefars'], exclude: ['færdigret', ...PORK] },
  { keys: ['hel kylling', 'kylling'], unit: 'kg', refPrice: 60, protein: 19, pieceGrams: 1400, match: ['hel kylling', 'kylling'], exclude: ['pålæg', 'paneret', 'nuggets', 'bryst', 'lår', 'vinger', 'hakket', ...PORK] },
  { keys: ['hakket oksekød', 'oksefars', 'hakket okse'], unit: 'kg', refPrice: 110, protein: 20, match: ['hakket oksekød', 'hakket okse', 'oksefars'], exclude: ['bøf', 'burger', 'færdigret', ...PORK] },
  { keys: ['hakket kalvekød', 'kalvefars'], unit: 'kg', refPrice: 120, protein: 20, match: ['hakket kalvekød', 'kalvefars'], exclude: [...PORK] },
  { keys: ['oksemørbrad'], unit: 'kg', refPrice: 400, protein: 22, match: ['oksemørbrad'], exclude: [] },
  { keys: ['oksebøf', 'bøf', 'culotte', 'entrecote', 'oksefilet'], unit: 'kg', refPrice: 250, protein: 22, pieceGrams: 180, match: ['oksebøf', 'culotte', 'entrecote', 'oksefilet'], exclude: ['hakkebøf', 'burger', ...PORK] },
  { keys: ['kalkunbryst', 'kalkunfilet', 'kalkun'], unit: 'kg', refPrice: 140, protein: 24, match: ['kalkunbryst', 'kalkunfilet', 'kalkunstrimler', 'kalkun'], exclude: ['pålæg', 'hakket', ...PORK] },
  { keys: ['hakket kalkun', 'kalkunfars'], unit: 'kg', refPrice: 90, protein: 20, match: ['hakket kalkun', 'kalkunfars'], exclude: [...PORK] },
  { keys: ['laksefilet', 'laks'], unit: 'kg', refPrice: 220, protein: 20, pieceGrams: 125, match: ['laksefilet', 'laks'], exclude: ['røget', 'gravad', 'pålæg', 'rogn'] },
  { keys: ['torskefilet', 'torsk'], unit: 'kg', refPrice: 200, protein: 18, pieceGrams: 125, match: ['torskefilet', 'torsk'], exclude: ['røget', 'rogn', 'paneret', 'fiskefrikadeller'] },
  { keys: ['sej', 'sejfilet', 'hvid fisk', 'fiskefilet'], unit: 'kg', refPrice: 150, protein: 18, pieceGrams: 125, match: ['sejfilet', 'sej', 'fiskefilet'], exclude: ['paneret', 'røget'] },
  { keys: ['tun', 'tunfisk'], unit: 'kg', refPrice: 100, protein: 25, pieceGrams: 120, match: ['tun i vand', 'tun i olie', 'tunfisk', 'tun'], exclude: ['tunmousse', 'salat', 'pålæg'] },
  { keys: ['rejer'], unit: 'kg', refPrice: 200, protein: 18, match: ['rejer'], exclude: ['rejesalat', 'chips'] },
  { keys: ['æg', 'æggehvide', 'æggeblomme', 'æggeblommer', 'æggehvider'], unit: 'stk', refPrice: 2.8, protein: 6.5, match: ['æg'], exclude: EGG_EX },
  { keys: ['hytteost'], unit: 'kg', refPrice: 50, protein: 12, match: ['hytteost'], exclude: [] },
  { keys: ['skyr'], unit: 'kg', refPrice: 30, protein: 11, match: ['skyr'], exclude: ['drikke', 'shot'] },
  { keys: ['græsk yoghurt', 'yoghurt'], unit: 'kg', refPrice: 40, protein: 6, match: ['græsk yoghurt', 'yoghurt naturel'], exclude: ['drikke'] },
  { keys: ['kvark'], unit: 'kg', refPrice: 40, protein: 11, match: ['kvark'], exclude: [] },
  { keys: ['feta', 'salatost'], unit: 'kg', refPrice: 90, protein: 15, match: ['feta', 'salatost'], exclude: ['olie', 'oliven'] },
  { keys: ['parmesan', 'parmigiano', 'grana padano'], unit: 'kg', refPrice: 250, protein: 33, match: ['parmesan', 'parmigiano', 'grana padano'], exclude: [] },
  { keys: ['mozzarella', 'revet ost', 'ost'], unit: 'kg', refPrice: 90, protein: 25, match: ['revet ost', 'mozzarella', 'pizzatopping'], exclude: ['flødeost', 'smøreost', 'hytteost'] },
  { keys: ['mælk', 'skummetmælk', 'letmælk', 'minimælk'], unit: 'l', refPrice: 13, protein: 3.4, match: ['letmælk', 'minimælk', 'skummetmælk', 'sødmælk'], exclude: ['kakao', 'chokolade'] },
  { keys: ['madlavningsfløde', 'fløde', 'piskefløde'], unit: 'l', refPrice: 40, protein: 2.5, match: ['madlavningsfløde', 'fløde'], exclude: ['flødeboller', 'is'] },
  { keys: ['creme fraiche', 'cremefraiche'], unit: 'kg', refPrice: 45, protein: 3, match: ['creme fraiche', 'cremefraiche'], exclude: [] },
  { keys: ['tofu'], unit: 'kg', refPrice: 60, protein: 13, match: ['tofu'], exclude: [] },
  { keys: ['jasminris', 'basmatiris', 'ris'], unit: 'kg', refPrice: 25, protein: 7, match: ['jasminris', 'basmatiris', 'ris'], exclude: RICE_EX },
  { keys: ['lasagneplader', 'lasagne'], unit: 'kg', refPrice: 30, protein: 12, match: ['lasagneplader', 'lasagne'], exclude: ['færdigret'] },
  { keys: ['pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'makaroni'], unit: 'kg', refPrice: 20, protein: 12, match: ['pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle'], exclude: ['pastasauce', 'pastaret', 'frisk pasta'] },
  { keys: ['ægnudler', 'nudler'], unit: 'kg', refPrice: 40, protein: 12, match: ['ægnudler', 'nudler'], exclude: ['instant', 'suppe', 'cup'] },
  { keys: ['bulgur'], unit: 'kg', refPrice: 30, protein: 12, match: ['bulgur'], exclude: [] },
  { keys: ['quinoa'], unit: 'kg', refPrice: 60, protein: 14, match: ['quinoa'], exclude: [] },
  { keys: ['tortilla', 'tortillas', 'wraps'], unit: 'stk', refPrice: 4, protein: 3, match: ['tortilla', 'wraps'], exclude: ['chips'] },
  { keys: ['søde kartofler', 'sød kartoffel', 'sødekartofler'], unit: 'kg', refPrice: 30, protein: 1.6, pieceGrams: 300, match: ['søde kartofler', 'sødekartofler'], exclude: ['fritter', 'chips'] },
  { keys: ['kartofler', 'kartoffel', 'nye kartofler'], unit: 'kg', refPrice: 18, protein: 2, pieceGrams: 100, match: ['kartofler'], exclude: POTATO_EX },
  { keys: ['rødløg'], unit: 'kg', refPrice: 20, protein: 1, pieceGrams: 100, match: ['rødløg'], exclude: ['syltede'] },
  { keys: ['forårsløg'], unit: 'stk', refPrice: 10, protein: 0, match: ['forårsløg'], exclude: [] },
  { keys: ['løg', 'skalotteløg'], unit: 'kg', refPrice: 15, protein: 1, pieceGrams: 100, match: ['løg'], exclude: ONION_EX },
  { keys: ['gulerødder', 'gulerod'], unit: 'kg', refPrice: 12, protein: 1, pieceGrams: 80, match: ['gulerødder', 'gulerod'], exclude: [] },
  { keys: ['broccoli'], unit: 'stk', refPrice: 15, protein: 12, match: ['broccoli'], exclude: [] },
  { keys: ['blomkål'], unit: 'stk', refPrice: 20, protein: 15, match: ['blomkål'], exclude: [] },
  { keys: ['peberfrugt', 'peberfrugter', 'rød peber'], unit: 'stk', refPrice: 8, protein: 1.5, match: ['peberfrugt', 'peberfrugter'], exclude: [] },
  { keys: ['squash', 'courgette', 'zucchini'], unit: 'stk', refPrice: 10, protein: 3, match: ['squash'], exclude: [] },
  { keys: ['agurk'], unit: 'stk', refPrice: 8, protein: 2, match: ['agurk'], exclude: ['syltede', 'asie'] },
  { keys: ['champignon', 'champignoner', 'svampe'], unit: 'kg', refPrice: 50, protein: 3, match: ['champignon', 'champignoner', 'svampe'], exclude: [] },
  { keys: ['babyspinat', 'spinat'], unit: 'kg', refPrice: 80, protein: 3, match: ['spinat', 'babyspinat'], exclude: [] },
  { keys: ['cherrytomater', 'snacktomater', 'tomater', 'tomat'], unit: 'kg', refPrice: 40, protein: 1, pieceGrams: 100, match: ['cherrytomater', 'snacktomater', 'tomater'], exclude: ['hakkede', 'flåede', 'soltørrede', 'ketchup', 'purée', 'koncentrat'] },
  { keys: ['hakkede tomater', 'flåede tomater', 'tomater på dåse'], unit: 'kg', refPrice: 20, protein: 1, match: ['hakkede tomater', 'flåede tomater'], exclude: [] },
  { keys: ['tomatpuré', 'tomatpure', 'tomatkoncentrat'], unit: 'kg', refPrice: 40, protein: 4, match: ['tomatpuré', 'tomatkoncentrat'], exclude: [], pantryIfSmall: true },
  { keys: ['kidneybønner'], unit: 'kg', refPrice: 25, protein: 8, match: ['kidneybønner'], exclude: [] },
  { keys: ['kikærter'], unit: 'kg', refPrice: 25, protein: 7, match: ['kikærter'], exclude: ['chips'] },
  { keys: ['sorte bønner', 'hvide bønner', 'bønner'], unit: 'kg', refPrice: 25, protein: 7, match: ['sorte bønner', 'hvide bønner', 'bønner'], exclude: ['kaffebønner', 'grønne bønner', 'chips'] },
  { keys: ['edamame', 'edamamebønner'], unit: 'kg', refPrice: 60, protein: 11, match: ['edamame'], exclude: [] },
  { keys: ['linser'], unit: 'kg', refPrice: 30, protein: 24, match: ['linser'], exclude: ['chips', 'pasta'] },
  { keys: ['ærter'], unit: 'kg', refPrice: 30, protein: 5, match: ['ærter'], exclude: ['sukkerærter', 'kikærter'] },
  { keys: ['majs'], unit: 'kg', refPrice: 25, protein: 3, match: ['majs'], exclude: ['popcorn', 'chips', 'majsstivelse'] },
  { keys: ['wokgrøntsager', 'wokblanding'], unit: 'kg', refPrice: 30, protein: 2, match: ['wokgrøntsager', 'wokblanding', 'wok mix'], exclude: [] },
  { keys: ['kokosmælk'], unit: 'l', refPrice: 30, protein: 2, match: ['kokosmælk'], exclude: ['drik'] },
  { keys: ['citron', 'citroner'], unit: 'stk', refPrice: 5, protein: 0, match: ['citron', 'citroner'], exclude: ['saft', 'te'] },
  { keys: ['lime'], unit: 'stk', refPrice: 4, protein: 0, match: ['lime'], exclude: ['saft'] },
  { keys: ['avocado', 'avokado'], unit: 'stk', refPrice: 10, protein: 2, match: ['avocado'], exclude: [] },
];

// Ting de fleste har i skabet. Tælles ikke med i prisen.
const PANTRY_WORDS = [
  'salt', 'peber', 'olie', 'olivenolie', 'rapsolie', 'smør', 'margarine', 'sukker', 'mel', 'hvedemel',
  'bouillon', 'bouillonterning', 'fond', 'vand', 'eddike', 'balsamico', 'soja', 'sojasauce', 'fiskesauce',
  'sennep', 'honning', 'paprika', 'spidskommen', 'kanel', 'oregano', 'timian', 'rosmarin', 'basilikum',
  'chili', 'chiliflager', 'karry', 'karrypulver', 'gurkemeje', 'koriander', 'persille', 'purløg', 'dild',
  'muskat', 'laurbærblad', 'hvidløg', 'ingefær', 'krydderi', 'krydderier', 'garam masala', 'majsstivelse',
  'bagepulver', 'gær', 'ketchup', 'mayonnaise', 'havregryn', 'rasp', 'sesamfrø', 'chilisauce', 'sriracha',
];

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

// Enheder i ingredienslinjer -> [appens enhed, faktor]. null = særbehandles.
const UNIT_WORDS = {
  g: ['g', 1], gr: ['g', 1], gram: ['g', 1],
  kg: ['kg', 1], kilo: ['kg', 1],
  ml: ['ml', 1], cl: ['cl', 1], dl: ['dl', 1], l: ['l', 1], liter: ['l', 1],
  spsk: ['ml', 15], tsk: ['ml', 5], knsp: ['ml', 0.5], tskf: ['ml', 5],
  stk: ['stk', 1], styk: ['stk', 1], fed: ['stk', 1], bundt: ['stk', 1], bdt: ['stk', 1],
  skive: ['stk', 1], skiver: ['stk', 1], håndfuld: ['stk', 1], håndfulde: ['stk', 1], blade: ['stk', 1],
  dåse: null, dåser: null, ds: null, pakke: null, pakker: null, pk: null, bakke: null, bakker: null, pose: null, poser: null,
};
// Typisk indhold af en dåse/pakke, hvis linjen ikke selv siger det.
const DEFAULT_CONTAINER = { dåse: ['g', 400], pakke: ['stk', 1], bakke: ['g', 250], pose: ['g', 500] };
const CONTAINER_ALIAS = { dåser: 'dåse', ds: 'dåse', pakker: 'pakke', pk: 'pakke', bakker: 'bakke', poser: 'pose' };

function parseNumber(s) {
  if (!s) return null;
  let t = s.trim();
  for (const [f, v] of Object.entries(FRACTIONS)) {
    if (t === f) return v;
    if (t.endsWith(f)) return Number(t.slice(0, -1).trim().replace(',', '.')) + v;
  }
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])`;

/** Finder et vægt-/volumenmål i parentes, fx "(ca. 400 g)". */
function weightInParens(line) {
  const m = line.match(new RegExp(String.raw`\(\s*(?:ca\.?\s*|à\s*)?(${NUM})\s*(g|gr|gram|kg|ml|cl|dl|l)\b[^)]*\)`, 'i'));
  if (!m) return null;
  const [unit, factor] = UNIT_WORDS[m[2].toLowerCase()];
  return { amount: parseNumber(m[1]) * factor, unit, raw: m[0] };
}

function cleanName(s) {
  let t = s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(?:af|med)\s+/i, '')
    .replace(/\b(?:ca\.?|evt\.?|cirka|eventuelt)\s*/gi, '')
    .split(/[,;]| - | – /)[0]
    .replace(/\s+til\s+(?:servering|pynt|stegning|anretning)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Fortolker én ingredienslinje til { amount, unit, name, optional }.
 * Eksempler: "500 g hakket oksekød", "2 spsk olivenolie", "1 dåse hakkede tomater (400 g)",
 * "½ tsk salt", "2 kyllingebryst (ca. 300 g)", "salt og peber".
 */
export function parseIngredientLine(line) {
  const raw = String(line ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[\s•*·\-–]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const optional = /\b(?:evt\.?|eventuelt)\b/i.test(raw);
  let rest = raw;
  let amount = null;
  let unit = null;

  const numMatch = rest.match(new RegExp(String.raw`^(${NUM})(?:\s*[-–]\s*${NUM})?\s*`));
  if (numMatch) {
    amount = parseNumber(numMatch[1]);
    rest = rest.slice(numMatch[0].length);
  }

  const unitMatch = rest.match(/^([a-zæøå]+)\.?(?=\s|$)/i);
  const unitWord = unitMatch?.[1].toLowerCase();
  if (unitWord && unitWord in UNIT_WORDS) {
    rest = rest.slice(unitMatch[0].length);
    const def = UNIT_WORDS[unitWord];
    if (def) {
      unit = def[0];
      amount = (amount ?? 1) * def[1];
    } else {
      // Dåse/pakke: brug vægten i parentes, ellers et typisk indhold.
      const container = CONTAINER_ALIAS[unitWord] ?? unitWord;
      const inner = weightInParens(raw);
      const count = amount ?? 1;
      if (inner) {
        amount = count * inner.amount;
        unit = inner.unit;
      } else {
        const [u, a] = DEFAULT_CONTAINER[container];
        amount = count * a;
        unit = u;
      }
    }
  } else if (amount != null) {
    // "2 kyllingebryst (ca. 300 g)" – foretræk vægten i parentes.
    const inner = weightInParens(raw);
    if (inner) {
      amount = inner.amount;
      unit = inner.unit;
    } else {
      unit = 'stk';
    }
  }

  return { amount, unit, name: cleanName(rest) || cleanName(raw), optional, raw };
}

const SORTED = KNOWN_INGREDIENTS.flatMap((k) => k.keys.map((key) => ({ key: normalizeText(key), info: k })))
  .sort((a, b) => b.key.length - a.key.length);

/** Slår en ingrediens op i vidensbasen (længste nøgle vinder). */
export function lookupIngredient(name) {
  const text = normalizeText(name);
  for (const { key, info } of SORTED) if (containsWordStart(text, key)) return info;
  return null;
}

function isPantryName(name) {
  const text = normalizeText(name);
  const words = text.split(/[\s-]+/).filter((w) => !['og', 'eller', 'frisk', 'friskkværnet', 'groft', 'fint', 'hel', 'tørret', 'stødt', 'revet'].includes(w));
  // Hele ordet skal være en skabsvare – eller ende på en af de typiske sammensætninger
  // ("kyllingebouillon", "sesamolie", "hvidløgsfed").
  const SUFFIXES = ['bouillon', 'fond', 'olie', 'eddike', 'krydderi', 'pulver', 'fed'];
  return words.length > 0 && words.every((w) => PANTRY_WORDS.includes(w) || SUFFIXES.some((x) => w.endsWith(x)));
}

/** Omregner mængde til den enhed vidensbasen bruger. Returnerer { amount, unit, converted }. */
function toKnownUnit(parsed, info) {
  const { amount, unit } = parsed;
  if (amount == null || !unit) return null;
  const mass = { g: 1, kg: 1000 };
  const vol = { ml: 1, cl: 10, dl: 100, l: 1000 };
  if (info.unit === 'kg') {
    if (mass[unit]) return { amount: amount * mass[unit], unit: 'g' };
    if (vol[unit]) return { amount: Math.round(amount * vol[unit]), unit: 'g', converted: 'volumen omregnet til vægt (1 ml ≈ 1 g)' };
    if (unit === 'stk' && info.pieceGrams) return { amount: amount * info.pieceGrams, unit: 'g', converted: `${amount} stk. omregnet til ca. ${amount * info.pieceGrams} g` };
  }
  if (info.unit === 'l') {
    if (vol[unit]) return { amount: amount * vol[unit], unit: 'ml' };
    if (mass[unit]) return { amount: amount * mass[unit], unit: 'ml', converted: 'vægt omregnet til volumen (1 g ≈ 1 ml)' };
  }
  if (info.unit === 'stk' && unit === 'stk') return { amount, unit: 'stk' };
  return null;
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * Laver en ingrediens til appen ud fra en linje fra en opskrift.
 * Returnerer { ingredient, proteinGrams, notes[] }.
 */
export function ingredientFromLine(line) {
  const parsed = parseIngredientLine(line);
  const notes = [];
  const info = lookupIngredient(parsed.name);
  const smallSpoon = parsed.unit === 'ml' && /\b(?:spsk|tsk|knsp)\b/i.test(parsed.raw);

  // Basisvarer: kendte skabsvarer, små skefulde af ukendte ting og linjer uden mængde.
  const pantry =
    isPantryName(parsed.name) ||
    (!info && (smallSpoon || parsed.amount == null)) ||
    (info?.pantryIfSmall && smallSpoon) ||
    (parsed.optional && !info);

  if (pantry) {
    return {
      ingredient: { name: parsed.name, amount: 1, unit: 'stk', refPrice: 0, match: [], exclude: [], pantry: true },
      proteinGrams: 0,
      notes,
    };
  }

  if (!info) {
    notes.push(`"${parsed.name}" er ikke kendt – udfyld normalpris og søgeord.`);
    return {
      ingredient: {
        name: parsed.name,
        amount: round(parsed.amount ?? 1),
        unit: parsed.unit ?? 'stk',
        refPrice: 0,
        match: [normalizeText(parsed.name)],
        exclude: [],
        pantry: false,
      },
      proteinGrams: 0,
      notes,
    };
  }

  const conv = toKnownUnit(parsed, info);
  if (!conv) {
    notes.push(`"${parsed.name}": kunne ikke omregne "${parsed.raw}" – tjek mængde og enhed.`);
  } else if (conv.converted) {
    notes.push(`"${parsed.name}": ${conv.converted}.`);
  }
  const amount = conv ? round(conv.amount) : round(parsed.amount ?? 1);
  const unit = conv ? conv.unit : info.unit === 'stk' ? 'stk' : info.unit === 'l' ? 'ml' : 'g';

  let proteinGrams = 0;
  if (conv) proteinGrams = info.unit === 'stk' ? amount * info.protein : (amount / 100) * info.protein;

  return {
    ingredient: {
      name: parsed.name,
      amount,
      unit,
      refPrice: info.refPrice,
      match: [...info.match],
      exclude: [...info.exclude],
      pantry: false,
    },
    proteinGrams,
    notes,
  };
}
