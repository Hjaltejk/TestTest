import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  containsWordStart,
  offerMatchesIngredient,
  bestOfferForIngredient,
  evaluateRecipe,
  rankRecipes,
  collectSearchTerms,
} from '../src/matcher.js';
import { toBase } from '../src/units.js';
import { normalizeTjekOffer } from '../src/providers/tjek.js';
import { loadSampleOffers } from '../src/providers/sample.js';
import { sanitizeRecipe } from '../src/recipes.js';

const offer = (o) => ({ id: Math.random().toString(36), store: 'Netto', ...o });

test('enheder omregnes til basisenhed', () => {
  assert.deepEqual(toBase(500, 'g'), { dim: 'mass', qty: 0.5 });
  assert.deepEqual(toBase(2, 'dl'), { dim: 'volume', qty: 0.2 });
  assert.equal(toBase(0, 'g'), null);
  assert.equal(toBase(1, 'spsk'), null);
});

test('søgeord matcher kun i starten af et ord', () => {
  assert.ok(containsWordStart('æg fra fritgående høns', 'æg'));
  assert.ok(!containsWordStart('kyllingepålæg', 'æg'));
  assert.ok(!containsWordStart('rødløg', 'løg'));
  assert.ok(containsWordStart('danske kyllingebryst', 'kyllingebryst'));
});

test('udelukkede ord forhindrer match', () => {
  const laks = { name: 'Laks', amount: 500, unit: 'g', match: ['laks'], exclude: ['røget'] };
  assert.ok(offerMatchesIngredient(offer({ title: 'Laksefilet' }), laks));
  assert.ok(!offerMatchesIngredient(offer({ title: 'Røget laks' }), laks));
});

test('vælger det billigste tilbud pr. kg og beregner antal pakker', () => {
  const ing = { name: 'Kyllingebryst', amount: 800, unit: 'g', match: ['kyllingebryst'] };
  const best = bestOfferForIngredient(ing, [
    offer({ title: 'Kyllingebryst', price: 50, amount: 400, unit: 'g' }), // 125 kr/kg
    offer({ title: 'Kyllingebryst', price: 79, amount: 900, unit: 'g' }), // ~87,8 kr/kg
    offer({ title: 'Kyllingebryst', price: 10, amount: 1, unit: 'stk' }), // forkert dimension
  ]);
  assert.equal(best.offer.price, 79);
  assert.equal(best.packs, 1);
  assert.ok(Math.abs(best.unitPrice - 87.78) < 0.01);
});

test('tilbud dyrere end normalprisen tæller ikke som tilbud', () => {
  const recipe = {
    servings: 2,
    ingredients: [{ name: 'Ris', amount: 1, unit: 'kg', refPrice: 20, match: ['ris'] }],
  };
  const r = evaluateRecipe(recipe, [offer({ title: 'Ris', price: 30, amount: 1, unit: 'kg' })]);
  assert.equal(r.savings, 0);
  assert.equal(r.coveragePct, 0);
  assert.equal(r.lines[0].offer, null);
  assert.ok(r.lines[0].nonDealOffer);
});

test('basisvarer tælles ikke med i prisen', () => {
  const r = evaluateRecipe(
    { servings: 1, ingredients: [{ name: 'Salt', amount: 1, unit: 'stk', pantry: true }] },
    [],
  );
  assert.equal(r.normalCost, 0);
  assert.equal(r.lines[0].pantry, true);
});

test('opskrift med flere ingredienser på tilbud rangeres højest', () => {
  const recipes = [
    { id: 'a', servings: 4, ingredients: [{ name: 'Laks', amount: 500, unit: 'g', refPrice: 200, match: ['laks'] }] },
    {
      id: 'b',
      servings: 4,
      ingredients: [
        { name: 'Kylling', amount: 500, unit: 'g', refPrice: 120, match: ['kylling'] },
        { name: 'Ris', amount: 500, unit: 'g', refPrice: 25, match: ['ris'] },
      ],
    },
  ];
  const offers = [
    offer({ title: 'Kyllingebryst', price: 40, amount: 500, unit: 'g' }),
    offer({ title: 'Ris', price: 8, amount: 1, unit: 'kg' }),
  ];
  const [first, second] = rankRecipes(recipes, offers);
  assert.equal(first.recipeId, 'b');
  assert.equal(second.recipeId, 'a');
  assert.equal(first.bestStore.store, 'Netto');
});

test('butiksfilter og udløbne tilbud', () => {
  const recipes = [{ id: 'a', servings: 1, ingredients: [{ name: 'Æg', amount: 10, unit: 'stk', refPrice: 3, match: ['æg'] }] }];
  const offers = [
    offer({ store: 'Lidl', title: 'Æg', price: 15, amount: 10, unit: 'stk' }),
    offer({ store: 'Netto', title: 'Æg', price: 10, amount: 10, unit: 'stk', validTo: '2000-01-01' }),
  ];
  assert.equal(rankRecipes(recipes, offers)[0].savings, 15);
  assert.equal(rankRecipes(recipes, offers, { excludeStores: ['lidl'] })[0].savings, 0);
  assert.equal(rankRecipes(recipes, offers, { stores: ['Netto'] })[0].savings, 0);
});

test('normaliserer Tjek-tilbud', () => {
  const o = normalizeTjekOffer({
    id: 'x1',
    heading: 'Hakket oksekød',
    pricing: { price: 40, pre_price: 55 },
    quantity: { unit: { symbol: 'g' }, size: { from: 500 }, pieces: { from: 2 } },
    branding: { name: 'Netto' },
    run_from: '2026-11-09T00:00:00+0100',
    run_till: '2026-11-15T23:59:59+0100',
  });
  assert.equal(o.store, 'Netto');
  assert.equal(o.amount, 1000);
  assert.equal(o.unit, 'g');
  assert.equal(o.price, 40);
});

test('validering af opskrifter', () => {
  assert.throws(() => sanitizeRecipe({ name: '', ingredients: [] }), /navn/);
  const r = sanitizeRecipe({
    name: 'Test',
    ingredients: [{ name: 'Æg', amount: '4', unit: 'Stk', match: 'æg, økologiske æg' }],
    steps: 'Trin 1\n\nTrin 2',
  });
  assert.equal(r.ingredients[0].unit, 'stk');
  assert.deepEqual(r.ingredients[0].match, ['æg', 'økologiske æg']);
  assert.deepEqual(r.steps, ['Trin 1', 'Trin 2']);
});

test('de 10 testopskrifter er gyldige og finder tilbud i demo-data', async () => {
  const recipes = JSON.parse(await readFile(new URL('../data/recipes.json', import.meta.url), 'utf8'));
  assert.equal(recipes.length, 10);
  for (const r of recipes) {
    assert.deepEqual(sanitizeRecipe(r), r, `${r.name} skal være gyldig`);
    assert.ok(r.proteinPerServing >= 30, `${r.name} skal være proteinrig`);
  }
  const offers = await loadSampleOffers(new URL('../data/sample-offers.json', import.meta.url));
  const ranking = rankRecipes(recipes, offers);
  for (const r of ranking) assert.ok(r.savings > 0, `${r.recipe.name} bør have mindst ét tilbud`);
  // Fælder i demo-data må ikke matche
  const titles = ranking.flatMap((r) => r.lines.filter((l) => l.offer).map((l) => l.offer.title));
  for (const bad of ['Kyllingepålæg', 'Røget laks', 'Rødløg', 'Risengrød']) {
    assert.ok(!titles.includes(bad), `"${bad}" må ikke matche`);
  }
  assert.ok(collectSearchTerms(recipes).length > 20);
});
