// Enheder normaliseres til en "basisenhed" pr. dimension:
//   masse  -> kg
//   volumen -> l
//   antal  -> stk
// Normalpriser på ingredienser angives altid pr. basisenhed (kr/kg, kr/l eller kr/stk).

const UNITS = {
  g: { dim: 'mass', factor: 0.001 },
  kg: { dim: 'mass', factor: 1 },
  ml: { dim: 'volume', factor: 0.001 },
  cl: { dim: 'volume', factor: 0.01 },
  dl: { dim: 'volume', factor: 0.1 },
  l: { dim: 'volume', factor: 1 },
  stk: { dim: 'count', factor: 1 },
};

export const SUPPORTED_UNITS = Object.keys(UNITS);

export const BASE_UNIT = { mass: 'kg', volume: 'l', count: 'stk' };

export function normalizeUnitSymbol(unit) {
  if (!unit) return null;
  const u = String(unit).trim().toLowerCase().replace(/\.$/, '');
  const aliases = { gram: 'g', kilo: 'kg', liter: 'l', ltr: 'l', styk: 'stk', stk: 'stk', pcs: 'stk', piece: 'stk', pc: 'stk' };
  const n = aliases[u] ?? u;
  return UNITS[n] ? n : null;
}

/** Omregner en mængde til basisenhed. Returnerer { dim, qty } eller null. */
export function toBase(amount, unit) {
  const u = UNITS[normalizeUnitSymbol(unit)];
  const n = Number(amount);
  if (!u || !Number.isFinite(n) || n <= 0) return null;
  return { dim: u.dim, qty: n * u.factor };
}

export function baseUnitFor(unit) {
  const u = UNITS[normalizeUnitSymbol(unit)];
  return u ? BASE_UNIT[u.dim] : null;
}
