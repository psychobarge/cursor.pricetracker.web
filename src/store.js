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
