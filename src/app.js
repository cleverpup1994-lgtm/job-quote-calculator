// UI layer: reads the form, keeps one `quote` object as the source of truth,
// and re-renders the totals on every change. All math lives in quote.js.

import {
  CATEGORIES,
  calculateTotals,
  formatMoney,
  lineTotalCents,
  newQuoteNumber,
  toCsv,
} from './quote.js';

const STORAGE_KEY = 'jqc.quotes.v1';
const $ = (id) => document.getElementById(id);

const FIELDS = ['company', 'client', 'site', 'number', 'date', 'validDays', 'scope',
  'contingencyPct', 'markupPct', 'taxPct', 'depositPct'];

let quote = blankQuote();

// ---------- data ----------

function blankQuote() {
  return {
    company: loadCompanyName(),
    client: '',
    site: '',
    number: newQuoteNumber(),
    date: new Date().toISOString().slice(0, 10),
    validDays: 30,
    scope: '',
    contingencyPct: 5,
    markupPct: 15,
    taxPct: 8.25,
    depositPct: 30,
    taxLabor: false,
    items: [],
  };
}

function sampleQuote() {
  return {
    ...blankQuote(),
    company: quote.company || 'ATX Rigging & Steel',
    client: 'Lone Star Fabrication',
    site: 'Bay 3, 8413 S Hwy 183, Austin TX',
    scope: 'Rig and set two 12,000 lb CNC machines from truck to foundation, level and anchor. Client provides clear path and power. Excludes electrical hookup.',
    items: [
      item('labor', 'Rigging foreman', 10, 55),
      item('labor', 'Riggers (3 × 10 hrs)', 30, 42),
      item('equipment', '15k lb forklift rental', 1, 650),
      item('equipment', 'Machine skates and jacks', 1, 180),
      item('material', 'Wedge anchors 3/4" × 6"', 16, 6.5),
      item('material', 'Shims and grout', 1, 140),
      item('other', 'Mobilization / delivery', 1, 250),
    ],
  };
}

function item(category, description = '', qty = 1, unitPrice = 0) {
  return { id: crypto.randomUUID(), category, description, qty, unitPrice };
}

// Browser storage can be missing or full; never let that break the page.
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeSaved(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

function loadCompanyName() {
  try {
    return localStorage.getItem('jqc.company') ?? '';
  } catch {
    return '';
  }
}

// ---------- rendering ----------

function fillForm() {
  for (const f of FIELDS) $(f).value = quote[f] ?? '';
  $('taxLabor').checked = !!quote.taxLabor;
  renderItems();
  renderQuote();
  renderSavedList();
}

function renderItems() {
  const body = $('items');
  body.replaceChildren(...quote.items.map(rowFor));
  $('empty').hidden = quote.items.length > 0;
}

/** Builds a row with DOM nodes (not innerHTML) so typed text can't inject HTML. */
function rowFor(it) {
  const tr = document.createElement('tr');
  tr.dataset.id = it.id;

  const typeCell = document.createElement('td');
  const select = document.createElement('select');
  select.dataset.field = 'category';
  select.setAttribute('aria-label', 'Type');
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    select.append(new Option(cat.label, key, false, key === it.category));
  }
  typeCell.append(select);

  const unit = document.createElement('td');
  unit.className = 'unit';
  unit.textContent = CATEGORIES[it.category]?.unit ?? 'ea';

  const total = document.createElement('td');
  total.className = 'num line-total';
  total.textContent = formatMoney(lineTotalCents(it));

  const remove = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon';
  btn.dataset.remove = it.id;
  btn.setAttribute('aria-label', `Remove ${it.description || 'line'}`);
  btn.textContent = '×';
  remove.append(btn);

  tr.append(
    typeCell,
    inputCell('description', it.description, 'text', 'Description'),
    inputCell('qty', it.qty, 'number', 'Quantity', 'num'),
    unit,
    inputCell('unitPrice', it.unitPrice, 'number', 'Unit price', 'num'),
    total,
    remove,
  );
  return tr;
}

function inputCell(field, value, type, label, cls = '') {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.dataset.field = field;
  input.setAttribute('aria-label', label);
  if (type === 'number') {
    input.min = '0';
    input.step = field === 'unitPrice' ? '0.01' : '0.25';
    input.inputMode = 'decimal';
  }
  td.append(input);
  return td;
}

