// Henter tilbud fra Tjek (tidligere eTilbudsavis), som samler tilbudsaviserne fra
// de store danske kæder: Netto, Føtex, Bilka, REMA 1000, Lidl, Coop 365, Kvickly,
// SuperBrugsen, Meny, Spar, Løvbjerg m.fl.
//
// I stedet for at downloade hver avis side for side søger vi direkte på de
// ingredienser, opskrifterne bruger. Det er langt hurtigere og giver de samme tilbud.

const API = process.env.TJEK_API_URL ?? 'https://squid-api.tjek.com/v2';

/** Omsætter et rå Tjek-tilbud til appens fælles tilbudsformat. */
export function normalizeTjekOffer(raw) {
  const q = raw.quantity ?? {};
  const unit = q.unit?.symbol ?? null;
  const size = q.size?.from ?? null;
  const pieces = q.pieces?.from ?? 1;
  let amount = null;
  let unitOut = unit;
  if (unit && size) {
    amount = size * (pieces || 1);
  } else if (pieces) {
    amount = pieces;
    unitOut = 'stk';
  }
  return {
    id: `tjek:${raw.id}`,
    source: 'tjek',
    store: raw.branding?.name ?? raw.dealer?.name ?? 'Ukendt butik',
    title: raw.heading ?? '',
    description: raw.description ?? '',
    price: raw.pricing?.price ?? null,
    prePrice: raw.pricing?.pre_price ?? null,
    amount,
    unit: unitOut,
    validFrom: raw.run_from ?? null,
    validTo: raw.run_till ?? null,
    image: raw.images?.thumb ?? null,
  };
}

async function searchOnce(term, { lat, lng, radius, limit, apiKey, signal }) {
  const url = new URL(`${API}/offers/search`);
  url.searchParams.set('query', term);
  url.searchParams.set('r_lat', String(lat));
  url.searchParams.set('r_lng', String(lng));
  url.searchParams.set('r_radius', String(radius));
  url.searchParams.set('limit', String(limit));
  const headers = { accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`Tjek svarede ${res.status} for "${term}"`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Søger efter tilbud for alle søgeord. Kører nogle få forespørgsler ad gangen.
 */
export async function fetchTjekOffers(terms, config = {}) {
  const opts = {
    lat: config.lat ?? 55.6761, // København
    lng: config.lng ?? 12.5683,
    radius: config.radius ?? 20000,
    limit: config.limit ?? 50,
    apiKey: config.apiKey ?? process.env.TJEK_API_KEY,
    signal: config.signal,
  };
  const concurrency = config.concurrency ?? 4;
  const byId = new Map();
  const errors = [];
  let i = 0;

  async function worker() {
    while (i < terms.length) {
      const term = terms[i++];
      try {
        for (const raw of await searchOnce(term, opts)) {
          const offer = normalizeTjekOffer(raw);
          if (offer.price != null) byId.set(offer.id, offer);
        }
      } catch (err) {
        errors.push(err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, terms.length) }, worker));

  if (byId.size === 0 && errors.length) {
    throw new Error(`Kunne ikke hente tilbud fra Tjek: ${errors[0]}`);
  }
  return { offers: [...byId.values()], errors };
}
