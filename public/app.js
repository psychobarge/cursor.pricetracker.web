/** @type {Array<{ crawledAt: string, sourceUrl: string, tables: Array<{ slug: string, title: string, columns: string[], rows: Record<string, unknown>[] }> }>} */
const snapshots = window.PRICE_SNAPSHOTS || [];
/** @type {{ lastCrawledAt?: string, status?: string, sourceUrl?: string }} */
const crawlMeta = window.CRAWL_META || {};

const TABLE_ROW_KEYS = {
  'auto-pricing': 'tokenType',
  'model-pricing': 'model',
  plans: 'plan',
};

/** @type {import('chart.js').Chart | null} */
let chart = null;

const app = document.getElementById('app');
const emptyState = document.getElementById('emptyState');
const tableSelect = document.getElementById('tableSelect');
const metricSelect = document.getElementById('metricSelect');
const seriesSelect = document.getElementById('seriesSelect');
const snapshotMeta = document.getElementById('snapshotMeta');
const comparisonEl = document.getElementById('comparison');
const comparisonHeading = document.getElementById('comparisonHeading');
const comparisonSnapshotSelect = document.getElementById('comparisonSnapshotSelect');
const lastCrawlLabel = document.getElementById('lastCrawlLabel');
const crawlSourceLink = document.getElementById('crawlSourceLink');

function init() {
  if (crawlMeta.lastCrawledAt) {
    lastCrawlLabel.textContent = `Last crawled on ${formatDateTime(crawlMeta.lastCrawledAt)}`;
    lastCrawlLabel.classList.remove('hidden');
    if (crawlMeta.sourceUrl) {
      updateCrawlSourceLink(crawlMeta.sourceUrl);
    }
  }

  if (!snapshots.length) {
    return;
  }

  emptyState.classList.add('hidden');
  app.classList.remove('hidden');

  const latestSnapshot = snapshots[snapshots.length - 1];
  if (!crawlMeta.lastCrawledAt) {
    lastCrawlLabel.textContent = `Last crawled on ${formatDateTime(latestSnapshot.crawledAt)}`;
    lastCrawlLabel.classList.remove('hidden');
    updateCrawlSourceLink(latestSnapshot.sourceUrl);
  }

  const slugs = collectTableSlugs();
  tableSelect.innerHTML = slugs
    .map((slug) => {
      const title = findTable(snapshots[snapshots.length - 1], slug)?.title ?? slug;
      return `<option value="${slug}">${title}</option>`;
    })
    .join('');

  if (slugs.includes('model-pricing')) {
    tableSelect.value = 'model-pricing';
  }

  snapshotMeta.textContent = `${snapshots.length} snapshot(s) — latest ${formatDate(snapshots[snapshots.length - 1].crawledAt)}`;

  tableSelect.addEventListener('change', refreshSelectors);
  metricSelect.addEventListener('change', renderChart);
  seriesSelect.addEventListener('change', renderChart);
  comparisonSnapshotSelect.addEventListener('change', renderComparison);

  populateComparisonSnapshotSelect();
  refreshSelectors();
  renderComparison();
}

function populateComparisonSnapshotSelect() {
  const options = snapshots
    .map((snap, index) => {
      const label = formatDateTime(snap.crawledAt);
      return `<option value="${index}">${label}</option>`;
    })
    .join('');
  comparisonSnapshotSelect.innerHTML =
    '<option value="">Default (latest vs previous)</option>' + options;
}

function collectTableSlugs() {
  const set = new Set();
  for (const snap of snapshots) {
    for (const table of snap.tables) {
      set.add(table.slug);
    }
  }
  return ['auto-pricing', 'model-pricing', 'plans'].filter((s) => set.has(s));
}

/**
 * @param {object} snapshot
 * @param {string} slug
 */
function findTable(snapshot, slug) {
  return snapshot.tables.find((t) => t.slug === slug);
}

function refreshSelectors() {
  const slug = tableSelect.value;
  const latest = snapshots[snapshots.length - 1];
  const table = findTable(latest, slug);
  if (!table) {
    return;
  }

  const metrics = numericMetricsForTable(table);
  metricSelect.innerHTML = metrics
    .map((m) => `<option value="${m}">${m}</option>`)
    .join('');

  const rowKey = TABLE_ROW_KEYS[slug] ?? table.columns[0];
  const labels = new Set();
  for (const snap of snapshots) {
    const t = findTable(snap, slug);
    if (!t) {
      continue;
    }
    for (const row of t.rows) {
      const label = String(row[rowKey] ?? '');
      if (label) {
        labels.add(label);
      }
    }
  }

  const sorted = [...labels].sort((a, b) => a.localeCompare(b));
  seriesSelect.innerHTML = sorted.map((l) => `<option value="${l}">${l}</option>`).join('');

  for (const option of seriesSelect.options) {
    option.selected = true;
  }

  renderChart();
}

