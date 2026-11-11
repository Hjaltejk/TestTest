// Demo-tilbud, der bruges når appen ikke kan nå en rigtig tilbudskilde
// (fx uden internet) eller når OFFER_SOURCE=sample. Gyldighedsperioden sættes
// til den aktuelle uge, så demoen altid "virker".

import { readFile } from 'node:fs/promises';

export async function loadSampleOffers(file, now = new Date()) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return raw.map((o, idx) => ({
    id: `sample:${idx + 1}`,
    source: 'sample',
    validFrom: monday.toISOString(),
    validTo: sunday.toISOString(),
    ...o,
  }));
}
