const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 30_000;
const MAX_BODY_LOG_CHARS = 500;

const RETRYABLE_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

const FETCH_HEADERS = { Accept: 'text/markdown, text/plain, */*' };

/**
 * @param {number} attempt
 * @param {number} baseDelayMs
 * @returns {number}
 */
export function retryDelayMs(attempt, baseDelayMs = DEFAULT_BASE_DELAY_MS) {
  return baseDelayMs * 2 ** (attempt - 1);
}

/**
 * @param {number} status
 * @returns {boolean}
 */
export function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * @param {Response} response
 * @param {number} attempt
 * @param {number} maxAttempts
 * @param {string} url
 * @returns {Promise<string>}
 */
async function formatFetchFailure(response, attempt, maxAttempts, url) {
  const contentType = response.headers.get('content-type') ?? '(none)';
  const matchedPath = response.headers.get('x-matched-path');
  const vercelCache = response.headers.get('x-vercel-cache');
  const body = await response.text();
  const truncatedBody =
    body.length > MAX_BODY_LOG_CHARS
      ? `${body.slice(0, MAX_BODY_LOG_CHARS)}…`
      : body;

  const lines = [
    `Fetch attempt ${attempt}/${maxAttempts} failed for ${url}`,
    `  status: ${response.status} ${response.statusText}`,
    `  content-type: ${contentType}`,
  ];

  if (matchedPath) {
    lines.push(`  x-matched-path: ${matchedPath}`);
  }
  if (vercelCache) {
    lines.push(`  x-vercel-cache: ${vercelCache}`);
  }
  if (truncatedBody) {
    lines.push(`  body: ${truncatedBody}`);
  }

  return lines.join('\n');
}

/**
 * @param {string} url
 * @param {{
 *   fetchFn?: typeof fetch,
 *   delayFn?: (ms: number) => Promise<void>,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 * }} [options]
 * @returns {Promise<string>}
 */
export async function fetchDocsMarkdown(url, options = {}) {
  const {
    fetchFn = fetch,
    delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
  } = options;

  /** @type {string[]} */
  const failures = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchFn(url, { headers: FETCH_HEADERS });

    if (response.ok) {
      return response.text();
    }

    const failureLog = await formatFetchFailure(response, attempt, maxAttempts, url);
    failures.push(failureLog);
    console.error(failureLog);

    if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
      break;
    }

    const delayMs = retryDelayMs(attempt, baseDelayMs);
    console.error(`  retrying in ${delayMs / 1000}s…`);
    await delayFn(delayMs);
  }

  throw new Error(
    `Fetch failed after ${maxAttempts} attempt(s) for ${url}\n${failures.join('\n')}`,
  );
}
