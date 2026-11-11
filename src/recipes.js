// Opskrifter gemmes i en simpel JSON-fil.

import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { SUPPORTED_UNITS, normalizeUnitSymbol } from './units.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(str).filter(Boolean);

/** Validerer og renser en opskrift. Kaster en fejl med dansk besked ved ugyldigt input. */
export function sanitizeRecipe(input) {
  const errors = [];
  const name = str(input?.name);
  if (!name) errors.push('Opskriften skal have et navn.');

  const ingredients = (Array.isArray(input?.ingredients) ? input.ingredients : []).map((ing, i) => {
    const n = str(ing?.name);
    const unit = normalizeUnitSymbol(ing?.unit);
    const amount = Number(ing?.amount);
    if (!n) errors.push(`Ingrediens ${i + 1} mangler et navn.`);
    if (!unit) errors.push(`Ingrediens "${n || i + 1}" har en ugyldig enhed (brug ${SUPPORTED_UNITS.join(', ')}).`);
    if (!(amount > 0)) errors.push(`Ingrediens "${n || i + 1}" skal have en mængde over 0.`);
    return {
      name: n,
      amount,
      unit,
      refPrice: Math.max(0, Number(ing?.refPrice) || 0),
      match: list(ing?.match),
      exclude: list(ing?.exclude),
      pantry: Boolean(ing?.pantry),
    };
  });
  if (!ingredients.length) errors.push('Opskriften skal have mindst én ingrediens.');

  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }

  return {
    id: str(input.id) || randomUUID(),
    name,
    description: str(input.description),
    servings: Math.max(1, Math.round(Number(input.servings) || 4)),
    timeMinutes: Math.max(0, Math.round(Number(input.timeMinutes) || 0)),
    proteinPerServing: Math.max(0, Number(input.proteinPerServing) || 0),
    tags: list(input.tags),
    ingredients,
    steps: list(Array.isArray(input.steps) ? input.steps : str(input.steps).split('\n')),
  };
}

export function createRecipeStore(file) {
  let cache = null;

  async function all() {
    if (!cache) {
      try {
        cache = JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        cache = [];
      }
    }
    return cache;
  }

  async function save() {
    await writeFile(file, JSON.stringify(cache, null, 2) + '\n');
  }

  return {
    all,
    async get(id) {
      return (await all()).find((r) => r.id === id) ?? null;
    },
    async create(input) {
      const recipe = sanitizeRecipe({ ...input, id: undefined });
      (await all()).push(recipe);
      await save();
      return recipe;
    },
    async update(id, input) {
      const recipes = await all();
      const idx = recipes.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      recipes[idx] = sanitizeRecipe({ ...input, id });
      await save();
      return recipes[idx];
    },
    async remove(id) {
      const recipes = await all();
      const idx = recipes.findIndex((r) => r.id === id);
      if (idx === -1) return false;
      recipes.splice(idx, 1);
      await save();
      return true;
    },
  };
}
