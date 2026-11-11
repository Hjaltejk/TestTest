const $ = (sel, el = document) => el.querySelector(sel);
const kr = (n) => (n == null ? '–' : `${n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) : '');
const BASE = { g: 'kg', kg: 'kg', ml: 'l', dl: 'l', cl: 'l', l: 'l', stk: 'stk' };

const STORE_KEY = 'tilbudskokken.excludedStores';
const state = { recipes: [], ranking: null, offers: null, offerById: new Map(), excludedStores: loadExcluded() };

function loadExcluded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
function saveExcluded() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...state.excludedStores]));
  } catch {}
}

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Fejl ${res.status}`);
  return body;
}

/* ---------- Faner ---------- */
document.querySelectorAll('[data-tab]').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'offers') loadOffers();
  }),
);

/* ---------- Status ---------- */
function renderStatus(data) {
  const el = $('#status');
  const src = data.source === 'tjek' ? 'tilbudsaviser via Tjek/eTilbudsavis' : 'demo-tilbud (ikke rigtige priser)';
  el.className = `status ${data.source === 'sample' ? 'warn' : ''}`;
  el.innerHTML = `
    <span><b>${data.offerCount}</b> tilbud fra ${esc(src)} · hentet ${new Date(data.fetchedAt).toLocaleString('da-DK')}</span>
    ${(data.warnings ?? []).slice(0, 3).map((w) => `<span class="w">${esc(w)}</span>`).join('')}`;
}

/* ---------- Rangering ---------- */
async function loadRanking(refresh = false) {
  $('#ranking').innerHTML = '<li class="loading">Gennemgår tilbudsaviserne …</li>';
  try {
    // Serveren returnerer altid alle butikker; vi sender kun de fravalgte med.
    const params = new URLSearchParams({ sort: $('#sort').value });
    if (refresh) params.set('refresh', '1');
    if (state.excludedStores.size) params.set('exclude', [...state.excludedStores].join(','));
    const data = await api(`/api/ranking?${params}`);
    state.ranking = data;
    renderStatus(data);
    renderStores(data.stores);
    renderRanking(data.ranking);
  } catch (err) {
    $('#ranking').innerHTML = `<li class="error">${esc(err.message)}</li>`;
  }
}

function renderStores(stores) {
  const chosen = stores.filter((s) => !state.excludedStores.has(s)).length;
  $('#store-count').textContent = `(${chosen} af ${stores.length})`;
  $('#store-list').innerHTML = stores
    .map((s) => `<label><input type="checkbox" value="${esc(s)}" ${state.excludedStores.has(s) ? '' : 'checked'}> ${esc(s)}</label>`)
    .join('');
}

$('#store-list').addEventListener('change', (e) => {
  const { value, checked } = e.target;
  checked ? state.excludedStores.delete(value) : state.excludedStores.add(value);
  saveExcluded();
  loadRanking();
});
$('#sort').addEventListener('change', () => loadRanking());
$('#refresh').addEventListener('click', () => loadRanking(true));

function scoreClass(s) {
  return s >= 60 ? 'good' : s >= 35 ? 'ok' : 'low';
}

