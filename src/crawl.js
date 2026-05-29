import { parsePricingMarkdown, validateSnapshot } from './parse-markdown-tables.js';
import { config } from './config.js';
import { upsertSnapshot, writeCrawlMeta } from './store.js';

async function main() {
  const response = await fetch(config.docsMdUrl, {
    headers: { Accept: 'text/markdown, text/plain, */*' },
  });

  if (!response.ok) {
    console.error(`Fetch failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const markdown = await response.text();
  const snapshot = parsePricingMarkdown(markdown, config.docsMdUrl);

  if (!validateSnapshot(snapshot)) {
    console.error('Parse failed: model-pricing table missing or empty');
    process.exit(1);
  }

  const { status } = upsertSnapshot(snapshot);
  writeCrawlMeta({
    lastCrawledAt: snapshot.crawledAt,
    status,
    sourceUrl: snapshot.sourceUrl,
  });
  const tableSummary = snapshot.tables
    .map((t) => `${t.slug}(${t.rows.length} rows)`)
    .join(', ');

  console.log(`[${snapshot.crawledAt}] ${status} — ${tableSummary}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
