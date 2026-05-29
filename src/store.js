import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from './config.js';

/**
 * @returns {Array<import('./parse-markdown-tables.js').parsePricingMarkdown extends (...args: unknown[]) => infer R ? R : never>}
 */
export function readSnapshots() {
  if (!existsSync(config.snapshotsPath)) {
    return [];
  }
  const lines = readFileSync(config.snapshotsPath, 'utf8').split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

/**
 * @param {object} snapshot
 * @returns {{ snapshots: object[], status: 'created' | 'updated' | 'unchanged' }}
 */
export function upsertSnapshot(snapshot) {
  mkdirSync(dirname(config.snapshotsPath), { recursive: true });
  const snapshots = readSnapshots();
  const dayKey = snapshot.crawledAt.slice(0, 10);
  const hash = hashTables(snapshot);

  const existingIndex = snapshots.findIndex((s) => s.crawledAt.slice(0, 10) === dayKey);
  if (existingIndex >= 0) {
    const existing = snapshots[existingIndex];
    if (hashTables(existing) === hash) {
      return { snapshots, status: 'unchanged' };
    }
    snapshots[existingIndex] = snapshot;
    writeSnapshots(snapshots);
    writeHistoryJs(snapshots);
    return { snapshots, status: 'updated' };
  }

  snapshots.push(snapshot);
  snapshots.sort((a, b) => a.crawledAt.localeCompare(b.crawledAt));
  writeSnapshots(snapshots);
  writeHistoryJs(snapshots);
  return { snapshots, status: 'created' };
}

/**
 * @param {{ lastCrawledAt: string, status: 'created' | 'updated' | 'unchanged', sourceUrl: string }} meta
 */
export function writeCrawlMeta(meta) {
  mkdirSync(dirname(config.crawlMetaJsPath), { recursive: true });
  const tempPath = `${config.crawlMetaJsPath}.tmp`;
  const content = `window.CRAWL_META = ${JSON.stringify(meta, null, 2)};\n`;
  writeFileSync(tempPath, content, 'utf8');
  renameSync(tempPath, config.crawlMetaJsPath);
  syncDataScriptVersions(meta.lastCrawledAt);
}

/**
 * @param {string} version
 */
function syncDataScriptVersions(version) {
  if (!existsSync(config.indexHtmlPath)) {
    return;
  }
  const encoded = encodeURIComponent(version);
  const content = readFileSync(config.indexHtmlPath, 'utf8');
  const updated = content
    .replace(/src="data\/crawl-meta\.js(?:\?[^"]*)?"/, `src="data/crawl-meta.js?v=${encoded}"`)
    .replace(/src="data\/history\.js(?:\?[^"]*)?"/, `src="data/history.js?v=${encoded}"`);
  if (updated !== content) {
    writeFileSync(config.indexHtmlPath, updated, 'utf8');
  }
}

/**
 * @param {object[]} snapshots
 */
function writeSnapshots(snapshots) {
  const body = snapshots.map((s) => JSON.stringify(s)).join('\n') + (snapshots.length ? '\n' : '');
  writeFileSync(config.snapshotsPath, body, 'utf8');
}

/**
 * @param {object[]} snapshots
 */
export function writeHistoryJs(snapshots) {
  mkdirSync(dirname(config.historyJsPath), { recursive: true });
  const tempPath = `${config.historyJsPath}.tmp`;
  const content = `window.PRICE_SNAPSHOTS = ${JSON.stringify(snapshots, null, 2)};\n`;
  writeFileSync(tempPath, content, 'utf8');
  renameSync(tempPath, config.historyJsPath);
}

/**
 * @param {object} snapshot
 * @returns {string}
 */
function hashTables(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot.tables)).digest('hex');
}
