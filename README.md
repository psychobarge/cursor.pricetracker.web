# Cursor Price Tracker

Daily crawl of [Cursor models & pricing](https://cursor.com/docs/models-and-pricing) into versioned files, with a static chart page hosted on GitHub Pages. **No background server** — a one-shot Node script runs locally, via macOS crontab, or on a GitHub Actions schedule.

## Live site

After deployment, the chart page is available at:

`https://<github-user>.github.io/cursor-pricetracker/`

Replace `<github-user>` with your GitHub username.

## Setup

```bash
npm install   # no runtime dependencies; optional
cp .env.example .env   # optional: override DOCS_MD_URL
```

## Manual crawl

```bash
npm run crawl
```

- Appends or updates today’s line in `data/snapshots.jsonl`
- Regenerates `public/data/history.js` for the UI

Example output:

```text
[2026-05-29T09:00:00.000Z] created — auto-pricing(3 rows), model-pricing(39 rows), plans(3 rows)
```

Status `unchanged` means today’s data matches the previous crawl (hash of tables).

## View charts

Open the static page locally (no `localhost` server):

```bash
open public/index.html
```

Or use the GitHub Pages URL above. Reload after each crawl. Use **Cmd+Shift+R** if the browser caches `history.js`.

Controls:

- **Table** — Auto pricing, Model pricing, or Plans
- **Metric** — numeric column (e.g. `input`, `output`, `priceMonthly`)
- **Series** — model / token type / plan (multi-select)

The comparison table shows the latest **model-pricing** snapshot vs the previous one. Use the **Snapshot** dropdown to load an older snapshot (compared to the one before it); leave **Default** for the current latest-vs-previous view.

## GitHub deployment

### Pages (static site)

GitHub branch deploy only supports `/` or `/docs`, not `/public`. This repo uses a **GitHub Actions** deploy workflow ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

1. Push this repo to GitHub (public).
2. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions** (not “Deploy from a branch”)
3. Push to `main` (or run **Actions → Deploy Pages → Run workflow**). The site redeploys on every push, including crawl commits.

### Scheduled crawl (GitHub Actions)

Workflow: [`.github/workflows/crawl.yml`](.github/workflows/crawl.yml)

- Runs daily at **08:00 Europe/Paris** (hourly UTC cron with a Paris-time guard for DST)
- Fetches Cursor pricing, updates `data/snapshots.jsonl` and `public/data/history.js`, then commits and pushes if data changed
- Manual run: **Actions → Daily crawl → Run workflow**

GitHub Actions cron may start a few minutes late during high load; that is acceptable for a daily job.

## macOS crontab (optional local backup)

1. Find absolute paths:

   ```bash
   which node
   pwd   # project root
   ```

2. Edit crontab: `crontab -e`

3. Paste a line like [`crontab.example`](crontab.example) (adjust paths and time):

   ```cron
   TZ=Europe/Paris
   0 8 * * * cd /Users/you/cursor.pricetracker.web && /opt/homebrew/bin/node src/crawl.js >> /Users/you/cursor.pricetracker.web/data/crawl.log 2>&1
   ```

4. Test manually first: `npm run crawl`

`CRAWL_TIME` in `.env.example` is only a reminder for the hour you set in crontab.

## Data files

| File | Role |
|------|------|
| `data/snapshots.jsonl` | Source of truth (one JSON object per line per day), versioned in git |
| `public/data/history.js` | `window.PRICE_SNAPSHOTS` for the static page, regenerated on each crawl |
| `data/crawl.log` | Optional local crontab stderr/stdout (gitignored) |

## Tests

```bash
npm test
```

Uses `src/__fixtures__/models-and-pricing.sample.md` (no network).

## How it works

The HTML docs page is a SPA; crawling uses the Markdown endpoint:

`https://cursor.com/docs/models-and-pricing.md`

Parsed tables: **auto-pricing**, **model-pricing**, **plans**.
