# Changelog

All notable changes to search-mcp-site. SemVer, `0.MINOR.PATCH` before 1.0. A release is a
`## X.Y.Z` heading here plus a matching `vX.Y.Z` tag on a commit on `main`; the deploy
workflow refuses a tag without its heading. Bump-at-release: changes collect under
`## Unreleased` until a release PR names the version.

## Unreleased

## 0.1.0 (2026-11-12)

- First site, documenting search-mcp v0.7.0: home, install, configuration, MCP tool
  reference, ask widget, self-host, privacy, and 404 pages. Vanilla HTML, CSS and JS with no
  build step, served as Cloudflare Workers static assets by the Worker `search-mcp-site` on
  the custom domains `search-mcp.dev` and `www.search-mcp.dev`. Content comes from the
  search-mcp README, `docs/DEPLOY.md`, CHANGELOG and MCP tool schemas at v0.7.0.
- Scaffold copied in shape from postern-site 0.2.2: `ci` (HTML validation, links, assets,
  no third-party resources, CSP, preview flag, no dashes, the latest search-mcp release
  pin, a wrangler dry run) and `coverage` (every site map page built, reachable and
  linked), each with controls that prove it goes red.
- `scripts/check-upstream-version.mjs`: every search-mcp release reference (GitHub links at
  a tag, `git clone --branch`, the npm `@skyphusion/search-mcp@X.Y.Z` pin, and
  "search-mcp vX.Y.Z" text) must name the latest release. Runs in `ci` and daily. A release
  list it cannot read is exit 2, not a pass.
- Deploy workflow on a `vX.Y.Z` tag on main that matches this changelog, with a post-deploy
  browser smoke. It reads the per-function secret `SEARCH_MCP_SITE_DEPLOY_TOKEN`, plus
  `CLOUDFLARE_ACCOUNT_ID`.
