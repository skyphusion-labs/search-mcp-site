# search-mcp-site

This file is the guide for any coding agent and any contributor. Follow it.

## What this project is

This site is the landing page and the docs for search-mcp. It is served at https://search-mcp.dev. The files in `site/` are the product. Read [README.md](README.md).

The version is in `package.json`. See the latest `v*` tag.

## Rules

Use vanilla HTML, CSS, and JS. Edit `site/` directly. Do not add a framework. Do not add a bundler. Do not add a preprocessor. Do not add a generator this repo must run.

Do not add a third-party script, stylesheet, font, image, frame, embed, or CDN. Do not add cookies. Do not add analytics. `site/_headers` is the content security policy. It names `'self'` and `'none'` only. An outbound link is allowed.

This site is documentation only. Do not embed the ask widget. Do not point a page at a search Worker. Do not use `search.vivijure.com` on this site.

Source each claim from search-mcp at the pinned tag. Use its README, its docs, its changelog, or a tool schema. Do not add a claim you cannot point at. Do not add announcement copy.

When search-mcp releases, update this site in one pull request. Re-read its changelog. Move every version pin in that same request. That includes tag links, `--branch`, the npm pin, and the version text. `scripts/check-upstream-version.mjs` enforces the pins.

Every page is in the nav or the footer of every page. Every page is in `site/sitemap.xml`. The `coverage` job enforces both.

## Gates

Run this before every push:

```bash
npm test && npm run validate && npm run check && npm run coverage \
  && node scripts/check-upstream-version.mjs site
```

Each check has a control under `test/`. The control must fail on the broken input. Add that control when you add a check. `npm run check` reads `git ls-files`. Stage new files before you trust the dash scan.

## Release and deploy

The changelog heading `## Unreleased` collects changes. A release pull request renames it to `## X.Y.Z (date)`. The same request sets `package.json` and `package-lock.json` to that version.

A `vX.Y.Z` tag on the merge commit deploys. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). A merge to `main` leaves the live site unchanged. Secret names for that workflow stay in the workflow file. Do not commit those values.

Pin GitHub Actions by full commit SHA. Keep the version tag in a trailing comment. `main` takes changes through a pull request. The required check names are `ci` and `coverage`. Do not rename those jobs.

## Docs

Write Simplified Technical English. Use short sentences. Use one idea per sentence. Use the active present tense. Use plain words. Use the same word every time.

Do not use an em dash (U+2014). Do not use an en dash (U+2013). CI fails on those characters. Use a comma, a semicolon, parentheses, or two hyphens (`--`).

State the limit next to the capability. Do not turn a measured result into a promise.

## Safety

Do not put a secret in a tracked file, a log, or an issue.
