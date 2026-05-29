const TARGET_SECTIONS = new Map([
  ['auto-pricing', { heading: 'Auto pricing', level: 3 }],
  ['model-pricing', { heading: 'Model pricing', level: 3 }],
  ['plans', { heading: 'Plans', level: 2 }],
]);

/**
 * @param {string} markdown
 * @param {string} sourceUrl
 * @returns {{ crawledAt: string, sourceUrl: string, tables: Array<{ slug: string, title: string, columns: string[], rows: Record<string, unknown>[] }> }}
 */
export function parsePricingMarkdown(markdown, sourceUrl) {
  const lines = markdown.split('\n');
  /** @type {Map<string, { slug: string, title: string, columns: string[], rows: Record<string, unknown>[] }>} */
  const tablesBySlug = new Map();

  let activeSlug = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);

    if (h2) {
      const title = h2[1].trim();
      activeSlug = title === 'Plans' ? 'plans' : null;
      i += 1;
      continue;
    }

    if (h3) {
      const title = h3[1].trim();
      activeSlug = null;
      for (const [slug, config] of TARGET_SECTIONS) {
        if (config.level === 3 && config.heading === title) {
          activeSlug = slug;
          break;
        }
      }
      i += 1;
      continue;
    }

    if (activeSlug && isTableRow(line)) {
      const tableLines = collectTableLines(lines, i);
      const parsed = parseTableBlock(tableLines);
      if (parsed && parsed.rows.length > 0) {
        const config = TARGET_SECTIONS.get(activeSlug);
        tablesBySlug.set(activeSlug, {
          slug: activeSlug,
          title: config?.heading ?? activeSlug,
          columns: parsed.columns,
          rows: parsed.rows,
        });
      }
      i += tableLines.length;
      activeSlug = activeSlug === 'plans' ? null : activeSlug;
      continue;
    }

    i += 1;
  }

  const order = ['auto-pricing', 'model-pricing', 'plans'];
  const tables = order
    .filter((slug) => tablesBySlug.has(slug))
    .map((slug) => tablesBySlug.get(slug));

  return {
    crawledAt: new Date().toISOString(),
    sourceUrl,
    tables,
  };
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @returns {string[]}
 */
function collectTableLines(lines, start) {
  const block = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isTableRow(line)) {
      break;
    }
    block.push(line);
  }
  return block;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

/**
 * @param {string[]} tableLines
 * @returns {{ columns: string[], rows: Record<string, unknown>[] } | null}
 */
function parseTableBlock(tableLines) {
  if (tableLines.length < 2) {
    return null;
  }

  const headerCells = splitTableRow(tableLines[0]);
  const separatorCells = splitTableRow(tableLines[1]);
  if (!separatorCells.every((cell) => /^:?-+:?$/.test(cell.trim()))) {
    return null;
  }

  const columns = headerCells.map((cell) => headerToKey(cell));
  const rows = [];

  for (let i = 2; i < tableLines.length; i += 1) {
    const cells = splitTableRow(tableLines[i]);
    if (cells.length !== columns.length) {
      continue;
    }
    /** @type {Record<string, unknown>} */
    const row = {};
    for (let c = 0; c < columns.length; c += 1) {
      row[columns[c]] = parseCellValue(cells[c], columns[c]);
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * @param {string} header
 * @returns {string}
 */
const HEADER_ALIASES = new Map([
  ['token type', 'tokenType'],
  ['price per 1m tokens', 'pricePer1MTokens'],
  ['cache write', 'cacheWrite'],
  ['cache read', 'cacheRead'],
  ['api usage included', 'apiUsageIncluded'],
  ['auto + composer', 'autoPlusComposer'],
]);

function headerToKey(header) {
  const lower = header.trim().toLowerCase();
  if (HEADER_ALIASES.has(lower)) {
    return HEADER_ALIASES.get(lower);
  }

  const normalized = lower
    .replace(/[^a-z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

/**
 * @param {string} raw
 * @param {string} columnKey
 * @returns {unknown}
 */
function parseCellValue(raw, columnKey) {
  const text = stripMarkdownLinks(raw.trim());
  if (text === '-' || text === '') {
    return null;
  }

  const plainMoney = text.match(/^\$([\d.]+)$/);
  if (plainMoney) {
    return parseFloat(plainMoney[1]);
  }

  const monthlyMoney = text.match(/^\$([\d.]+)\/mo$/i);
  if (monthlyMoney && columnKey === 'price') {
    return {
      priceLabel: text,
      priceMonthly: parseFloat(monthlyMoney[1]),
    };
  }

  if (text.startsWith('$')) {
    const amount = text.match(/\$([\d.]+)/);
    if (amount && columnKey === 'apiUsageIncluded') {
      return parseFloat(amount[1]);
    }
    if (columnKey === 'price') {
      return { priceLabel: text, priceMonthly: amount ? parseFloat(amount[1]) : null };
    }
  }

  return text;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripMarkdownLinks(value) {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

/**
 * @param {{ tables: Array<{ slug: string, rows: unknown[] }> }} snapshot
 * @returns {boolean}
 */
export function validateSnapshot(snapshot) {
  const modelTable = snapshot.tables.find((t) => t.slug === 'model-pricing');
  return Boolean(modelTable && modelTable.rows.length > 0);
}
