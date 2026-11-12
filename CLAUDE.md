# search-mcp-site

Landing and docs site for search-mcp, served at `https://search-mcp.dev`. The README is the
full contract; this file is the short list an agent must hold while editing.

## Rules

- **Vanilla HTML, CSS and JS. No build step.** Edit the files in `site/` directly. Never add
  a framework, a bundler, a preprocessor or a generator script that the repo depends on.
- **Nothing third-party.** No external script, stylesheet, font, image, frame, embed or
  CDN, no cookies, no analytics. `site/_headers` CSP names only `'self'` and `'none'`.
  Outbound `<a href>` links are fine.
- **Documentation only.** Do not embed the ask widget or point anything at a search-mcp
  Worker. `search.vivijure.com` belongs to the vivijure project: never use it here.
- **Source every claim** from search-mcp's README, `docs/`, CHANGELOG or tool schemas at
  the pinned tag. No marketing claim you cannot point at. No announcement copy: Conrad
  writes those.
- **Simplified Technical English**, short sentences, no em-dashes or en-dashes (CI fails).
- **One search-mcp release everywhere.** When search-mcp releases, re-read its CHANGELOG,
  update the content, and move every pin (links at the tag, `--branch`, the npm `@X.Y.Z`
  pin, "search-mcp vX.Y.Z" text) in one PR. `scripts/check-upstream-version.mjs` gates it.
- **Every page is in the nav or footer of every page and in `site/sitemap.xml`.** The
  `coverage` job enforces it.

## Gates (run before every push)

```bash
npm test && npm run validate && npm run check && npm run coverage \
  && node scripts/check-upstream-version.mjs site
```

Each check has controls in `test/` that prove it goes red. When you add a check, add the
control that watches it fail first. `npm run check` reads `git ls-files`, so `git add` new
files before you trust its dash scan.

## Release and deploy

- Bump-at-release: `## Unreleased` collects changes; a release PR renames it to
  `## X.Y.Z (date)` and moves `package.json` and `package-lock.json` to that version.
- The lead tags `vX.Y.Z` on the merge commit on `main` and publishes the GitHub Release.
  The tag deploys (`.github/workflows/deploy.yml`); a merge never does.
- The deploy secret is `SEARCH_MCP_SITE_DEPLOY_TOKEN` (per-function, not the shadowable
  `CLOUDFLARE_API_TOKEN` name), plus `CLOUDFLARE_ACCOUNT_ID`.
- Actions are pinned by full commit SHA with the tag as a trailing comment. Keep it so.
- `main` is PR-only; `ci` and `coverage` are the required check names. Do not rename them.