function renderQuote() {
  const t = calculateTotals(quote);

  $('q-company').textContent = quote.company || 'Your company';
  $('q-number').textContent = quote.number;
  $('q-client').textContent = quote.client || '—';
  $('q-site').textContent = quote.site ? ` · ${quote.site}` : '';
  $('q-scope').textContent = quote.scope;
  $('q-scope').hidden = !quote.scope;

  const valid = new Date(`${quote.date}T12:00:00`);
  valid.setDate(valid.getDate() + Number(quote.validDays || 0));
  $('q-dates').textContent = quote.date
    ? `${fmtDate(quote.date)} · valid until ${fmtDate(valid.toISOString().slice(0, 10))}`
    : '';

  const rows = [];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (t.byCategory[key]) rows.push([cat.label, t.byCategory[key]]);
  }
  rows.push(['Subtotal', t.subtotal, 'strong']);
  if (t.contingency) rows.push([`Contingency (${num(quote.contingencyPct)}%)`, t.contingency]);
  if (t.markup) rows.push([`Overhead & profit (${num(quote.markupPct)}%)`, t.markup]);
  if (t.tax) rows.push([`Sales tax (${num(quote.taxPct)}%${quote.taxLabor ? '' : ', non-labor'})`, t.tax]);

  $('summary').replaceChildren(...rows.map(([label, cents, cls]) => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    const a = document.createElement('td');
    a.textContent = label;
    const b = document.createElement('td');
    b.className = 'num';
    b.textContent = formatMoney(cents);
    tr.append(a, b);
    return tr;
  }));

  $('q-total').textContent = formatMoney(t.total);
  $('q-deposit').textContent = t.deposit
    ? `${num(quote.depositPct)}% deposit to schedule: ${formatMoney(t.deposit)}`
    : '';

  // Keep each row's line total in sync without rebuilding inputs (keeps focus).
  for (const tr of $('items').rows) {
    const it = quote.items.find((x) => x.id === tr.dataset.id);
    if (it) tr.querySelector('.line-total').textContent = formatMoney(lineTotalCents(it));
  }
}

function renderSavedList() {
  const saved = readSaved();
  const sel = $('saved');
  const options = Object.values(saved)
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''))
    .map((q) => new Option(`${q.number} · ${q.client || 'No client'}`, q.number));
  sel.replaceChildren(new Option('Saved quotes…', ''), ...options);
  sel.value = saved[quote.number] ? quote.number : '';
  $('btn-delete').hidden = !saved[quote.number];
}

const num = (v) => Number(v || 0).toString();
const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- events ----------

for (const f of FIELDS) {
  $(f).addEventListener('input', (e) => {
    quote[f] = e.target.value;
    renderQuote();
  });
}
$('taxLabor').addEventListener('change', (e) => {
  quote.taxLabor = e.target.checked;
  renderQuote();
});

document.querySelectorAll('[data-add]').forEach((btn) =>
  btn.addEventListener('click', () => {
    quote.items.push(item(btn.dataset.add));
    renderItems();
    renderQuote();
    $('items').lastElementChild?.querySelector('[data-field="description"]')?.focus();
  }),
);

// One listener for every row: edits and removals.
$('items').addEventListener('input', (e) => {
  const tr = e.target.closest('tr');
  const it = quote.items.find((x) => x.id === tr?.dataset.id);
  const field = e.target.dataset.field;
  if (!it || !field) return;
  it[field] = e.target.value;
  if (field === 'category') {
    tr.querySelector('.unit').textContent = CATEGORIES[it.category].unit;
  }
  renderQuote();
});
$('items').addEventListener('click', (e) => {
  const id = e.target.dataset.remove;
  if (!id) return;
  quote.items = quote.items.filter((x) => x.id !== id);
  renderItems();
  renderQuote();
});

$('btn-new').addEventListener('click', () => {
  quote = blankQuote();
  fillForm();
  toast('New quote started');
});
$('btn-sample').addEventListener('click', () => {
  quote = sampleQuote();
  fillForm();
  toast('Sample rigging job loaded');
});
$('btn-save').addEventListener('click', () => {
  const all = readSaved();
  all[quote.number] = { ...quote, savedAt: new Date().toISOString() };
  try { localStorage.setItem('jqc.company', quote.company); } catch { /* ignore */ }
  toast(writeSaved(all) ? 'Quote saved in this browser' : "Couldn't save: browser storage is off");
  renderSavedList();
});
$('saved').addEventListener('change', (e) => {
  const q = readSaved()[e.target.value];
  if (!q) return;
  quote = structuredClone(q);
  fillForm();
});
$('btn-delete').addEventListener('click', () => {
  const all = readSaved();
  if (!all[quote.number] || !confirmDelete()) return;
  delete all[quote.number];
  writeSaved(all);
  renderSavedList();
  toast('Saved copy deleted');
});
$('btn-print').addEventListener('click', () => window.print());
$('btn-csv').addEventListener('click', () => {
  const blob = new Blob([toCsv(quote)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${quote.number}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// A two-tap delete instead of a blocking confirm() dialog.
let armedAt = 0;
function confirmDelete() {
  if (Date.now() - armedAt < 3000) return true;
  armedAt = Date.now();
  toast('Tap Delete again to confirm');
  return false;
}

// ?sample opens straight into the example job (handy for demo links).
if (new URLSearchParams(location.search).has('sample')) quote = sampleQuote();
fillForm();
