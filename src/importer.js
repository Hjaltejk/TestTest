// Importerer en opskrift fra et link.
//
// Næsten alle opskriftssider (Valdemarsro, Arla, madbloggere med WordPress-plugins
// osv.) lægger opskriften ind i siden som struktureret data efter standarden
// schema.org/Recipe, så Google kan vise den. Det er det, vi læser.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ingredientFromLine } from './ingredients.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

function importError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/* ---------- Sikker hentning ---------- */

/** Er adressen privat/lokal? Så nægter vi at hente den (beskytter dit eget netværk). */
export function isPrivateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw importError('Linket skal starte med http:// eller https://.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw importError(`Kunne ikke finde siden "${url.hostname}".`);
  // IMPORT_ALLOW_PRIVATE=1 tillader lokale adresser (kun til udvikling/test).
  if (process.env.IMPORT_ALLOW_PRIVATE !== '1' && addrs.some((a) => isPrivateAddress(a.address))) {
    throw importError('Linket peger på en lokal adresse og kan ikke hentes.');
  }
}

export async function fetchPage(rawUrl, { fetchImpl = fetch, checkHost = assertPublicUrl } = {}) {
  let url;
  try {
    url = new URL(String(rawUrl ?? '').trim());
  } catch {
    throw importError('Det ligner ikke et gyldigt link.');
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await checkHost(url);
    let res;
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Tilbudskokken/0.1; opskriftsimport)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'da,en;q=0.8',
        },
      });
    } catch (err) {
      throw importError(`Kunne ikke hente siden: ${err.name === 'TimeoutError' ? 'det tog for lang tid' : err.message}`, 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw importError(`Siden svarede med fejl ${res.status}.`, 502);

    // Læs højst MAX_BYTES.
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw importError('Siden er for stor til at blive importeret.', 413);
      }
      chunks.push(value);
    }
    return { url: url.href, html: Buffer.concat(chunks).toString('utf8') };
  }
  throw importError('Linket viderestiller for mange gange.', 502);
}

/* ---------- Udtræk af opskriften ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aelig: 'æ', oslash: 'ø', aring: 'å', AElig: 'Æ', Oslash: 'Ø', Aring: 'Å', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const text = (s) => decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function isRecipeType(node) {
  const t = node?.['@type'];
  return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
}

/** Finder første Recipe i et JSON-LD-objekt (også inde i @graph, lister m.m.). */
function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isRecipeType(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function fromJsonLd(html) {
  const re = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      try {
        // Nogle sider har linjeskift inde i strenge.
        data = JSON.parse(m[1].trim().replace(/[\r\n\t]+/g, ' '));
      } catch {
        continue;
      }
    }
    const recipe = findRecipe(data);
    if (recipe) return recipe;
  }
  return null;
}

/** Simpel reserve for sider med microdata (itemprop="recipeIngredient"). */
function fromMicrodata(html) {
  const grab = (prop) =>
    [...html.matchAll(new RegExp(`<([a-z0-9]+)[^>]*itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)</\\1>`, 'gi'))].map((m) => text(m[2]));
  const ingredients = [...grab('recipeIngredient'), ...grab('ingredients')].filter(Boolean);
  if (!ingredients.length) return null;
  const meta = (prop) => html.match(new RegExp(`itemprop=["']${prop}["'][^>]*content=["']([^"']+)`, 'i'))?.[1];
  return {
    name: grab('name')[0] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    recipeIngredient: ingredients,
    recipeInstructions: grab('recipeInstructions'),
    recipeYield: meta('recipeYield') ?? grab('recipeYield')[0],
    totalTime: meta('totalTime'),
    description: meta('description') ?? grab('description')[0],
  };
}

/** "PT1H30M" -> 90 */
export function parseDuration(v) {
  if (!v) return 0;
  const m = String(v).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
}

function parseServings(v) {
  const first = Array.isArray(v) ? v.find((x) => /\d/.test(String(x))) ?? v[0] : v;
  const n = String(first ?? '').match(/\d+/);
  return n ? Number(n[0]) : null;
}

function flattenInstructions(v) {
  if (!v) return [];
  if (typeof v === 'string') {
    // En lang tekst – del i linjer/afsnit.
    return decodeEntities(v)
      .split(/<\/?(?:p|li|br)[^>]*>|\n+/i)
      .map(text)
      .filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(flattenInstructions);
  if (typeof v === 'object') {
    if (v.itemListElement) return flattenInstructions(v.itemListElement);
    return flattenInstructions(v.text ?? v.name ?? '');
  }
  return [];
}

function parseProtein(nutrition) {
  const v = nutrition?.proteinContent;
  const m = String(v ?? '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** Finder rå opskriftsdata i en HTML-side, eller null. */
export function extractRecipe(html) {
  return fromJsonLd(html) ?? fromMicrodata(html);
}

/**
 * Laver et opskriftsudkast til appen ud fra en HTML-side.
 * Returnerer { recipe, warnings }. Udkastet gemmes ikke – brugeren skal godkende det.
 */
export function recipeDraftFromHtml(html, sourceUrl) {
  const raw = extractRecipe(html);
  if (!raw) {
    throw importError(
      'Kunne ikke finde en opskrift på siden. Siden skal indeholde struktureret opskriftsdata (schema.org/Recipe), som de fleste opskriftssider har.',
      422,
    );
  }

  const warnings = [];
  const lines = (Array.isArray(raw.recipeIngredient) ? raw.recipeIngredient : raw.recipeIngredient ? [raw.recipeIngredient] : raw.ingredients ?? [])
    .map(text)
    .filter(Boolean);
  if (!lines.length) throw importError('Opskriften på siden har ingen ingredienser.', 422);

  const servings = parseServings(raw.recipeYield);
  if (!servings) warnings.push('Antal portioner stod ikke på siden – sat til 4.');

  let proteinTotal = 0;
  const ingredients = [];
  for (const line of lines) {
    const { ingredient, proteinGrams, notes } = ingredientFromLine(line);
    ingredients.push(ingredient);
    proteinTotal += proteinGrams;
    warnings.push(...notes);
  }

  const portions = servings ?? 4;
  let proteinPerServing = parseProtein(raw.nutrition);
  if (proteinPerServing == null) {
    proteinPerServing = Math.round(proteinTotal / portions);
    warnings.push(`Protein pr. portion er et skøn (${proteinPerServing} g) ud fra de kendte ingredienser.`);
  }

  const keywords = (Array.isArray(raw.keywords) ? raw.keywords : String(raw.keywords ?? '').split(','))
    .concat(raw.recipeCategory ?? [])
    .map(text)
    .filter(Boolean)
    .slice(0, 5);

  return {
    recipe: {
      name: text(raw.name) || 'Importeret opskrift',
      description: text(raw.description).slice(0, 400),
      servings: portions,
      timeMinutes: parseDuration(raw.totalTime) || parseDuration(raw.cookTime) + parseDuration(raw.prepTime),
      proteinPerServing,
      tags: [...new Set(keywords.map((k) => k.toLowerCase()))],
      ingredients,
      steps: flattenInstructions(raw.recipeInstructions),
      sourceUrl,
    },
    warnings,
  };
}

export async function importRecipeFromUrl(url, opts) {
  const page = await fetchPage(url, opts);
  return recipeDraftFromHtml(page.html, page.url);
}
