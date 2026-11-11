/* =========================================================================
   Tilbudskøkkenet – brugerflade
   ========================================================================= */

/* ---------- Hjælpere ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf2 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 });
const kr = (n) => (n == null ? '–' : `${nf2.format(n)} kr.`);
const krShort = (n) => (n == null ? '–' : Math.abs(n) >= 100 ? `${nf0.format(n)} kr.` : `${nf2.format(n)} kr.`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : '');
const BASE = { g: 'kg', kg: 'kg', ml: 'l', dl: 'l', cl: 'l', l: 'l', stk: 'stk' };
const FACTOR = { g: 0.001, ml: 0.001, dl: 0.1, cl: 0.01 };
const ORGANIC_RE = /(?<!\p{L})(øko|økologisk|økologiske|organic)(?!\p{L})/iu;
const isOrganic = (o) => ORGANIC_RE.test(`${o.title} ${o.description ?? ''}`);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`tk.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`tk.${key}`, JSON.stringify(value));
    } catch {}
  },
};

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Noget gik galt (${res.status}).`);
  return body;
}

function relTime(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'lige nu';
  if (min < 60) return `for ${min} min. siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `for ${h} ${h === 1 ? 'time' : 'timer'} siden`;
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

function unitPrice(o) {
  const base = BASE[o.unit];
  if (!o.amount || !base) return null;
  return { value: o.price / (o.amount * (FACTOR[o.unit] ?? 1)), base };
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/* ---------- Ikoner (stregikoner, 24×24) ---------- */
const ICONS = {
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.5-2.3-5.6-4-7.7-.5 2.2-1.6 3.4-2.9 3.9.3-3.3-1-6.3-3.6-8.4C8.6 6.6 5 9.4 5 15.2 5 19.3 8 22 12 22z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M10 20v-5h4v5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- Butiksfarver ---------- */
const STORE_COLORS = {
  netto: '#f5c400', 'rema 1000': '#0b3b8f', lidl: '#0050aa', føtex: '#00205b', bilka: '#0071ce',
  'coop 365': '#e2001a', meny: '#c8102e', kvickly: '#d6001c', superbrugsen: '#e30613', spar: '#00843d',
  løvbjerg: '#e4002b', "dagli'brugsen": '#e30613', brugsen: '#e30613',
};
const FALLBACK_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
function storeColor(name, hint) {
  if (hint && /^#?[0-9a-f]{3,8}$/i.test(hint)) return hint.startsWith('#') ? hint : `#${hint}`;
  const key = String(name ?? '').toLowerCase();
  if (STORE_COLORS[key]) return STORE_COLORS[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
const storeDot = (name, hint) => `<span class="dot" style="--c:${storeColor(name, hint)}"></span>`;

/* ---------- Score ---------- */
function verdict(score) {
  if (score >= 85) return { label: 'Topkøb', tone: 'top' };
  if (score >= 65) return { label: 'Godt køb', tone: 'good' };
  if (score >= 40) return { label: 'Okay', tone: 'ok' };
  return { label: 'Normalpris', tone: 'low' };
}
function ring(score, size = 44) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = verdict(score);
  return `<span class="ring tone-${v.tone}" style="--s:${size}px" role="img" aria-label="Score ${score} af 100 – ${v.label}">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-val" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - score / 100)}"/>
    </svg><b>${score}</b></span>`;
}

/* ---------- Opskriftsbillede / monogram ---------- */
const TILE_HUES = [145, 25, 200, 280, 340, 45, 175];
function thumbFor(recipe, cls = '') {
  let h = 0;
  for (const c of recipe.name ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letter = esc(recipe.name?.[0] ?? '?');
  const hue = TILE_HUES[h % TILE_HUES.length];
  if (recipe.image) {
    return `<span class="rthumb ${cls}" style="--h:${hue}"><img src="${esc(recipe.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()"><i>${letter}</i></span>`;
  }
  return `<span class="rthumb noimg ${cls}" style="--h:${hue}"><i>${letter}</i></span>`;
}

/* ---------- Toasts ---------- */
function toast(message, tone = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `${icon(tone === 'error' ? 'info' : 'check')}<span>${esc(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

/* =========================================================================
   Tilstand
   ========================================================================= */
const state = {
  route: 'ranking',
  recipes: [],
  ranking: null,
  offers: null,
  offerById: new Map(),
  excluded: new Set(store.get('excludedStores', [])),
  sort: store.get('sort', 'score'),
  organic: String(store.get('organic', '1')),
  offerQuery: '',
  offerStore: '',
  recipeQuery: '',
  loading: false,
};

/* =========================================================================
   Navigation (hash-baseret, så tilbage-knappen virker)
   ========================================================================= */
const ROUTES = { '': 'ranking', '#/': 'ranking', '#/opskrifter': 'recipes', '#/tilbud': 'offers' };

function route() {
  state.route = ROUTES[location.hash] ?? 'ranking';
  for (const v of ['ranking', 'recipes', 'offers']) $(`#view-${v}`).hidden = v !== state.route;
  $$('.nav a').forEach((a) => (a.dataset.route === state.route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (state.route === 'ranking') state.ranking ? renderRanking() : loadRanking();
  if (state.route === 'recipes') renderRecipes();
  if (state.route === 'offers') loadOffers();
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

/* =========================================================================
   I DAG – rangering
   ========================================================================= */
async function loadRanking({ refresh = false } = {}) {
  state.loading = true;
  renderRanking();
  try {
    const params = new URLSearchParams({ sort: state.sort, organic: state.organic });
    if (refresh) params.set('refresh', '1');
    if (state.excluded.size) params.set('exclude', [...state.excluded].join(','));
    const data = await api(`/api/ranking?${params}`);
    for (const r of data.ranking) for (const l of r.lines) if (l.offer) state.offerById.set(l.offer.id, l.offer);
    state.ranking = data;
    if (refresh) {
      state.offers = null;
      toast(`${data.offerCount} tilbud hentet`);
    }
  } catch (err) {
    state.ranking = { error: err.message };
  } finally {
    state.loading = false;
    if (state.route === 'ranking') renderRanking();
  }
}

function segmented(name, value, options, label, prefix = '') {
  return `<div class="seg" role="radiogroup" aria-label="${esc(label)}" data-seg="${name}">
    ${prefix ? `<span class="seg-label" aria-hidden="true">${prefix}</span>` : ''}
    ${options
      .map(
        ([v, text, title]) =>
          `<button type="button" role="radio" aria-checked="${v === value}" tabindex="${v === value ? 0 : -1}" data-value="${esc(v)}"${title ? ` title="${esc(title)}"` : ''}>${text}</button>`,
      )
      .join('')}
  </div>`;
}

function statusLine(data) {
  if (!data?.fetchedAt) return '';
  const sample = data.source === 'sample';
  const reason = (data.warnings ?? [])[0];
  return `<div class="status">
    ${sample ? `<span class="pill pill-warn" title="${esc(reason ?? '')}">${icon('info')}Eksempeldata</span>` : '<span class="live" aria-hidden="true"></span>'}
    <span>${nf0.format(data.offerCount)} tilbud · ${data.stores.length} butikker · ${relTime(data.fetchedAt)}</span>
    <button type="button" class="icon-btn" id="refresh" title="Hent nye tilbud" aria-label="Hent nye tilbud" ${state.loading ? 'disabled' : ''}>${icon('refresh', state.loading ? 'spin' : '')}</button>
  </div>`;
}

function controls(data) {
  const stores = data?.stores ?? [];
  return `<div class="controls">
    <div class="control-row">
      ${segmented('sort', state.sort, [
        ['score', 'Bedst samlet'],
        ['price', 'Billigst'],
        ['protein', 'Protein/kr.'],
        ['savings', 'Største rabat'],
      ], 'Sortér efter')}
      ${segmented('organic', state.organic, [
        ['0', 'Ligegyldigt', 'Økologi giver ingen ekstra point'],
        ['1', 'Lidt', 'Økologisk må koste op til 15 % mere og giver op til +10 point'],
        ['2', 'Meget', 'Økologisk må koste op til 30 % mere og giver op til +20 point'],
      ], 'Hvor meget betyder økologi', `${icon('leaf')}Øko`)}
    </div>
    ${
      stores.length
        ? `<div class="chips" role="group" aria-label="Butikker du handler i">
            <span class="chips-label">Mine butikker</span>
            ${stores
              .map((s) => `<button type="button" class="chip" aria-pressed="${!state.excluded.has(s)}" data-store="${esc(s)}">${storeDot(s)}${esc(s)}</button>`)
              .join('')}
          </div>`
        : ''
    }
  </div>`;
}

function whereText(r) {
  if (!r.stores.length) return 'Ingen af varerne er på tilbud lige nu';
  if (r.stores.length === 1) return `Alle tilbud hos ${storeDot(r.stores[0].store)}<b>${esc(r.stores[0].store)}</b>`;
  return `Mest hos ${storeDot(r.bestStore.store)}<b>${esc(r.bestStore.store)}</b> + ${r.stores.length - 1} ${r.stores.length === 2 ? 'butik' : 'butikker'} mere`;
}

function hero(r) {
  const v = verdict(r.score);
  const onDeal = r.lines.filter((l) => l.offer).length;
  const total = r.lines.filter((l) => !l.pantry).length;
  return `<article class="hero" data-open="${esc(r.recipeId)}" tabindex="0" aria-label="Bedste køb: ${esc(r.recipe.name)}">
    <div class="hero-main">
      <p class="eyebrow"><span class="badge tone-${v.tone}">${v.label}</span>Bedste køb lige nu</p>
      <h2 class="hero-title">${esc(r.recipe.name)}</h2>
      <p class="meta">
        <span>${icon('clock')}${r.recipe.timeMinutes} min.</span>
        <span>${icon('flame')}${r.proteinPerServing} g protein</span>
        <span>${icon('users')}${r.recipe.servings} pers.</span>
        ${r.organicCount ? `<span class="eco-text">${icon('leaf')}${r.organicCount} øko</span>` : ''}
      </p>
      <div class="hero-stats">
        <div><span class="big">${krShort(r.costPerServing)}</span><span class="lbl">pr. portion</span></div>
        <div><span class="big accent">−${nf0.format(r.savingsPct)} %</span><span class="lbl">spar ${krShort(r.savings)}</span></div>
        <div><span class="big">${onDeal}<small>/${total}</small></span><span class="lbl">varer på tilbud</span></div>
      </div>
      <div class="hero-foot">
        <button type="button" class="btn btn-primary btn-lg" data-open="${esc(r.recipeId)}">${icon('cart')}Se indkøbsliste</button>
        <p class="hero-where">${whereText(r)}</p>
      </div>
    </div>
    <div class="hero-side" aria-hidden="true">
      ${thumbFor(r.recipe, 'rthumb-hero')}
      <div class="hero-ring">${ring(r.score, 72)}<small>af 100</small></div>
    </div>
  </article>`;
}

function row(r, i) {
  const v = verdict(r.score);
  return `<li>
    <button type="button" class="rrow" data-open="${esc(r.recipeId)}">
      <span class="rank">${i + 1}</span>
      ${thumbFor(r.recipe)}
      <span class="rrow-main">
        <span class="rrow-title">${esc(r.recipe.name)}</span>
        <span class="rrow-meta">
          <span>${r.recipe.timeMinutes} min.</span><span>${r.proteinPerServing} g protein</span>
          ${r.stores.length ? `<span class="stores">${r.stores.slice(0, 3).map((s) => storeDot(s.store)).join('')}${esc(r.bestStore.store)}${r.stores.length > 1 ? ` +${r.stores.length - 1}` : ''}</span>` : ''}
          ${r.organicCount ? `<span class="eco-text">${icon('leaf')}øko</span>` : ''}
        </span>
      </span>
      <span class="rrow-num"><b>${krShort(r.costPerServing)}</b><small>pr. portion</small></span>
      <span class="rrow-num hide-sm"><b class="accent">${r.savings > 0 ? `−${nf0.format(r.savingsPct)} %` : '–'}</b><small>${r.savings > 0 ? `spar ${krShort(r.savings)}` : 'ingen rabat'}</small></span>
      <span class="rrow-score">${ring(r.score, 40)}<small class="tone-text-${v.tone}">${v.label}</small></span>
    </button>
  </li>`;
}

function skeleton() {
  return `<div class="hero skeleton" aria-hidden="true"><div class="hero-main"><div class="sk w30"></div><div class="sk w70 h32"></div><div class="sk w50"></div><div class="sk w90 h56"></div></div></div>
    <ul class="rlist" aria-hidden="true">${Array.from({ length: 5 }, () => '<li><div class="rrow skeleton"><span class="sk sq"></span><span class="sk w50"></span></div></li>').join('')}</ul>`;
}

function renderRanking() {
  const data = state.ranking;
  const el = $('#view-ranking');
  let body;
  if (!data) {
    body = skeleton();
  } else if (data.error) {
    body = `<div class="empty">${icon('info', 'i-lg')}<h3>Kunne ikke hente tilbud</h3><p>${esc(data.error)}</p><button type="button" class="btn" id="retry">${icon('refresh')}Prøv igen</button></div>`;
  } else if (!data.ranking.length) {
    body = `<div class="empty">${icon('plus', 'i-lg')}<h3>Ingen opskrifter endnu</h3><p>Tilføj dine egne opskrifter – eller hent dem fra et link – så finder vi ud af, hvad der er billigst at lave.</p><a class="btn btn-primary" href="#/opskrifter">${icon('plus')}Tilføj opskrift</a></div>`;
  } else {
    const [first, ...rest] = data.ranking;
    body = `${hero(first)}
      ${rest.length ? `<h3 class="section-title">Også gode bud</h3><ul class="rlist">${rest.map((r, i) => row(r, i + 1)).join('')}</ul>` : ''}
      <p class="foot-note">${icon('info', 'i-sm')}Scoren vægter rabat, hvor meget af indkøbet der er på tilbud, og om du kan nøjes med én butik${state.organic !== '0' ? ' – plus bonus for økologi' : ''}.</p>`;
  }
  const sample = data?.source === 'sample' && data.warnings?.[0];
  el.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Uge ${isoWeek()}</p>
        <h1 id="ranking-title">Hvad skal du lave i dag?</h1>
      </div>
      ${statusLine(data)}
    </div>
    ${sample ? `<p class="sample-note">${icon('info', 'i-sm')}${esc(data.warnings[0])}</p>` : ''}
    ${controls(data)}
    <div class="results ${state.loading && data?.ranking ? 'is-loading' : ''}">${body}</div>`;
}

$('#view-ranking').addEventListener('click', (e) => {
  const seg = e.target.closest('[data-seg] button');
  if (seg) {
    const name = seg.closest('[data-seg]').dataset.seg;
    if (state[name] === seg.dataset.value) return;
    state[name] = seg.dataset.value;
    store.set(name, state[name]);
    loadRanking().then(() => $(`[data-seg="${name}"] [aria-checked="true"]`)?.focus());
    return;
  }
  const chip = e.target.closest('[data-store]');
  if (chip) {
    const s = chip.dataset.store;
    state.excluded.has(s) ? state.excluded.delete(s) : state.excluded.add(s);
    store.set('excludedStores', [...state.excluded]);
    loadRanking().then(() => $(`[data-store="${CSS.escape(s)}"]`)?.focus());
    return;
  }
  if (e.target.closest('#refresh')) return loadRanking({ refresh: true });
  if (e.target.closest('#retry')) return loadRanking();
  const open = e.target.closest('[data-open]');
  if (open) openSheet(open.dataset.open);
});
$('#view-ranking').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.hero')) openSheet(e.target.dataset.open);
  // Piletaster i segmenterede kontroller
  const seg = e.target.closest('[data-seg]');
  if (seg && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    const btns = $$('button', seg);
    const i = btns.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1);
    btns[(i + btns.length) % btns.length]?.click();
  }
});

/* =========================================================================
   Detaljepanel med indkøbsliste pr. butik
   ========================================================================= */
let sheetRecipeId = null;

function openSheet(recipeId) {
  const r = state.ranking?.ranking?.find((x) => x.recipeId === recipeId);
  if (!r) return;
  sheetRecipeId = recipeId;
  renderSheet(r);
  const d = $('#sheet');
  if (!d.open) d.showModal();
  $('#sheet-body').scrollTop = 0;
}

function renderSheet(r) {
  const checked = new Set(store.get(`checked.${r.recipeId}`, []));
  const v = verdict(r.score);
  const groups = new Map();
  for (const l of r.lines) {
    if (l.pantry) continue;
    const key = l.offer ? l.offer.store : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const savingsFor = (s) => r.stores.find((x) => x.store === s)?.savings ?? 0;
  const ordered = [...groups.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : savingsFor(b) - savingsFor(a)));
  const pantry = r.lines.filter((l) => l.pantry).map((l) => l.ingredient.name);
  const item = (l) => {
    const ing = l.ingredient;
    const id = ing.name;
    const amount = `${nf1.format(ing.amount)} ${ing.unit}`;
    const on = checked.has(id);
    const box = `<label class="check"><input type="checkbox" data-check="${esc(id)}" ${on ? 'checked' : ''} aria-label="${esc(ing.name)} købt"><span class="box">${icon('check')}</span></label>`;
    if (l.offer) {
      return `<li class="item ${on ? 'done' : ''}">${box}
        <div class="item-main">
          <span class="item-name">${esc(ing.name)} <small>${esc(amount)}</small></span>
          <button type="button" class="item-offer" data-clip="${esc(l.offer.id)}" title="Se udklip fra avisen">
            ${l.offer.imageThumb ? `<img src="${esc(l.offer.imageThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            <span>${l.organic ? '<span class="eco">Øko</span>' : ''}${esc(l.offer.title)} · ${l.packs} × ${krShort(l.offer.price)}</span>
            ${icon('chevron', 'i-sm')}
          </button>
        </div>
        <span class="item-price"><b>${krShort(l.cost)}</b><small class="accent">−${krShort(l.saving)}</small></span>
      </li>`;
    }
    return `<li class="item ${on ? 'done' : ''}">${box}
      <div class="item-main"><span class="item-name">${esc(ing.name)} <small>${esc(amount)}</small></span>
        <span class="item-sub">Ikke på tilbud${ing.refPrice ? ` · ca. ${krShort(ing.refPrice)}/${BASE[ing.unit]}` : ''}</span></div>
      <span class="item-price"><b>${krShort(l.cost)}</b></span>
    </li>`;
  };
  const host = hostOf(r.recipe.sourceUrl);
  const total = r.lines.filter((l) => !l.pantry).length;
  const done = r.lines.filter((l) => !l.pantry && checked.has(l.ingredient.name)).length;

  $('#sheet-body').innerHTML = `
    <header class="sheet-head">
      ${thumbFor(r.recipe, 'rthumb-lg')}
      <div class="sheet-title">
        <p class="eyebrow"><span class="badge tone-${v.tone}">${v.label}</span>Score ${r.score}${r.organicBonus ? ` <span class="eco-text">· +${r.organicBonus} øko</span>` : ''}</p>
        <h2 id="sheet-title">${esc(r.recipe.name)}</h2>
        <p class="meta"><span>${icon('clock')}${r.recipe.timeMinutes} min.</span><span>${icon('flame')}${r.proteinPerServing} g protein</span><span>${icon('users')}${r.recipe.servings} pers.</span></p>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Luk">${icon('x')}</button>
    </header>

    <div class="stat-grid">
      <div><span class="lbl">I alt</span><b>${krShort(r.dealCost)}</b><small>normalt ${krShort(r.normalCost)}</small></div>
      <div><span class="lbl">Du sparer</span><b class="accent">${krShort(r.savings)}</b><small>${nf0.format(r.savingsPct)} % billigere</small></div>
      <div><span class="lbl">Pr. portion</span><b>${krShort(r.costPerServing)}</b><small>${r.proteinPer10Kr == null ? '–' : nf1.format(r.proteinPer10Kr)} g protein/10 kr.</small></div>
    </div>

    <section class="shop" aria-labelledby="shop-title">
      <div class="shop-head">
        <h3 id="shop-title">Indkøbsliste</h3>
        <span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Købt"><span style="width:${total ? (done / total) * 100 : 0}%"></span></span>
        <small>${done}/${total}</small>
      </div>
      ${ordered
        .map(
          ([s, lines]) => `<div class="shop-group">
            <h4>${s ? `${storeDot(s)}${esc(s)}<small class="accent">spar ${krShort(lines.reduce((a, l) => a + l.saving, 0))}</small>` : '<span class="dot dot-muted"></span>Køb hvor som helst'}</h4>
            <ul>${lines.map(item).join('')}</ul>
          </div>`,
        )
        .join('')}
      ${pantry.length ? `<p class="pantry">Har du sikkert allerede: ${pantry.map(esc).join(', ')}</p>` : ''}
    </section>

    ${r.recipe.description ? `<p class="desc">${esc(r.recipe.description)}</p>` : ''}
    ${r.recipe.steps?.length ? `<section class="steps"><h3>Sådan gør du</h3><ol>${r.recipe.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
    <footer class="sheet-foot">
      ${host ? `<a class="btn btn-ghost" href="${esc(r.recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(host)}</a>` : '<span></span>'}
      <button type="button" class="btn" data-edit="${esc(r.recipeId)}">Redigér opskrift</button>
    </footer>`;
}

$('#sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) return $('#sheet').close();
  const clip = e.target.closest('[data-clip]');
  if (clip) return openClip(clip.dataset.clip);
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    $('#sheet').close();
    openEditor(state.recipes.find((r) => r.id === edit.dataset.edit));
  }
});
$('#sheet').addEventListener('change', (e) => {
  const id = e.target.dataset.check;
  if (id == null) return;
  const key = `checked.${sheetRecipeId}`;
  const set = new Set(store.get(key, []));
  e.target.checked ? set.add(id) : set.delete(id);
  store.set(key, [...set]);
  const scroll = $('#sheet-body').scrollTop;
  renderSheet(state.ranking.ranking.find((x) => x.recipeId === sheetRecipeId));
  $('#sheet-body').scrollTop = scroll;
  $(`[data-check="${CSS.escape(id)}"]`, $('#sheet'))?.focus();
});

/* =========================================================================
   Avisudklip
   ========================================================================= */
function openClip(id) {
  const o = state.offerById.get(id);
  if (!o) return;
  const sample = o.source === 'sample';
  const saving = o.prePrice && o.prePrice > o.price ? o.prePrice - o.price : null;
  const period = [fmtDate(o.validFrom), fmtDate(o.validTo)].filter(Boolean).join(' – ');
  const up = unitPrice(o);
  $('#clip-body').innerHTML = `
    <header class="clip-head">
      ${o.storeLogo ? `<img class="logo" src="${esc(o.storeLogo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : storeDot(o.store, o.storeColor)}
      <div><b>${esc(o.store)}</b>${period ? `<small>Gyldig ${esc(period)}</small>` : ''}</div>
      <button type="button" class="icon-btn" data-close aria-label="Luk">${icon('x')}</button>
    </header>
    <div class="clip-img ${o.image ? '' : 'noimg'}">
      ${
        o.image
          ? `<a href="${esc(o.imageZoom ?? o.image)}" target="_blank" rel="noopener noreferrer" title="Åbn i fuld størrelse"><img src="${esc(o.image)}" alt="Udklip fra ${esc(o.store)}s tilbudsavis: ${esc(o.title)}" referrerpolicy="no-referrer" onerror="this.closest('.clip-img').classList.add('noimg');this.remove()"></a>`
          : ''
      }
      <p class="noimg-text">${icon('image', 'i-lg')}${sample ? 'Eksempeltilbud – intet avisudklip' : 'Intet udklip til dette tilbud'}</p>
    </div>
    <h2 id="clip-title">${isOrganic(o) ? '<span class="eco">Øko</span>' : ''}${esc(o.title)}</h2>
    ${o.description ? `<p class="muted">${esc(o.description)}</p>` : ''}
    <p class="clip-price"><b>${kr(o.price)}</b>${o.prePrice ? `<s>${kr(o.prePrice)}</s>` : ''}${saving ? `<span class="badge tone-top">Spar ${krShort(saving)}</span>` : ''}</p>
    ${up ? `<p class="muted small">${kr(Math.round(up.value * 100) / 100)} pr. ${up.base}</p>` : ''}
    <p class="source">${icon('info', 'i-sm')}${sample ? 'Eksempeldata i appen – ikke en rigtig avis' : `${esc(o.store)}s tilbudsavis via Tjek/eTilbudsavis${o.catalogPage ? ` · side ${esc(o.catalogPage)}` : ''}`}</p>`;
  $('#clip').showModal();
}
$('#clip').addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) $('#clip').close();
});

/* =========================================================================
   TILBUD – visuelt gitter
   ========================================================================= */
async function loadOffers() {
  if (!state.offers) {
    renderOffers(true);
    try {
      state.offers = await api('/api/offers');
      for (const o of state.offers.offers) state.offerById.set(o.id, o);
    } catch (err) {
      state.offers = { error: err.message, offers: [] };
    }
  }
  if (state.route === 'offers') renderOffers();
}

function offerCard(o) {
  const up = unitPrice(o);
  const pct = o.prePrice > o.price ? Math.round((1 - o.price / o.prePrice) * 100) : null;
  const img = o.image ?? o.imageThumb;
  return `<li><button type="button" class="ocard" data-clip="${esc(o.id)}">
    <span class="ocard-img ${img ? '' : 'noimg'}" style="--c:${storeColor(o.store, o.storeColor)}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()">` : ''}
      <span class="ph">${esc(o.store)}</span>
      ${pct ? `<span class="ocard-pct">−${pct} %</span>` : ''}
    </span>
    <span class="ocard-body">
      <span class="ocard-store">${storeDot(o.store, o.storeColor)}${esc(o.store)}${isOrganic(o) ? '<span class="eco">Øko</span>' : ''}</span>
      <span class="ocard-title">${esc(o.title)}</span>
      <span class="ocard-price"><b>${krShort(o.price)}</b>${o.prePrice ? `<s>${krShort(o.prePrice)}</s>` : ''}${up ? `<small>${krShort(up.value)}/${up.base}</small>` : ''}</span>
    </span>
  </button></li>`;
}

function renderOffers(loading = false) {
  const el = $('#view-offers');
  const data = state.offers;
  const all = data?.offers ?? [];
  const stores = [...new Set(all.map((o) => o.store))].sort((a, b) => a.localeCompare(b, 'da'));
  const q = state.offerQuery.trim().toLowerCase();
  const list = all
    .filter((o) => (!state.offerStore || o.store === state.offerStore) && (!q || `${o.title} ${o.store} ${o.description ?? ''}`.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title, 'da'));

  let body;
  if (loading) body = `<ul class="ogrid" aria-hidden="true">${Array.from({ length: 8 }, () => '<li><div class="ocard skeleton"><div class="sk sk-img"></div><div class="ocard-body"><div class="sk w40"></div><div class="sk w80"></div></div></div></li>').join('')}</ul>`;
  else if (data?.error) body = `<div class="empty">${icon('info', 'i-lg')}<h3>Kunne ikke hente tilbud</h3><p>${esc(data.error)}</p></div>`;
  else if (list.length) body = `<p class="count">${list.length} ${list.length === 1 ? 'tilbud' : 'tilbud'}</p><ul class="ogrid">${list.map(offerCard).join('')}</ul>`;
  else body = `<div class="empty">${icon('search', 'i-lg')}<h3>Ingen tilbud matcher</h3><p>Prøv et andet søgeord eller en anden butik.</p></div>`;

  el.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Uge ${isoWeek()}</p><h1 id="offers-title">Ugens tilbud</h1></div>
      <p class="muted small">Kun tilbud på varer fra dine opskrifter</p>
    </div>
    <div class="controls">
      <label class="search">${icon('search')}<input id="offer-q" type="search" placeholder="Søg i tilbud" value="${esc(state.offerQuery)}" aria-label="Søg i tilbud" autocomplete="off"><kbd>/</kbd></label>
      ${
        stores.length
          ? `<div class="chips" role="radiogroup" aria-label="Butik">
              <button type="button" class="chip" role="radio" aria-checked="${!state.offerStore}" data-ostore="">Alle butikker</button>
              ${stores.map((s) => `<button type="button" class="chip" role="radio" aria-checked="${state.offerStore === s}" data-ostore="${esc(s)}">${storeDot(s)}${esc(s)}</button>`).join('')}
            </div>`
          : ''
      }
    </div>
    ${body}`;
}

$('#view-offers').addEventListener('input', (e) => {
  if (e.target.id !== 'offer-q') return;
  state.offerQuery = e.target.value;
  const pos = e.target.selectionStart;
  renderOffers();
  const input = $('#offer-q');
  input.focus();
  input.setSelectionRange(pos, pos);
});
$('#view-offers').addEventListener('click', (e) => {
  const s = e.target.closest('[data-ostore]');
  if (s) {
    state.offerStore = s.dataset.ostore;
    renderOffers();
    $(`[data-ostore="${CSS.escape(state.offerStore)}"]`)?.focus();
    return;
  }
  const c = e.target.closest('[data-clip]');
  if (c) openClip(c.dataset.clip);
});

/* =========================================================================
   OPSKRIFTER – import + gitter
   ========================================================================= */
async function loadRecipes() {
  state.recipes = await api('/api/recipes');
  if (state.route === 'recipes') renderRecipes();
}

function renderRecipes() {
  const el = $('#view-recipes');
  const q = state.recipeQuery.trim().toLowerCase();
  const list = state.recipes.filter((r) => !q || `${r.name} ${(r.tags ?? []).join(' ')}`.toLowerCase().includes(q));
  el.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">${state.recipes.length} ${state.recipes.length === 1 ? 'opskrift' : 'opskrifter'}</p><h1 id="recipes-title">Dine opskrifter</h1></div>
      <button type="button" class="btn" id="new-recipe">${icon('plus')}Ny opskrift</button>
    </div>

    <form class="importer" id="import-form">
      <span class="importer-icon">${icon('link')}</span>
      <input id="import-url" type="url" inputmode="url" autocomplete="off" placeholder="Indsæt et link til en opskrift" aria-label="Link til en opskrift" required>
      <button type="submit" class="btn btn-primary" id="import-btn">Hent opskrift</button>
    </form>
    <p class="import-hint" id="import-hint">Virker med de fleste opskriftssider og madblogs. Du kan rette alt, før det gemmes.</p>
    <p class="import-error" id="import-error" role="alert" hidden></p>

    ${state.recipes.length > 6 ? `<label class="search">${icon('search')}<input id="recipe-q" type="search" placeholder="Søg i opskrifter" value="${esc(state.recipeQuery)}" aria-label="Søg i opskrifter" autocomplete="off"><kbd>/</kbd></label>` : ''}

    ${
      list.length
        ? `<ul class="rgrid">${list
            .map(
              (r) => `<li><button type="button" class="rcard" data-edit="${esc(r.id)}">
                ${thumbFor(r, 'rthumb-card')}
                <span class="rcard-body">
                  <span class="rcard-title">${esc(r.name)}</span>
                  <span class="rrow-meta"><span>${icon('flame')}${r.proteinPerServing} g</span><span>${icon('clock')}${r.timeMinutes} min.</span>${r.sourceUrl ? `<span>${icon('link')}${esc(hostOf(r.sourceUrl))}</span>` : ''}</span>
                </span>
              </button></li>`,
            )
            .join('')}</ul>`
        : `<div class="empty">${icon('search', 'i-lg')}<h3>${q ? 'Ingen opskrifter matcher' : 'Ingen opskrifter endnu'}</h3><p>${q ? 'Prøv et andet søgeord.' : 'Indsæt et link ovenfor, eller opret en opskrift fra bunden.'}</p></div>`
    }`;
}

$('#view-recipes').addEventListener('click', (e) => {
  if (e.target.closest('#new-recipe')) return openEditor();
  const ed = e.target.closest('[data-edit]');
  if (ed) openEditor(state.recipes.find((r) => r.id === ed.dataset.edit));
});
$('#view-recipes').addEventListener('input', (e) => {
  if (e.target.id !== 'recipe-q') return;
  state.recipeQuery = e.target.value;
  const pos = e.target.selectionStart;
  renderRecipes();
  $('#recipe-q').focus();
  $('#recipe-q').setSelectionRange(pos, pos);
});
$('#view-recipes').addEventListener('submit', async (e) => {
  if (e.target.id !== 'import-form') return;
  e.preventDefault();
  const btn = $('#import-btn');
  const err = $('#import-error');
  err.hidden = true;
  btn.disabled = true;
  btn.innerHTML = `${icon('refresh', 'spin')}Henter`;
  try {
    const { recipe, warnings } = await api('/api/import', { method: 'POST', body: JSON.stringify({ url: $('#import-url').value }) });
    openEditor(recipe, { warnings, imported: true });
    $('#import-url').value = '';
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hent opskrift';
  }
});

/* =========================================================================
   Redigering
   ========================================================================= */
let editing = null;

function ingredientRow(ing = {}) {
  const unit = ing.unit ?? 'g';
  return `<div class="ing ${ing.pantry ? 'is-pantry' : ''}">
    <div class="ing-main">
      <input class="ing-amount" data-f="amount" type="number" step="any" min="0" inputmode="decimal" placeholder="Antal" value="${esc(ing.pantry ? '' : ing.amount ?? '')}" aria-label="Mængde">
      <select class="ing-unit" data-f="unit" aria-label="Enhed">
        ${['g', 'kg', 'ml', 'dl', 'l', 'stk'].map((u) => `<option ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <input class="ing-name" data-f="name" placeholder="Ingrediens" value="${esc(ing.name ?? '')}" aria-label="Ingrediens">
      <label class="ing-price with-suffix" title="Hvad varen normalt koster uden tilbud">
        <input data-f="refPrice" type="number" step="any" min="0" inputmode="decimal" placeholder="Normalpris" value="${esc(ing.refPrice || '')}" aria-label="Normalpris">
        <span class="suffix">kr/${BASE[unit]}</span>
      </label>
      <button type="button" class="tog" data-f="pantry" aria-pressed="${Boolean(ing.pantry)}" title="Har du den altid derhjemme, tælles den ikke med i prisen">Har altid</button>
      <button type="button" class="icon-btn" data-more aria-expanded="false" aria-label="Hvordan findes varen i aviserne?" title="Hvordan findes varen i aviserne?">${icon('more')}</button>
      <button type="button" class="icon-btn danger" data-remove aria-label="Fjern ingrediens" title="Fjern">${icon('x')}</button>
    </div>
    <div class="ing-more" hidden>
      <label>Find i aviserne som<input data-f="match" placeholder="fx kyllingebryst, kyllingefilet" value="${esc((ing.match ?? []).join(', '))}"></label>
      <label>Men ikke hvis der står<input data-f="exclude" placeholder="fx pålæg, paneret" value="${esc((ing.exclude ?? []).join(', '))}"></label>
    </div>
  </div>`;
}

function openEditor(recipe, { warnings = [], imported = false } = {}) {
  editing = recipe?.id ?? null;
  const r = recipe ?? { servings: 4, timeMinutes: 30, ingredients: [{}, {}, {}] };
  const host = hostOf(r.sourceUrl);
  $('#editor-form').innerHTML = `
    <header class="modal-head">
      <div>
        <p class="eyebrow">${imported ? 'Importeret · tjek og gem' : editing ? 'Redigér opskrift' : 'Ny opskrift'}</p>
        <h2 id="editor-title">${esc(r.name || 'Uden navn')}</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Luk">${icon('x')}</button>
    </header>
    <div class="modal-scroll">
      ${
        imported
          ? `<div class="callout">${icon('info')}<div><b>Næsten færdig.</b> Normalpriser og søgeord er gættet ud fra almindelige danske priser – ret dem, hvis de ikke passer.${
              warnings.length ? `<details><summary>${warnings.length} ${warnings.length === 1 ? 'ting' : 'ting'} at tjekke</summary><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''
            }</div></div>`
          : ''
      }
      <div class="field-grid">
        <label class="field span-all">Navn<input name="name" required value="${esc(r.name ?? '')}" placeholder="fx Kyllingegryde med kikærter"></label>
        <label class="field">Portioner<input name="servings" type="number" min="1" inputmode="numeric" value="${esc(r.servings ?? 4)}"></label>
        <label class="field">Tid<span class="with-suffix"><input name="timeMinutes" type="number" min="0" inputmode="numeric" value="${esc(r.timeMinutes ?? '')}"><span class="suffix">min.</span></span></label>
        <label class="field">Protein<span class="with-suffix"><input name="proteinPerServing" type="number" min="0" inputmode="numeric" value="${esc(r.proteinPerServing ?? '')}"><span class="suffix">g/pers.</span></span></label>
        <label class="field">Tags<input name="tags" value="${esc((r.tags ?? []).join(', '))}" placeholder="kylling, hurtig"></label>
      </div>

      <div class="ing-head">
        <h3>Ingredienser</h3>
        <p class="muted small">Normalpris = hvad varen koster <i>uden</i> tilbud.</p>
      </div>
      <div id="ing-list" class="ing-list">${r.ingredients.map(ingredientRow).join('')}</div>
      <button type="button" class="btn btn-ghost" id="add-ing">${icon('plus')}Tilføj ingrediens</button>

      <label class="field"><span>Fremgangsmåde <span class="muted">· ét trin pr. linje</span></span><textarea name="steps" rows="6">${esc((r.steps ?? []).join('\n'))}</textarea></label>
      <label class="field">Beskrivelse<textarea name="description" rows="2">${esc(r.description ?? '')}</textarea></label>
      <input type="hidden" name="sourceUrl" value="${esc(r.sourceUrl ?? '')}">
      <input type="hidden" name="image" value="${esc(r.image ?? '')}">
      ${host ? `<p class="muted small source-line">${icon('link', 'i-sm')}Kilde: <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(host)}</a></p>` : ''}
      <p class="form-error" id="form-error" role="alert" hidden></p>
    </div>
    <footer class="modal-foot">
      ${editing ? `<button type="button" class="btn btn-ghost danger" id="delete-recipe">${icon('trash')}Slet</button>` : '<span></span>'}
      <div class="foot-actions">
        <button type="button" class="btn btn-ghost" data-close>Annullér</button>
        <button type="submit" class="btn btn-primary">Gem opskrift</button>
      </div>
    </footer>`;
  $('#editor').showModal();
  if (!recipe) $('[name=name]', $('#editor')).focus();
}

function readEditor() {
  const f = $('#editor-form').elements;
  const ingredients = $$('#ing-list .ing')
    .map((row) => {
      const v = (k) => $(`[data-f="${k}"]`, row);
      const pantry = v('pantry').getAttribute('aria-pressed') === 'true';
      const noAmount = !(Number(v('amount').value) > 0);
      return {
        name: v('name').value,
        amount: pantry && noAmount ? 1 : v('amount').value,
        unit: pantry && noAmount ? 'stk' : v('unit').value,
        refPrice: v('refPrice').value,
        match: v('match').value,
        exclude: v('exclude').value,
        pantry,
      };
    })
    .filter((i) => i.name.trim());
  return {
    name: f.name.value,
    description: f.description.value,
    servings: f.servings.value,
    timeMinutes: f.timeMinutes.value,
    proteinPerServing: f.proteinPerServing.value,
    tags: f.tags.value,
    steps: f.steps.value.split('\n'),
    sourceUrl: f.sourceUrl.value,
    image: f.image.value,
    ingredients,
  };
}

$('#editor').addEventListener('click', async (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) return $('#editor').close();
  if (e.target.closest('#add-ing')) {
    $('#ing-list').insertAdjacentHTML('beforeend', ingredientRow({}));
    $('#ing-list .ing:last-child .ing-amount').focus();
    return;
  }
  const row = e.target.closest('.ing');
  if (e.target.closest('[data-remove]')) return row.remove();
  const more = e.target.closest('[data-more]');
  if (more) {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    $('.ing-more', row).hidden = !open;
    if (open) $('.ing-more input', row).focus();
    return;
  }
  const tog = e.target.closest('.tog');
  if (tog) {
    const on = tog.getAttribute('aria-pressed') !== 'true';
    tog.setAttribute('aria-pressed', String(on));
    row.classList.toggle('is-pantry', on);
    return;
  }
  if (e.target.closest('#delete-recipe')) {
    if (!confirm('Slet opskriften? Det kan ikke fortrydes.')) return;
    await api(`/api/recipes/${encodeURIComponent(editing)}`, { method: 'DELETE' });
    $('#editor').close();
    toast('Opskriften er slettet');
    await afterRecipeChange();
  }
});
$('#editor').addEventListener('change', (e) => {
  if (e.target.matches('[data-f="unit"]')) $('.suffix', e.target.closest('.ing')).textContent = `kr/${BASE[e.target.value]}`;
});
$('#editor').addEventListener('input', (e) => {
  if (e.target.name === 'name') $('#editor-title').textContent = e.target.value || 'Uden navn';
});
$('#editor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#form-error');
  try {
    const body = JSON.stringify(readEditor());
    if (editing) await api(`/api/recipes/${encodeURIComponent(editing)}`, { method: 'PUT', body });
    else await api('/api/recipes', { method: 'POST', body });
    $('#editor').close();
    toast(editing ? 'Ændringerne er gemt' : 'Opskriften er gemt');
    await afterRecipeChange();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    err.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

async function afterRecipeChange() {
  state.offers = null;
  await loadRecipes();
  await loadRanking();
}

/* =========================================================================
   Tastatur: "/" fokuserer søgefeltet på siden
   ========================================================================= */
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || $('dialog[open]')) return;
  const view = $(`#view-${state.route}`);
  const input = $('input[type=search], #import-url', view);
  if (input) {
    e.preventDefault();
    input.focus();
  }
});

/* ---------- Start ---------- */
loadRecipes().catch(() => {});
route();