/**
 * @param {{ columns: string[], rows: Record<string, unknown>[] }} table
 * @returns {string[]}
 */
function numericMetricsForTable(table) {
  const metrics = new Set();
  for (const row of table.rows) {
    for (const col of table.columns) {
      const v = row[col];
      if (typeof v === 'number') {
        metrics.add(col);
      } else if (v && typeof v === 'object' && v.priceMonthly != null) {
        metrics.add('priceMonthly');
      }
    }
  }
  return [...metrics];
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} metric
 * @returns {number | null}
 */
function metricValue(row, metric) {
  const raw = row[metric];
  if (typeof raw === 'number') {
    return raw;
  }
  if (metric === 'priceMonthly' && raw && typeof raw === 'object' && 'priceMonthly' in raw) {
    return /** @type {{ priceMonthly: number }} */ (raw).priceMonthly;
  }
  if (raw && typeof raw === 'object' && 'priceMonthly' in raw) {
    return /** @type {{ priceMonthly: number | null }} */ (raw).priceMonthly;
  }
  return null;
}

function renderChart() {
  const slug = tableSelect.value;
  const metric = metricSelect.value;
  const selected = [...seriesSelect.selectedOptions].map((o) => o.value);
  const rowKey = TABLE_ROW_KEYS[slug] ?? 'model';
  const labels = snapshots.map((s) => formatDate(s.crawledAt));

  const colorMap = buildSeriesColorMap(selected, slug);

  const datasets = selected.map((seriesName) => {
    const data = snapshots.map((snap) => {
      const table = findTable(snap, slug);
      if (!table) {
        return null;
      }
      const row = table.rows.find((r) => String(r[rowKey]) === seriesName);
      if (!row) {
        return null;
      }
      return metricValue(row, metric);
    });

    const color = colorMap.get(seriesName) ?? palette(0);

    return {
      label: seriesName,
      data,
      borderColor: color,
      backgroundColor: color,
      tension: 0.2,
      spanGaps: true,
    };
  });

  const ctx = /** @type {HTMLCanvasElement} */ (document.getElementById('priceChart')).getContext('2d');
  if (!ctx) {
    return;
  }

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        title: {
          display: true,
          text: `${metric} — ${tableSelect.selectedOptions[0]?.text ?? slug}`,
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'USD' },
        },
      },
    },
  });
}

