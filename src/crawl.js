import { parsePricingMarkdown, validateSnapshot } from './parse-markdown-tables.js';
import { config } from './config.js';
import { upsertSnapshot, writeCrawlMeta } from './store.js';
import { fetchDocsMarkdown } from './fetch-docs.js';

async function main() {
  const markdown = await fetchDocsMarkdown(config.docsMdUrl);
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
