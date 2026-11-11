// Samler tilbud fra den valgte kilde og cacher dem på disk.

import { readFile, writeFile } from 'node:fs/promises';
import { fetchTjekOffers } from './providers/tjek.js';
import { loadSampleOffers } from './providers/sample.js';
import { collectSearchTerms } from './matcher.js';

const CACHE_HOURS = Number(process.env.OFFER_CACHE_HOURS ?? 6);

export function createOfferService({ cacheFile, sampleFile, source = process.env.OFFER_SOURCE ?? 'auto', location = {} }) {
  let memory = null;

  async function readCache() {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8'));
    } catch {
      return null;
    }
  }

  async function fetchFresh(recipes) {
    const terms = collectSearchTerms(recipes);
    const fetchedAt = new Date().toISOString();

    if (source === 'tjek' || source === 'auto') {
      try {
        const { offers, errors } = await fetchTjekOffers(terms, location);
        return { source: 'tjek', fetchedAt, offers, warnings: errors, terms };
      } catch (err) {
        if (source === 'tjek') throw err;
        const offers = await loadSampleOffers(sampleFile);
        return {
          source: 'sample',
          fetchedAt,
          offers,
          warnings: [`${err.message} – viser demo-tilbud i stedet.`],
          terms,
        };
      }
    }
    return { source: 'sample', fetchedAt, offers: await loadSampleOffers(sampleFile), warnings: [], terms };
  }

  /**
   * Returnerer tilbud. Henter nye, hvis cachen er for gammel, hvis opskrifterne
   * kræver søgeord der ikke er hentet endnu, eller hvis force=true.
   */
  async function getOffers(recipes, { force = false } = {}) {
    memory ??= await readCache();
    const terms = collectSearchTerms(recipes);
    const ageH = memory ? (Date.now() - new Date(memory.fetchedAt).getTime()) / 36e5 : Infinity;
    const missingTerms = memory?.source === 'tjek' && terms.some((t) => !memory.terms?.includes(t));

    if (force || !memory || ageH > CACHE_HOURS || missingTerms) {
      memory = await fetchFresh(recipes);
      await writeFile(cacheFile, JSON.stringify(memory, null, 2)).catch(() => {});
    }
    return memory;
  }

  return { getOffers };
}
