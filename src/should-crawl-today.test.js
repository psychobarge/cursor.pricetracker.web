import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCrawlSchedule, parisDateKey } from './should-crawl-today.js';

describe('should-crawl-today', () => {
  it('parisDateKey converts UTC timestamps to Paris calendar day', () => {
    // 2026-06-14T23:30:00Z = 2026-06-15 01:30 Paris (CEST)
    assert.equal(parisDateKey(new Date('2026-06-14T23:30:00.000Z')), '2026-06-15');
    assert.equal(parisDateKey(new Date('2026-06-10T12:58:10.621Z')), '2026-06-10');
  });

  it('skips when last successful crawl is on the same Paris day', () => {
    const result = evaluateCrawlSchedule({
      lastCrawledAt: '2026-06-15T08:00:00.000Z',
      now: new Date('2026-06-15T20:00:00.000Z'),
    });

    assert.equal(result.shouldCrawl, false);
    assert.match(result.reason, /last successful crawl on 2026-06-15/);
  });

  it('runs when last success is on a previous Paris day', () => {
    const result = evaluateCrawlSchedule({
      lastCrawledAt: '2026-06-10T12:58:10.621Z',
      now: new Date('2026-06-15T10:00:00.000Z'),
    });

    assert.equal(result.shouldCrawl, true);
    assert.match(result.reason, /no successful crawl yet for 2026-06-15/);
    assert.match(result.reason, /last success was 2026-06-10/);
  });

  it('force always runs regardless of last success day', () => {
    const result = evaluateCrawlSchedule({
      lastCrawledAt: '2026-06-15T08:00:00.000Z',
      now: new Date('2026-06-15T20:00:00.000Z'),
      force: true,
    });

    assert.equal(result.shouldCrawl, true);
    assert.equal(result.reason, 'forced run');
  });
});
