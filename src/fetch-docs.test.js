import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDocsMarkdown,
  isRetryableStatus,
  retryDelayMs,
} from './fetch-docs.js';

/**
 * @param {number} status
 * @param {string} [body]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function mockResponse(status, body = '', headers = {}) {
  return new Response(body, {
    status,
    statusText: status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Error',
    headers,
  });
}

describe('fetch-docs helpers', () => {
  it('retryDelayMs uses exponential backoff from 30s', () => {
    assert.equal(retryDelayMs(1), 30_000);
    assert.equal(retryDelayMs(2), 60_000);
    assert.equal(retryDelayMs(3), 120_000);
  });

  it('isRetryableStatus covers transient errors including 404', () => {
    assert.equal(isRetryableStatus(404), true);
    assert.equal(isRetryableStatus(503), true);
    assert.equal(isRetryableStatus(403), false);
  });
});

describe('fetchDocsMarkdown', () => {
  it('succeeds on second attempt after a 404', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      if (calls === 1) {
        return mockResponse(404, '{"error":"missing"}', {
          'content-type': 'application/json',
          'x-matched-path': '/api/raw',
        });
      }
      return mockResponse(200, '# Models & Pricing\n');
    };

    const markdown = await fetchDocsMarkdown('https://example.com/docs.md', {
      fetchFn,
      delayFn: async () => {},
      maxAttempts: 4,
    });

    assert.equal(markdown, '# Models & Pricing\n');
    assert.equal(calls, 2);
  });

  it('fails after max attempts with logged body in error', async () => {
    const fetchFn = async () =>
      mockResponse(404, '{"error":"Path not found"}', {
        'content-type': 'application/json',
        'x-vercel-cache': 'MISS',
      });

    await assert.rejects(
      () =>
        fetchDocsMarkdown('https://example.com/docs.md', {
          fetchFn,
          delayFn: async () => {},
          maxAttempts: 4,
        }),
      (err) => {
        assert.match(String(err.message), /Fetch failed after 4 attempt/);
        assert.match(String(err.message), /Path not found/);
        assert.match(String(err.message), /x-vercel-cache: MISS/);
        return true;
      },
    );
  });

  it('does not retry on non-retryable 403', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return mockResponse(403, 'Forbidden');
    };

    await assert.rejects(
      () =>
        fetchDocsMarkdown('https://example.com/docs.md', {
          fetchFn,
          delayFn: async () => {},
          maxAttempts: 4,
        }),
      /Fetch failed after 4 attempt/,
    );

    assert.equal(calls, 1);
  });
});
