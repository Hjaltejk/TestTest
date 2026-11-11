import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseIngredientLine, ingredientFromLine, lookupIngredient } from '../src/ingredients.js';
import { recipeDraftFromHtml, fetchPage, isPrivateAddress, parseDuration, decodeEntities } from '../src/importer.js';
import { sanitizeRecipe } from '../src/recipes.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('fortolker danske ingredienslinjer', () => {
  const cases = [
    ['500 g hakket oksekød', 500, 'g', 'Hakket oksekød'],
    ['1,5 kg kartofler', 1.5, 'kg', 'Kartofler'],
    ['2 spsk olivenolie', 30, 'ml', 'Olivenolie'],
    ['½ tsk salt', 2.5, 'ml', 'Salt'],
    ['1 dåse hakkede tomater (400 g)', 400, 'g', 'Hakkede tomater'],
    ['2 dåser kikærter', 800, 'g', 'Kikærter'],
    ['2 kyllingebryst (ca. 300 g)', 300, 'g', 'Kyllingebryst'],
    ['3 æg', 3, 'stk', 'Æg'],
    ['1 løg, finthakket', 1, 'stk', 'Løg'],
    ['2-3 fed hvidløg', 2, 'stk', 'Hvidløg'],
    ['1 1/2 dl fløde', 1.5, 'dl', 'Fløde'],
    ['salt og peber', null, null, 'Salt og peber'],
  ];
  for (const [line, amount, unit, name] of cases) {
    const p = parseIngredientLine(line);
    assert.equal(p.amount, amount, `${line}: mængde`);
    assert.equal(p.unit, unit, `${line}: enhed`);
    assert.equal(p.name, name, `${line}: navn`);
  }
});

test('slår ingredienser op – længste navn vinder', () => {
  assert.deepEqual(lookupIngredient('hakkede tomater').keys, ['hakkede tomater', 'flåede tomater', 'tomater på dåse']);
  assert.ok(lookupIngredient('Kyllingebrystfilet').keys.includes('kyllingebryst'));
  assert.ok(lookupIngredient('Hytteost 1,5%').keys.includes('hytteost'));
  assert.equal(lookupIngredient('hvidløg'), null, 'hvidløg må ikke blive til løg');
});

test('laver ingredienser med normalpris, søgeord og omregning', () => {
  const kylling = ingredientFromLine('2 kyllingebryst');
  assert.equal(kylling.ingredient.amount, 300);
  assert.equal(kylling.ingredient.unit, 'g');
  assert.equal(kylling.ingredient.refPrice, 130);
  assert.ok(kylling.ingredient.match.includes('kyllingebryst'));
  assert.ok(kylling.notes.some((n) => n.includes('omregnet')));
  assert.ok(kylling.proteinGrams > 60);

  const floede = ingredientFromLine('2 dl madlavningsfløde');
  assert.deepEqual([floede.ingredient.amount, floede.ingredient.unit], [200, 'ml']);

  assert.equal(ingredientFromLine('2 spsk olivenolie').ingredient.pantry, true);
  assert.equal(ingredientFromLine('1 tsk kyllingebouillon').ingredient.pantry, true);
  assert.equal(ingredientFromLine('salt og friskkværnet peber').ingredient.pantry, true);
  assert.equal(ingredientFromLine('1 melon').ingredient.pantry, false, 'melon er ikke mel');

  const ukendt = ingredientFromLine('200 g halloumi');
  assert.equal(ukendt.ingredient.refPrice, 0);
  assert.ok(ukendt.notes[0].includes('ikke kendt'));
});

