# search-mcp-site

The landing and docs site for [search-mcp](https://github.com/skyphusion-labs/search-mcp),
the open-source toolkit for Cloudflare AI Search (MCP Worker, streaming `/ask` Worker, ask
widget, git-to-R2 corpus sync). It is served at `https://search-mcp.dev`.

The shape is copied from [postern-site](https://github.com/skyphusion-labs/postern-site):
vanilla HTML, CSS and JS, no build step, a static-assets Cloudflare Worker, and CI checks that
each prove they can go red.

## Rules

- **Vanilla HTML, CSS and JS. No build step, no framework, no preprocessor.** What is in
  `site/` is exactly what is served.
- **Nothing from anyone else.** No third-party scripts, stylesheets, fonts, images, frames,
  embeds or CDNs, and no cookies or analytics. The CSP in `site/_headers` enforces it in the
  browser and `scripts/check-site.mjs` in CI.
- **Documentation only.** The site does not embed the ask widget and calls no search-mcp
  Worker. It never points at `search.vivijure.com`, which serves the vivijure project.
- **Content comes from search-mcp itself**: its README, `docs/`, CHANGELOG and tool schemas
  at the release tag the site pins. No claim that those sources do not support.
- No em-dashes or en-dashes anywhere (CI enforces this).

## Layout

| Path | What |
|---|---|
| `site/` | Everything served: pages, `assets/`, `_headers`, `sitemap.xml`, `robots.txt` |
| `site/sitemap.xml` | The site map. Every page must be listed, built, and linked from every page |
| `scripts/` | The CI checks and the deploy gate (Node, no dependencies) |
| `test/` | Controls: each check must pass a clean fixture and fail each defect it exists to catch |
| `wrangler.toml` | A static-assets-only Cloudflare Worker, `search-mcp-site` |

Pages: `/` (overview), `/install/`, `/configuration/`, `/mcp/` (tool reference),
`/widget/`, `/self-host/`, `/privacy/`, and `404.html`.

Adding a page: create `site/<name>/index.html` from an existing page (copy its header and
footer), add it to the header nav or footer of EVERY page, and add it to
`site/sitemap.xml`. The `coverage` check fails until all three are done.

## Run it locally

```bash
npm ci
npm test                 # the controls
npm run validate         # html-validate
npm run check            # links, assets, third-party, CSP, dashes, preview flag
npm run coverage         # site map coverage
node scripts/check-upstream-version.mjs site   # the site links the latest search-mcp release
npm run dev              # wrangler dev on http://localhost:8787
npm run smoke            # the deployed site, fetched as a browser (needs network)
node scripts/smoke.mjs http://localhost:8787   # the same smoke against wrangler dev
```

## The search-mcp release pin

The site documents one search-mcp release throughout: GitHub links at the tag, the
`git clone --branch` command, the npm install pin `@skyphusion/search-mcp@X.Y.Z`, and
"search-mcp vX.Y.Z" in text. `ci` fails when any of them names a release that is not the
latest (`scripts/check-upstream-version.mjs`, also run daily), and exits 2 (not a pass)
when it cannot read the release list. A new search-mcp release needs a site PR that
re-checks the content against that release and moves every pin, then a site tag.

## Preview mode

`site-mode.json` holds one flag, `"preview"`, and it is `false`. While it is `true`, every
page carries a robots noindex meta, `_headers` sends `X-Robots-Tag: noindex, nofollow`, and
`robots.txt` disallows everything. Change it ONLY with `node scripts/set-preview.mjs on|off`,
which rewrites those files to match; CI fails if the flag and the files disagree.

## Deploy

`.github/workflows/deploy.yml` deploys on a `vX.Y.Z` tag on `main` that matches a
`## X.Y.Z` heading in `CHANGELOG.md`, or by hand from `main`. A merge never deploys.
After the upload, a post-deploy smoke (`scripts/smoke.mjs`) fetches every page as a browser
from each custom-domain route and fails on anything the edge added or changed.
The routes are `search-mcp.dev` and `www.search-mcp.dev` (`wrangler.toml`).

The workflow needs two repo secrets:

- `SEARCH_MCP_SITE_DEPLOY_TOKEN`: a Cloudflare API token for this deploy only, passed to
  wrangler as `CLOUDFLARE_API_TOKEN`. It needs Workers Scripts edit on the account, and
  for the custom domains, edit access to Workers routes and DNS on the `search-mcp.dev`
  zone.
- `CLOUDFLARE_ACCOUNT_ID`: the account that holds the zone.

## License

[AGPL-3.0](LICENSE), like search-mcp itself.
