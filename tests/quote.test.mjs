import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateTotals,
  lineTotalCents,
  newQuoteNumber,
  toCents,
  toCsv,
  toRate,
} from '../src/quote.js';

test('money parsing avoids floating point drift', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), 30);
  assert.equal(toCents('19.995'), 2000);
  assert.equal(toCents('abc'), 0);
});

test('rates clamp to 0-100%', () => {
  assert.equal(toRate('15'), 0.15);
  assert.equal(toRate('-5'), 0);
  assert.equal(toRate('250'), 1);
});

test('line total handles fractional hours', () => {
  assert.equal(lineTotalCents({ qty: '7.5', unitPrice: '42' }), 31500);
  assert.equal(lineTotalCents({ qty: '-2', unitPrice: '42' }), 0);
});

test('full quote: contingency, markup, then tax on materials only', () => {
  const t = calculateTotals({
    items: [
      { category: 'labor', qty: 10, unitPrice: 50 }, // $500
      { category: 'material', qty: 4, unitPrice: 125 }, // $500
    ],
    contingencyPct: 10, // $100
    markupPct: 20, // 20% of $1,100 = $220
    taxPct: 8.25,
    depositPct: 50,
  });

  assert.equal(t.subtotal, 100000);
  assert.equal(t.contingency, 10000);
  assert.equal(t.markup, 22000);
  // Materials $500 scaled by 1320/1000 = $660 taxable -> $54.45
  assert.equal(t.tax, 5445);
  assert.equal(t.total, 137445);
  assert.equal(t.deposit, 68723);
});

test('taxLabor taxes the whole job', () => {
  const t = calculateTotals({
    items: [{ category: 'labor', qty: 1, unitPrice: 100 }],
    taxPct: 10,
    taxLabor: true,
  });
  assert.equal(t.tax, 1000);
});

test('empty quote is all zeros', () => {
  const t = calculateTotals({ items: [] });
  assert.equal(t.total, 0);
  assert.equal(t.tax, 0);
});

test('quote number format', () => {
  const n = newQuoteNumber(new Date('2026-11-26T12:00:00Z'), () => 0);
  assert.equal(n, 'Q-20261126-1000');
});

test('CSV escapes commas and quotes', () => {
  const csv = toCsv({
    items: [{ category: 'material', description: 'Bolts, 3/4" A325', qty: 2, unitPrice: 1.5 }],
  });
  assert.match(csv, /"Bolts, 3\/4"" A325"/);
  assert.match(csv, /Materials/);
});