function renderRanking(list) {
  for (const r of list) for (const l of r.lines) if (l.offer) state.offerById.set(l.offer.id, l.offer);
  if (!list.length) {
    $('#ranking').innerHTML = '<li class="empty">Du har ingen opskrifter endnu. Opret en under "Mine opskrifter".</li>';
    return;
  }
  $('#ranking').innerHTML = list
    .map((r, i) => {
      const deals = r.lines.filter((l) => l.offer);
      const lines = r.lines
        .filter((l) => !l.pantry)
        .map((l) => {
          const ing = l.ingredient;
          const amount = `${ing.amount} ${ing.unit}`;
          if (l.offer) {
            return `<li class="deal">
              <span class="ing">${esc(ing.name)} <small>${esc(amount)}</small></span>
              <span class="offer">${thumb(l.offer)}<span><b>${esc(l.offer.store)}</b>: ${esc(l.offer.title)} – ${kr(l.offer.price)}
                <small>(${kr(l.offerUnitPrice)}/${BASE[ing.unit]}, ${l.packs} pk.${l.offer.validTo ? `, til ${fmtDate(l.offer.validTo)}` : ''})</small>
                <button type="button" class="link" data-offer="${esc(l.offer.id)}">${l.offer.image ? 'Se udklip fra avisen' : 'Se tilbuddet'}</button></span></span>
              <span class="save">−${kr(l.saving)}</span></li>`;
          }
          return `<li><span class="ing">${esc(ing.name)} <small>${esc(amount)}</small></span>
            <span class="offer muted">Ikke på tilbud – normalpris ${kr(ing.refPrice)}/${BASE[ing.unit]}</span>
            <span class="save">${kr(l.cost)}</span></li>`;
        })
        .join('');
      const pantry = r.lines.filter((l) => l.pantry).map((l) => esc(l.ingredient.name)).join(', ');
      const stores = r.stores.map((s) => `${esc(s.store)} (−${kr(s.savings)})`).join(', ');
      return `<li class="card">
        <div class="card-head">
          <span class="rank">${i + 1}</span>
          <div class="title">
            <h2>${esc(r.recipe.name)}</h2>
            <p class="meta">${r.recipe.servings} portioner · ${r.recipe.timeMinutes} min. · ${r.proteinPerServing} g protein/portion
              ${(r.recipe.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
          </div>
          <span class="score ${scoreClass(r.score)}" title="Samlet score (0-100)">${r.score}</span>
        </div>
        <div class="facts">
          <div><span>Pris nu</span><b>${kr(r.dealCost)}</b><small>normalt ${kr(r.normalCost)}</small></div>
          <div><span>Du sparer</span><b>${kr(r.savings)}</b><small>${Math.round(r.savingsPct)} %</small></div>
          <div><span>Pr. portion</span><b>${kr(r.costPerServing)}</b><small>${r.proteinPer10Kr == null ? '–' : r.proteinPer10Kr.toLocaleString('da-DK', { maximumFractionDigits: 1 })} g protein pr. 10 kr.</small></div>
          <div><span>På tilbud</span><b>${deals.length} af ${r.lines.filter((l) => !l.pantry).length}</b><small>${Math.round(r.coveragePct)} % af indkøbet</small></div>
        </div>
        ${r.bestStore ? `<p class="where">Mest at hente i <b>${esc(r.bestStore.store)}</b>${r.stores.length > 1 ? ` · tilbud i ${r.stores.length} butikker: ${stores}` : ''}</p>` : '<p class="where muted">Ingen af ingredienserne er på tilbud lige nu.</p>'}
        <details>
          <summary>Indkøbsliste og fremgangsmåde</summary>
          <ul class="lines">${lines}</ul>
          ${pantry ? `<p class="muted small">Har du i forvejen: ${pantry}</p>` : ''}
          ${r.recipe.description ? `<p>${esc(r.recipe.description)}</p>` : ''}
          <ol class="steps">${(r.recipe.steps ?? []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </details>
      </li>`;
    })
    .join('');
}