function renderComparison() {
  if (snapshots.length < 1) {
    comparisonEl.innerHTML = '<p class="meta">Not enough data.</p>';
    return;
  }

  const pair = resolveComparisonSnapshots();
  const current = pair.current;
  const previous = pair.previous;
  const slug = 'model-pricing';
  const currentTable = findTable(current, slug);
  if (!currentTable) {
    comparisonEl.innerHTML = '<p class="meta">No model-pricing in selected snapshot.</p>';
    comparisonHeading.textContent = pair.heading;
    return;
  }

  const prevTable = previous ? findTable(previous, slug) : null;
  const metrics = ['input', 'output', 'cacheWrite', 'cacheRead'];
  const valueHeader = formatDateTime(current.crawledAt);

  comparisonHeading.textContent = pair.heading;

  let html = '<table><thead><tr><th>Model</th>';
  for (const m of metrics) {
    html += `<th>${m} (${escapeHtml(valueHeader)})</th><th>Δ</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of currentTable.rows) {
    const name = String(row.model ?? '');
    const prevRow = prevTable?.rows.find((r) => r.model === row.model);
    html += `<tr><td>${escapeHtml(name)}</td>`;
    for (const m of metrics) {
      const cur = metricValue(row, m);
      const prev = prevRow ? metricValue(prevRow, m) : null;
      const delta = formatDelta(prev, cur);
      html += `<td>${cur ?? '—'}</td><td class="${delta.class}">${delta.text}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  comparisonEl.innerHTML = html;
}

/**
 * @returns {{ current: object, previous: object | null, heading: string }}
 */
function resolveComparisonSnapshots() {
  const raw = comparisonSnapshotSelect.value;
  if (raw === '') {
    const current = snapshots[snapshots.length - 1];
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
    return {
      current,
      previous,
      heading: 'Latest vs previous',
    };
  }

  const index = Number.parseInt(raw, 10);
  if (!Number.isFinite(index) || index < 0 || index >= snapshots.length) {
    const current = snapshots[snapshots.length - 1];
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
    return {
      current,
      previous,
      heading: 'Latest vs previous',
    };
  }

  const current = snapshots[index];
  const previous = index > 0 ? snapshots[index - 1] : null;
  const dateLabel = formatDateTime(current.crawledAt);
  const prevLabel = previous ? formatDateTime(previous.crawledAt) : null;
  const heading = prevLabel
    ? `${dateLabel} vs ${prevLabel}`
    : `${dateLabel} (no previous snapshot)`;

  return { current, previous, heading };
}

/**
 * @param {number | null} prev
 * @param {number | null} cur
 */
function formatDelta(prev, cur) {
  if (prev == null || cur == null) {
    return { text: '—', class: '' };
  }
  if (prev === cur) {
    return { text: '0%', class: '' };
  }
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'delta-up' : 'delta-down';
  return { text: `${sign}${pct.toFixed(1)}%`, class: cls };
}

/**
 * @param {string} iso
 */
function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * @param {string} iso
 */
function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {string} sourceUrl
 */
function docsPageUrl(sourceUrl) {
  return sourceUrl.endsWith('.md') ? sourceUrl.slice(0, -3) : sourceUrl;
}

/**
 * @param {string} pageUrl
 */
function docsPageLabel(pageUrl) {
  const url = new URL(pageUrl);
  return `${url.host}${url.pathname.replace(/\/$/, '')}`;
}

/**
 * @param {string} sourceUrl
 */
function updateCrawlSourceLink(sourceUrl) {
  const pageUrl = docsPageUrl(sourceUrl);
  crawlSourceLink.href = pageUrl;
  crawlSourceLink.textContent = docsPageLabel(pageUrl);
}

/** Shades per model family (light → dark within family). */
const MODEL_FAMILY_COLORS = {
  claude: ['#fdba74', '#fb923c', '#f97316', '#f0883e', '#ea580c', '#c2410c', '#9a3412', '#7c2d12'],
  gemini: ['#93c5fd', '#79c0ff', '#6cb6ff', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'],
  gpt: ['#d0d7de', '#c9d1d9', '#afb8c1', '#8b949e', '#6e7681', '#57606a', '#484f58', '#30363d'],
  composer: ['#e9d5ff', '#d2a8ff', '#bc8cff', '#a371f7', '#8957e5', '#7c3aed', '#6d28d9', '#5b21b6'],
  grok: ['#ffa198', '#ff7b72', '#f85149', '#e5534b', '#da3633', '#cf222e', '#a40e26', '#82071e'],
  kimi: ['#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a'],
  other: ['#3fb950', '#d29922', '#58a6ff', '#f778ba', '#56d364', '#db6d28', '#a5d6ff', '#7ee787'],
};

/**
 * @param {string} seriesName
 * @returns {keyof typeof MODEL_FAMILY_COLORS}
 */
function detectModelFamily(seriesName) {
  const name = seriesName.toLowerCase();
  if (name.includes('claude')) {
    return 'claude';
  }
  if (name.includes('gemini')) {
    return 'gemini';
  }
  if (name.includes('gpt')) {
    return 'gpt';
  }
  if (name.includes('composer')) {
    return 'composer';
  }
  if (name.includes('grok')) {
    return 'grok';
  }
  if (name.includes('kimi')) {
    return 'kimi';
  }
  return 'other';
}

/**
 * @param {string[]} seriesNames
 * @param {string} tableSlug
 * @returns {Map<string, string>}
 */
function buildSeriesColorMap(seriesNames, tableSlug) {
  const map = new Map();
  if (tableSlug !== 'model-pricing') {
    seriesNames.forEach((name, i) => map.set(name, palette(i)));
    return map;
  }

  /** @type {Map<string, string[]>} */
  const buckets = new Map();
  for (const name of seriesNames) {
    const family = detectModelFamily(name);
    if (!buckets.has(family)) {
      buckets.set(family, []);
    }
    buckets.get(family).push(name);
  }

  for (const [family, names] of buckets) {
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const shades = MODEL_FAMILY_COLORS[family] ?? MODEL_FAMILY_COLORS.other;
    sorted.forEach((name, i) => {
      map.set(name, shades[i % shades.length]);
    });
  }

  return map;
}

/**
 * @param {number} i
 */
function palette(i) {
  const colors = ['#6cb6ff', '#3fb950', '#f0883e', '#d2a8ff', '#ff7b72', '#79c0ff'];
  return colors[i % colors.length];
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
