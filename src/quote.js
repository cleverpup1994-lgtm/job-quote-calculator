// Pure quote math. No DOM in here, so it can be unit-tested with Node.
//
// All money is handled in whole cents to avoid floating-point drift
// (0.1 + 0.2 problems), then formatted back to dollars for display.

export const CATEGORIES = {
  labor: { label: 'Labor', unit: 'hrs' },
  material: { label: 'Materials', unit: 'qty' },
  equipment: { label: 'Equipment', unit: 'days' },
  other: { label: 'Other', unit: 'ea' },
};

/** Dollars (number or string) -> integer cents. Bad input becomes 0. */
export function toCents(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Quantity can be fractional (e.g. 7.5 hours). Negative or bad -> 0. */
export function toQty(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Percent input -> fraction, clamped to 0..100%. */
export function toRate(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100) / 100;
}

export function lineTotalCents(item) {
  return Math.round(toQty(item.qty) * toCents(item.unitPrice));
}

/**
 * Totals for a quote.
 *
 * Order matters and matches how most contractors quote:
 *   subtotal -> + contingency -> + markup (overhead & profit) -> + tax
 * Tax is applied only to materials and equipment by default, since labor is
 * often not taxable; set taxLabor to true if it is where you work.
 */
export function calculateTotals(quote) {
  const items = Array.isArray(quote.items) ? quote.items : [];

  const byCategory = Object.fromEntries(
    Object.keys(CATEGORIES).map((k) => [k, 0]),
  );
  for (const item of items) {
    const cat = item.category in CATEGORIES ? item.category : 'other';
    byCategory[cat] += lineTotalCents(item);
  }

  const subtotal = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const contingency = Math.round(subtotal * toRate(quote.contingencyPct));
  const markup = Math.round((subtotal + contingency) * toRate(quote.markupPct));

  // Taxable share of the pre-tax price, scaled with contingency and markup.
  const taxableBase = quote.taxLabor
    ? subtotal
    : subtotal - byCategory.labor;
  const scale = subtotal > 0 ? (subtotal + contingency + markup) / subtotal : 0;
  const tax = Math.round(taxableBase * scale * toRate(quote.taxPct));

  const total = subtotal + contingency + markup + tax;
  const deposit = Math.round(total * toRate(quote.depositPct));

  return { byCategory, subtotal, contingency, markup, tax, total, deposit };
}

export function formatMoney(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    cents / 100,
  );
}

/** Quote number like Q-20261126-4821, readable and good enough to be unique. */
export function newQuoteNumber(date = new Date(), rand = Math.random) {
  const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = String(Math.floor(rand() * 9000) + 1000);
  return `Q-${ymd}-${suffix}`;
}

/** CSV with one row per line item, quoting fields that need it. */
export function toCsv(quote) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const rows = [['Category', 'Description', 'Qty', 'Unit', 'Unit price', 'Line total']];
  for (const item of quote.items ?? []) {
    const cat = CATEGORIES[item.category] ?? CATEGORIES.other;
    rows.push([
      cat.label,
      item.description,
      toQty(item.qty),
      cat.unit,
      (toCents(item.unitPrice) / 100).toFixed(2),
      (lineTotalCents(item) / 100).toFixed(2),
    ]);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