test('importerer JSON-LD i @graph (WordPress-opskriftsplugins)', async () => {
  const { recipe, warnings } = recipeDraftFromHtml(await fixture('jsonld-graph.html'), 'https://madblog.example/kyllingegryde');
  assert.equal(recipe.name, 'Kyllingegryde med kikærter & spinat');
  assert.equal(recipe.servings, 4);
  assert.equal(recipe.timeMinutes, 45);
  assert.equal(recipe.sourceUrl, 'https://madblog.example/kyllingegryde');
  assert.deepEqual(recipe.steps, [
    'Skær kyllingen i tern og brun den i olien.',
    'Tilsæt løg, hvidløg og spidskommen.',
    'Tilsæt tomater, kikærter og fløde, og lad det simre i 20 minutter.',
    'Vend spinaten i lige før servering.',
  ]);
  const byName = Object.fromEntries(recipe.ingredients.map((i) => [i.name, i]));
  assert.equal(byName['Kyllingebryst'].amount, 600);
  assert.equal(byName['Kikærter'].amount, 240);
  assert.equal(byName['Hakkede tomater'].amount, 800);
  assert.equal(byName['Hvidløg'].pantry, true);
  assert.equal(byName['Olivenolie'].pantry, true);
  assert.equal(byName['Chiliflager'].pantry, true);
  assert.equal(byName['Madlavningsfløde'].unit, 'ml');
  assert.ok(recipe.proteinPerServing >= 30, `protein: ${recipe.proteinPerServing}`);
  assert.ok(warnings.some((w) => w.includes('skøn')));
  assert.ok(recipe.tags.includes('kylling'));
  // Udkastet skal kunne gemmes, som det er.
  assert.doesNotThrow(() => sanitizeRecipe(recipe));
  assert.equal(sanitizeRecipe(recipe).sourceUrl, 'https://madblog.example/kyllingegryde');
});

test('importerer microdata', async () => {
  const { recipe } = recipeDraftFromHtml(await fixture('microdata.html'), 'https://example.test/laks');
  assert.equal(recipe.name, 'Laks i ovn med citron');
  assert.equal(recipe.servings, 2);
  assert.equal(recipe.timeMinutes, 25);
  assert.equal(recipe.ingredients.find((i) => i.name === 'Laksefileter').amount, 250);
  assert.deepEqual(recipe.steps, ['Bag laksen ved 200 grader i 15 minutter.']);
});

test('giver en forståelig fejl, når siden ikke har en opskrift', async () => {
  const html = await fixture('no-recipe.html');
  assert.throws(() => recipeDraftFromHtml(html, 'https://example.test/'), /Kunne ikke finde en opskrift/);
});

test('hjælpefunktioner', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration(''), 0);
  assert.equal(decodeEntities('R&oslash;dgr&oslash;d &amp; fl&#248;de &#x2013; godt'), 'Rødgrød & fløde – godt');
});

test('nægter lokale og private adresser', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '2a00:1450::1']) assert.ok(!isPrivateAddress(ip), ip);
  await assert.rejects(fetchPage('http://127.0.0.1:3000/'), /lokal adresse/);
  await assert.rejects(fetchPage('file:///etc/passwd'), /http/);
  await assert.rejects(fetchPage('ikke et link'), /gyldigt link/);
});

test('følger viderestillinger og tjekker hver adresse', async () => {
  const checked = [];
  const responses = {
    'https://a.example/opskrift': new Response(null, { status: 301, headers: { location: 'https://b.example/ny' } }),
    'https://b.example/ny': new Response('<html>ok</html>', { status: 200 }),
  };
  const page = await fetchPage('https://a.example/opskrift', {
    checkHost: async (u) => checked.push(u.href),
    fetchImpl: async (u) => responses[u.href],
  });
  assert.equal(page.url, 'https://b.example/ny');
  assert.equal(page.html, '<html>ok</html>');
  assert.deepEqual(checked, ['https://a.example/opskrift', 'https://b.example/ny']);

  // Viderestilling til en lokal adresse afvises.
  await assert.rejects(
    fetchPage('https://a.example/x', {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
      checkHost: async (u) => {
        if (u.hostname === '127.0.0.1') throw new Error('Linket peger på en lokal adresse og kan ikke hentes.');
      },
    }),
    /lokal adresse/,
  );
});