/* ---------- Tilbud ---------- */
async function loadOffers() {
  if (!state.offers) {
    $('#offer-rows').innerHTML = '<tr><td colspan="6">Henter …</td></tr>';
    state.offers = await api('/api/offers');
    for (const o of state.offers.offers) state.offerById.set(o.id, o);
  }
  renderOffers();
}
function renderOffers() {
  const q = $('#offer-filter').value.trim().toLowerCase();
  const rows = state.offers.offers
    .filter((o) => !q || `${o.title} ${o.store} ${o.description ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'da'));
  $('#offer-rows').innerHTML =
    rows
      .map((o) => {
        return `<tr class="clickable" data-offer="${esc(o.id)}" tabindex="0"><td class="thumb-col">${thumb(o)}</td><td>${esc(o.title)}<br><small class="muted">${esc(o.description ?? '')}</small></td>
          <td>${esc(o.store)}</td><td class="num">${kr(o.price)}</td><td class="num muted">${o.prePrice ? kr(o.prePrice) : ''}</td>
          <td class="num">${unitPriceText(o)}</td></tr>`;
      })
      .join('') || '<tr><td colspan="6">Ingen tilbud matcher.</td></tr>';
}
$('#offer-filter').addEventListener('input', () => state.offers && renderOffers());

/* ---------- Udklip fra avisen ---------- */
// Billeder fra Tjek hentes direkte fra deres server; referrer sendes ikke med.
function thumb(o) {
  if (!o.imageThumb) return '';
  return `<img class="thumb" src="${esc(o.imageThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

function unitPriceText(o) {
  const factor = { g: 0.001, ml: 0.001, dl: 0.1, cl: 0.01 }[o.unit] ?? 1;
  const base = BASE[o.unit];
  if (!o.amount || !base) return '';
  return `${kr(Math.round((o.price / (o.amount * factor)) * 100) / 100)}/${base}`;
}

function openOffer(id) {
  const o = state.offerById.get(id);
  if (!o) return;
  const isSample = o.source === 'sample';
  const saving = o.prePrice && o.prePrice > o.price ? o.prePrice - o.price : null;
  const period = [o.validFrom && fmtDate(o.validFrom), o.validTo && fmtDate(o.validTo)].filter(Boolean).join(' – ');
  const big = o.imageZoom ?? o.image;
  $('#offer-detail').innerHTML = `
    <div class="od-head">
      ${o.storeLogo ? `<img class="od-logo" src="${esc(o.storeLogo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div><b>${esc(o.store)}</b>${period ? `<br><small class="muted">Gyldig ${esc(period)}</small>` : ''}</div>
    </div>
    <div class="od-clip">
      ${
        o.image
          ? `<a href="${esc(big)}" target="_blank" rel="noopener noreferrer" title="Åbn i fuld størrelse">
               <img src="${esc(o.image)}" alt="Udklip fra ${esc(o.store)}s tilbudsavis: ${esc(o.title)}" referrerpolicy="no-referrer"
                 onerror="this.closest('.od-clip').innerHTML='<p class=muted>Udklippet kunne ikke indlæses.</p>'"></a>`
          : `<p class="muted">${isSample ? 'Demo-tilbud – der findes intet udklip fra en rigtig avis.' : 'Der er intet udklip til dette tilbud.'}</p>`
      }
    </div>
    <h2 id="od-title">${esc(o.title)}</h2>
    ${o.description ? `<p class="od-desc">${esc(o.description)}</p>` : ''}
    <p class="od-price"><b>${kr(o.price)}</b>
      ${o.prePrice ? `<s class="muted">${kr(o.prePrice)}</s>` : ''}
      ${saving ? `<span class="od-save">Spar ${kr(Math.round(saving * 100) / 100)}</span>` : ''}
      ${unitPriceText(o) ? `<small class="muted">· ${unitPriceText(o)}</small>` : ''}</p>
    <p class="od-source small muted">Kilde: ${
      isSample
        ? 'demo-data i appen (ikke en rigtig avis)'
        : `${esc(o.store)}s tilbudsavis via Tjek/eTilbudsavis${o.catalogPage ? ` · side ${esc(o.catalogPage)}` : ''}`
    }</p>`;
  $('#offer-dialog').showModal();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-offer]');
  if (el) openOffer(el.dataset.offer);
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('tr[data-offer]');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openOffer(el.dataset.offer);
  }
});
$('#offer-close').addEventListener('click', () => $('#offer-dialog').close());
$('#offer-dialog').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close(); // klik udenfor lukker
});

/* ---------- Opskrifter ---------- */
async function loadRecipes() {
  state.recipes = await api('/api/recipes');
  $('#recipe-list').innerHTML = state.recipes
    .map(
      (r) => `<li>
        <div><b>${esc(r.name)}</b><br><small class="muted">${r.ingredients.length} ingredienser · ${r.proteinPerServing} g protein/portion</small></div>
        <div class="row-actions">
          <button class="secondary" data-edit="${esc(r.id)}">Redigér</button>
          <button class="danger" data-delete="${esc(r.id)}">Slet</button>
        </div></li>`,
    )
    .join('');
}

$('#recipe-list').addEventListener('click', async (e) => {
  const edit = e.target.dataset.edit;
  const del = e.target.dataset.delete;
  if (edit) openForm(state.recipes.find((r) => r.id === edit));
  if (del && confirm('Slet opskriften?')) {
    await api(`/api/recipes/${encodeURIComponent(del)}`, { method: 'DELETE' });
    await loadRecipes();
    loadRanking();
  }
});

const dialog = $('#recipe-dialog');
const form = $('#recipe-form');
let editingId = null;

function addIngredientRow(ing = {}) {
  const row = $('#ingredient-row').content.firstElementChild.cloneNode(true);
  const set = (f, v) => {
    const el = row.querySelector(`[data-f="${f}"]`);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (v != null) el.value = Array.isArray(v) ? v.join(', ') : v;
  };
  ['name', 'amount', 'unit', 'refPrice', 'match', 'exclude', 'pantry'].forEach((f) => set(f, ing[f]));
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  $('#ingredient-rows').append(row);
}

function openForm(recipe) {
  editingId = recipe?.id ?? null;
  form.reset();
  $('#form-title').textContent = recipe ? 'Redigér opskrift' : 'Ny opskrift';
  $('#form-error').hidden = true;
  $('#ingredient-rows').innerHTML = '';
  if (recipe) {
    for (const f of ['name', 'description', 'servings', 'timeMinutes', 'proteinPerServing']) form.elements[f].value = recipe[f] ?? '';
    form.elements.tags.value = (recipe.tags ?? []).join(', ');
    form.elements.steps.value = (recipe.steps ?? []).join('\n');
    recipe.ingredients.forEach(addIngredientRow);
  } else {
    addIngredientRow();
    addIngredientRow();
  }
  dialog.showModal();
}

function readForm() {
  const f = form.elements;
  const ingredients = [...document.querySelectorAll('#ingredient-rows .ing-row')]
    .map((row) => {
      const v = (k) => row.querySelector(`[data-f="${k}"]`);
      return {
        name: v('name').value,
        amount: v('amount').value,
        unit: v('unit').value,
        refPrice: v('refPrice').value,
        match: v('match').value,
        exclude: v('exclude').value,
        pantry: v('pantry').checked,
      };
    })
    .filter((i) => i.name.trim());
  // Ingredienser man "har altid" behøver ikke mængde.
  ingredients.forEach((i) => {
    if (i.pantry && !(Number(i.amount) > 0)) {
      i.amount = 1;
      i.unit = 'stk';
    }
  });
  return {
    name: f.name.value,
    description: f.description.value,
    servings: f.servings.value,
    timeMinutes: f.timeMinutes.value,
    proteinPerServing: f.proteinPerServing.value,
    tags: f.tags.value,
    steps: f.steps.value.split('\n'),
    ingredients,
  };
}

$('#new-recipe').addEventListener('click', () => openForm());
$('#add-ingredient').addEventListener('click', () => addIngredientRow());
$('#cancel').addEventListener('click', () => dialog.close());
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const body = JSON.stringify(readForm());
    if (editingId) await api(`/api/recipes/${encodeURIComponent(editingId)}`, { method: 'PUT', body });
    else await api('/api/recipes', { method: 'POST', body });
    dialog.close();
    state.offers = null;
    await loadRecipes();
    loadRanking();
  } catch (err) {
    $('#form-error').textContent = err.message;
    $('#form-error').hidden = false;
  }
});

loadRecipes();
loadRanking();
