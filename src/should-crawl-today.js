import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CRAWL_META_PATH = join(ROOT, 'public', 'data', 'crawl-meta.js');
const PARIS_TZ = 'Europe/Paris';

/**
 * @param {Date} date
 * @returns {string}
 */
export function parisDateKey(date) {
  return date.toLocaleString('en-CA', { timeZone: PARIS_TZ }).slice(0, 10);
}

/**
 * @param {string} path
 * @returns {string | null}
 */
export function readLastCrawledAt(path) {
  if (!existsSync(path)) {
    return null;
  }

  const content = readFileSync(path, 'utf8');
  const match = content.match(/"lastCrawledAt":\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * @param {{
 *   lastCrawledAt?: string | null,
 *   now?: Date,
 *   force?: boolean,
 * }} [options]
 * @returns {{ shouldCrawl: boolean, todayParis: string, lastSuccessParis: string | null, reason: string }}
 */
export function evaluateCrawlSchedule(options = {}) {
  const {
    lastCrawledAt = readLastCrawledAt(CRAWL_META_PATH),
    now = new Date(),
    force = false,
  } = options;

  const todayParis = parisDateKey(now);
  const lastSuccessParis = lastCrawledAt ? parisDateKey(new Date(lastCrawledAt)) : null;

  if (force) {
    return {
      shouldCrawl: true,
      todayParis,
      lastSuccessParis,
      reason: 'forced run',
    };
  }

  if (lastSuccessParis === todayParis) {
    return {
      shouldCrawl: false,
      todayParis,
      lastSuccessParis,
      reason: `last successful crawl on ${lastSuccessParis} (Paris), today is ${todayParis} (Paris)`,
    };
  }

  const lastLabel = lastSuccessParis ?? 'never';
  return {
    shouldCrawl: true,
    todayParis,
    lastSuccessParis,
    reason: `no successful crawl yet for ${todayParis} (Paris), last success was ${lastLabel} (Paris)`,
  };
}

function main() {
  const force = process.argv.includes('--force');
  const { shouldCrawl, reason } = evaluateCrawlSchedule({ force });

  if (shouldCrawl) {
    console.log(`Running: ${reason}`);
    process.exit(0);
  }

  console.log(`Skipping: ${reason}`);
  process.exit(1);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main();
}
