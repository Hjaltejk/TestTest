import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecipeStore } from './src/recipes.js';
import { createOfferService } from './src/offers.js';
import { rankRecipes, DEFAULT_ORGANIC_LEVEL } from './src/matcher.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);

const recipes = createRecipeStore(process.env.RECIPES_FILE ?? join(ROOT, 'data', 'recipes.json'));
const offerService = createOfferService({
  cacheFile: join(ROOT, 'data', 'offers-cache.json'),
  sampleFile: join(ROOT, 'data', 'sample-offers.json'),
  location: {
    lat: process.env.LAT ? Number(process.env.LAT) : undefined,
    lng: process.env.LNG ? Number(process.env.LNG) : undefined,
    radius: process.env.RADIUS ? Number(process.env.RADIUS) : undefined,
  },
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1e6) throw Object.assign(new Error('For stor forespørgsel.'), { status: 413 });
  }
  try {
    return JSON.parse(data || '{}');
  } catch {
    throw Object.assign(new Error('Ugyldig JSON.'), { status: 400 });
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id] = parts;

  if (resource === 'recipes') {
    if (req.method === 'GET' && !id) return send(res, 200, await recipes.all());
    if (req.method === 'GET') {
      const r = await recipes.get(id);
      return r ? send(res, 200, r) : send(res, 404, { error: 'Opskriften findes ikke.' });
    }
    if (req.method === 'POST' && !id) return send(res, 201, await recipes.create(await readJson(req)));
    if (req.method === 'PUT' && id) {
      const r = await recipes.update(id, await readJson(req));
      return r ? send(res, 200, r) : send(res, 404, { error: 'Opskriften findes ikke.' });
    }
    if (req.method === 'DELETE' && id) {
      return (await recipes.remove(id)) ? send(res, 204, {}) : send(res, 404, { error: 'Opskriften findes ikke.' });
    }
  }

  if (resource === 'offers' && req.method === 'GET') {
    const data = await offerService.getOffers(await recipes.all(), { force: url.searchParams.has('refresh') });
    return send(res, 200, data);
  }

  if (resource === 'ranking' && req.method === 'GET') {
    const all = await recipes.all();
    const data = await offerService.getOffers(all, { force: url.searchParams.has('refresh') });
    const csv = (k) => (url.searchParams.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ranking = rankRecipes(all, data.offers, {
      stores: csv('stores'),
      excludeStores: csv('exclude'),
      sort: url.searchParams.get('sort') ?? 'score',
      organic: [0, 1, 2].includes(Number(url.searchParams.get('organic')))
        ? Number(url.searchParams.get('organic'))
        : DEFAULT_ORGANIC_LEVEL,
    });
    const allStores = [...new Set(data.offers.map((o) => o.store))].sort((a, b) => a.localeCompare(b, 'da'));
    return send(res, 200, {
      source: data.source,
      fetchedAt: data.fetchedAt,
      warnings: data.warnings ?? [],
      offerCount: data.offers.length,
      stores: allStores,
      ranking,
    });
  }

  send(res, 404, { error: 'Ukendt endpoint.' });
}

async function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbudt.' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Ikke fundet');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    send(res, err.status ?? 500, { error: err.message ?? 'Der skete en fejl.' });
  }
});

server.listen(PORT, () => {
  console.log(`Tilbudskøkkenet kører på http://localhost:${PORT}`);
});
