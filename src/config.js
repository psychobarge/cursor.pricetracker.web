import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

loadEnvFile(join(ROOT, '.env'));

const DEFAULT_DOCS_URL = 'https://cursor.com/docs/models-and-pricing.md';

export const config = {
  rootDir: ROOT,
  docsMdUrl: process.env.DOCS_MD_URL || DEFAULT_DOCS_URL,
  snapshotsPath: join(ROOT, 'data', 'snapshots.jsonl'),
  historyJsPath: join(ROOT, 'public', 'data', 'history.js'),
  crawlMetaJsPath: join(ROOT, 'public', 'data', 'crawl-meta.js'),
  indexHtmlPath: join(ROOT, 'public', 'index.html'),
};

/**
 * @param {string} path
 */
function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
