const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_BODY_LOG_CHARS = 500;

const RETRYABLE_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

// Vercel /api/raw intermittently 404s when Accept includes a wildcard. Rotate strategies per attempt.
const FETCH_STRATEGIES = [
  { label: 'Accept: text/markdown', init: { headers: { Accept: 'text/markdown' } } },
  { label: 'default headers', init: {} },
  { label: 'Accept: text/plain', init: { headers: { Accept: 'text/plain' } } },
];

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000, 120_000];

/**
 * @param {number} attempt
 * @returns {number}
 */
export function retryDelayMs(attempt) {
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

/**
 * @param {number} attempt
 * @returns {{ label: string, init: RequestInit }}
 */
export function fetchStrategyForAttempt(attempt) {
  return FETCH_STRATEGIES[(attempt - 1) % FETCH_STRATEGIES.length];
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
 * @param {string} strategyLabel
 * @returns {Promise<string>}
 */
async function formatFetchFailure(response, attempt, maxAttempts, url, strategyLabel) {
  const contentType = response.headers.get('content-type') ?? '(none)';
  const matchedPath = response.headers.get('x-matched-path');
  const vercelCache = response.headers.get('x-vercel-cache');
  const body = await response.text();
  const truncatedBody =
    body.length > MAX_BODY_LOG_CHARS
      ? `${body.slice(0, MAX_BODY_LOG_CHARS)}…`
      : body;

  const lines = [
    `Fetch attempt ${attempt}/${maxAttempts} failed for ${url} (${strategyLabel})`,
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
 * }} [options]
 * @returns {Promise<string>}
 */
export async function fetchDocsMarkdown(url, options = {}) {
  const {
    fetchFn = fetch,
    delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;

  /** @type {string[]} */
  const failures = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { label, init } = fetchStrategyForAttempt(attempt);
    const response = await fetchFn(url, init);

    if (response.ok) {
      return response.text();
    }

    const failureLog = await formatFetchFailure(response, attempt, maxAttempts, url, label);
    failures.push(failureLog);
    console.error(failureLog);

    if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
      break;
    }

    const delayMs = retryDelayMs(attempt);
    const nextStrategy = fetchStrategyForAttempt(attempt + 1);
    console.error(`  retrying in ${delayMs / 1000}s with ${nextStrategy.label}…`);
    await delayFn(delayMs);
  }

  throw new Error(
    `Fetch failed after ${maxAttempts} attempt(s) for ${url}\n${failures.join('\n')}`,
  );
}
