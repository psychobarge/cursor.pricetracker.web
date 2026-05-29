import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePricingMarkdown, validateSnapshot } from './parse-markdown-tables.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '__fixtures__', 'models-and-pricing.sample.md');
const fixture = readFileSync(fixturePath, 'utf8');
const SOURCE = 'https://cursor.com/docs/models-and-pricing.md';

describe('parsePricingMarkdown', () => {
  it('extracts auto-pricing, model-pricing, and plans tables', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    assert.equal(snapshot.tables.length, 3);
    assert.deepEqual(
      snapshot.tables.map((t) => t.slug),
      ['auto-pricing', 'model-pricing', 'plans'],
    );
  });

  it('parses money and null cells in model-pricing', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    const model = snapshot.tables.find((t) => t.slug === 'model-pricing');
    assert.ok(model);
    const sonnet = model.rows.find((r) => r.model === 'Claude 4.6 Sonnet');
    assert.ok(sonnet);
    assert.equal(sonnet.input, 3);
    assert.equal(sonnet.cacheWrite, 3.75);
    assert.equal(sonnet.cacheRead, 0.3);
    assert.equal(sonnet.output, 15);

    const composer = model.rows.find((r) => r.model === 'Composer 2.5');
    assert.equal(composer.cacheWrite, null);
    assert.equal(composer.input, 0.5);
  });

  it('strips markdown links from model names', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    const model = snapshot.tables.find((t) => t.slug === 'model-pricing');
    const row = model.rows.find((r) => String(r.model).includes('Claude'));
    assert.equal(row.model, 'Claude 4.6 Sonnet');
  });

  it('parses auto-pricing token rows', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    const auto = snapshot.tables.find((t) => t.slug === 'auto-pricing');
    const output = auto.rows.find((r) => r.tokenType === 'Output');
    assert.equal(output.pricePer1MTokens, 6);
  });

  it('parses plan prices with monthly structure', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    const plans = snapshot.tables.find((t) => t.slug === 'plans');
    const pro = plans.rows.find((r) => r.plan === 'Pro');
    assert.equal(pro.price.priceLabel, '$20/mo');
    assert.equal(pro.price.priceMonthly, 20);
    assert.equal(pro.apiUsageIncluded, 20);
  });

  it('validateSnapshot requires model-pricing with rows', () => {
    const snapshot = parsePricingMarkdown(fixture, SOURCE);
    assert.equal(validateSnapshot(snapshot), true);
    assert.equal(validateSnapshot({ tables: [] }), false);
  });
});
