// Controls for the CI gates: each check must PASS a clean fixture and FAIL each real
// defect it exists to catch. A gate whose refusal has never been observed is decoration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSite, checkCoverage, checkDashes, previewEdits, checkPreview, readMode, PREVIEW_META, ROBOTS_PUBLIC, upstreamVersionRefs, latestUpstreamTag, checkUpstreamVersion } from "../scripts/site-lib.mjs";
import { spawnSync } from "node:child_process";
import { gate } from "../scripts/deploy-gate.mjs";

const REAL_SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "site");

function page({ title = "A page title", body = "", head = "", nav = true } = {}) {
  const links = nav
    ? '<nav><a href="/">Home</a> <a href="/a/">A</a> <a href="/b/">B</a></nav>'
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="A description long enough to pass the fifty character floor.">
<link rel="stylesheet" href="/assets/site.css"><script src="/assets/theme.js"></script>${head}
</head><body>${links}<main id="main"><h1 id="top">Title</h1>${body}</main></body></html>`;
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "search-mcp-site-test-"));
  const files = {
    "index.html": page(),
    "a/index.html": page(),
    "b/index.html": page(),
    "404.html": page(),
    "assets/site.css": "body { color: black; }\n",
    "assets/theme.js": "// theme\n",
    "_headers": "/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n",
    "sitemap.xml": "<urlset><url><loc>https://search-mcp.dev/</loc></url><url><loc>https://search-mcp.dev/a/</loc></url><url><loc>https://search-mcp.dev/b/</loc></url></urlset>\n",
    ...overrides,
  };
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function siteProblems(overrides) {
  const root = fixture(overrides);
  try { return checkSite(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function coverageProblems(overrides) {
  const root = fixture(overrides);
  try { return checkCoverage(root).problems; } finally { rmSync(root, { recursive: true, force: true }); }
}
function expectOne(problems, re) {
  assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}, got: ${JSON.stringify(problems)}`);
}

test("control: the clean fixture passes both checks", () => {
  assert.deepEqual(siteProblems({}), []);
  assert.deepEqual(coverageProblems({}), []);
});

test("the real site passes both checks", () => {
  assert.deepEqual(checkSite(REAL_SITE), []);
  const c = checkCoverage(REAL_SITE);
  assert.deepEqual(c.problems, []);
  assert.ok(c.stats.inSitemap >= 7, "the site map lists every page");
});

// ---- ci: third-party resources ------------------------------------------------
for (const [label, head] of [
  ["script", '<script src="https://cdn.example.net/x.js"></script>'],
  ["protocol-relative script", '<script src="//cdn.example.net/x.js"></script>'],
  ["stylesheet", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'],
  ["preconnect", '<link rel="preconnect" href="https://fonts.gstatic.com">'],
  ["icon", '<link rel="icon" href="https://example.net/favicon.ico">'],
]) {
  test(`ci goes red on a third-party ${label}`, () => {
    expectOne(siteProblems({ "index.html": page({ head }) }), /third-party/);
  });
}
test("ci goes red on a third-party image", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="https://t.example.net/p.gif" alt="" width="1" height="1">' }) }), /third-party/);
});
test("ci goes red on a data: image (an inline payload)", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="data:image/gif;base64,R0lG" alt="" width="1" height="1">' }) }), /third-party or inline|data: URL/);
});
test("ci goes red on an iframe embed", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<iframe src="/a/" title="x"></iframe>' }) }), /<iframe> is not allowed/);
});
test("ci goes red on a third-party font in CSS", () => {
  expectOne(siteProblems({ "assets/site.css": '@font-face { font-family: X; src: url("https://fonts.gstatic.com/x.woff2"); }\n' }), /third-party/);
});
test("ci goes red on a CSS @import from a CDN", () => {
  expectOne(siteProblems({ "assets/site.css": "@import url(https://cdn.example.net/x.css);\n" }), /third-party/);
});
test("ci goes red on a CSP that allows another origin", () => {
  expectOne(siteProblems({ "_headers": "/*\n  Content-Security-Policy: default-src 'none'; script-src 'self' https://cdn.example.net; style-src 'self'; img-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n" }), /CSP script-src allows https:\/\/cdn.example.net/);
});
test("ci goes red on a missing CSP", () => {
  expectOne(siteProblems({ "_headers": "/*\n  Referrer-Policy: no-referrer\n" }), /no Content-Security-Policy/);
});

// ---- ci: links and assets -------------------------------------------------------
test("ci goes red on a missing asset", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="/assets/img/nope.png" alt="x" width="1" height="1">' }) }), /missing target/);
});
test("ci goes red on a broken internal link", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<a href="/nowhere/">x</a>' }) }), /missing target/);
});
test("ci goes red on a broken #fragment", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<a href="/a/#no-such-id">x</a>' }) }), /missing id #no-such-id/);
});
test("ci goes red on a missing CSS asset", () => {
  expectOne(siteProblems({ "assets/site.css": "body { background: url(/assets/img/gone.png); }\n" }), /missing target/);
});

// ---- ci: CSP consistency and page basics ---------------------------------------
test("ci goes red on an inline script", () => {
  expectOne(siteProblems({ "index.html": page({ body: "<script>alert(1)</script>" }) }), /inline <script>/);
});
test("ci goes red on an inline style attribute", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<p style="color:red">x</p>' }) }), /inline style=/);
});
test("ci goes red on an event handler", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<p onclick="x()">x</p>' }) }), /event handler onclick/);
});
test("ci goes red on an image without alt", () => {
  expectOne(siteProblems({ "index.html": page({ body: '<img src="/favicon.svg" width="1" height="1">' }), "favicon.svg": "<svg/>" }), /has no alt/);
});
test("ci goes red on two h1 elements", () => {
  expectOne(siteProblems({ "index.html": page({ body: "<h1>Second</h1>" }) }), /exactly one <h1>/);
});
test("ci goes red on a missing lang", () => {
  expectOne(siteProblems({ "index.html": page().replace('<html lang="en">', "<html>") }), /lang attribute/);
});

// ---- ci: dashes -------------------------------------------------------------------
test("ci goes red on an em-dash or en-dash", () => {
  const texts = { "a.html": "fine\nnot \u2014 fine\n", "b.md": "range 1\u20132\n", "c.txt": "fine, really\n" };
  const problems = checkDashes(Object.keys(texts), (f) => texts[f]);
  assert.deepEqual(problems, ["a.html:2: em-dash or en-dash", "b.md:1: em-dash or en-dash"]);
});

// ---- coverage -------------------------------------------------------------------
test("coverage goes red on a site map page that is not built", () => {
  expectOne(coverageProblems({ "b/index.html": null }), /\/b\/ is not built/);
});
test("coverage goes red on a built page missing from the site map", () => {
  expectOne(coverageProblems({ "c/index.html": page() }), /c\/index.html is not in sitemap.xml/);
});
test("coverage goes red on a page no other page links to", () => {
  const unlinked = page({ nav: false });
  expectOne(
    coverageProblems({ "index.html": unlinked, "a/index.html": unlinked, "b/index.html": unlinked, "404.html": unlinked }),
    /unreachable: \/a\//,
  );
});
test("coverage goes red when one page drops a nav link", () => {
  const partial = page({ nav: false }).replace("<main", '<nav><a href="/">Home</a> <a href="/a/">A</a></nav><main');
  expectOne(coverageProblems({ "a/index.html": partial }), /not linked: \/b\/ is missing from a\/index.html/);
});
test("coverage goes red on an empty site map", () => {
  expectOne(coverageProblems({ "sitemap.xml": "<urlset></urlset>" }), /lists no pages/);
});
test("coverage goes red on a site map entry off the site origin", () => {
  expectOne(coverageProblems({ "sitemap.xml": readFileSync(join(REAL_SITE, "sitemap.xml"), "utf8").replace("https://search-mcp.dev/mcp/", "https://evil.example/mcp/") }), /not on https:\/\/search-mcp.dev/);
});

// ---- deploy gate ------------------------------------------------------------------
const CHANGELOG = "# Changelog\n\n## Unreleased\n\n## 0.1.0\n\n- first\n";
test("deploy gate allows a tag with a matching CHANGELOG heading", () => {
  assert.equal(gate("push", "refs/tags/v0.1.0", CHANGELOG).ok, true);
});
test("deploy gate refuses a tag with no CHANGELOG heading", () => {
  assert.equal(gate("push", "refs/tags/v0.2.0", CHANGELOG).ok, false);
});
test("deploy gate refuses a non-SemVer tag and a branch push", () => {
  assert.equal(gate("push", "refs/tags/v0.1", CHANGELOG).ok, false);
  assert.equal(gate("push", "refs/heads/main", CHANGELOG).ok, false);
});
test("deploy gate refuses a manual run off main", () => {
  assert.equal(gate("workflow_dispatch", "refs/heads/feature", CHANGELOG).ok, false);
  assert.equal(gate("workflow_dispatch", "refs/heads/main", CHANGELOG).ok, true);
});
test("deploy gate refuses any other event", () => {
  assert.equal(gate("pull_request", "refs/tags/v0.1.0", CHANGELOG).ok, false);
});

// Keep the real-site copy test honest: a defect injected into a COPY of the real site
// must be caught, so the real-site pass above is not a pass by blindness.
test("a defect injected into a copy of the real site goes red", () => {
  const root = mkdtempSync(join(tmpdir(), "search-mcp-site-real-"));
  try {
    cpSync(REAL_SITE, root, { recursive: true });
    const f = join(root, "mcp", "index.html");
    writeFileSync(f, readFileSync(f, "utf8").replace("</head>", '<script src="https://www.googletagmanager.com/gtag/js"></script>\n</head>'));
    expectOne(checkSite(root), /mcp\/index.html: third-party/);
    const g = join(root, "widget", "index.html");
    writeFileSync(g, readFileSync(g, "utf8").replaceAll('href="/self-host/"', 'href="/"'));
    expectOne(checkCoverage(root).problems, /not linked: \/self-host\/ is missing from widget\/index.html/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- preview mode ---------------------------------------------------------------

// A repo dir holding site-mode.json and a site/ built from the clean fixture.
function previewRepo(preview, mutate = () => {}) {
  const repo = mkdtempSync(join(tmpdir(), "search-mcp-site-mode-"));
  const site = join(repo, "site");
  const src = fixture({ "robots.txt": ROBOTS_PUBLIC });
  cpSync(src, site, { recursive: true });
  rmSync(src, { recursive: true, force: true });
  writeFileSync(join(repo, "site-mode.json"), JSON.stringify({ preview }));
  for (const [f, text] of Object.entries(previewEdits(site, preview))) writeFileSync(f, text);
  mutate(site, repo);
  return { repo, site };
}
function previewProblems(preview, mutate) {
  const { repo, site } = previewRepo(preview, mutate);
  try { return checkPreview(repo, site); } finally { rmSync(repo, { recursive: true, force: true }); }
}

test("control: a site that matches its preview flag passes, in both modes", () => {
  assert.deepEqual(previewProblems(true), []);
  assert.deepEqual(previewProblems(false), []);
});
test("preview on really writes noindex, Disallow and X-Robots-Tag", () => {
  const { repo, site } = previewRepo(true);
  try {
    assert.match(readFileSync(join(site, "a", "index.html"), "utf8"), /<meta name="robots" content="noindex, nofollow" data-preview>/);
    assert.match(readFileSync(join(site, "robots.txt"), "utf8"), /^Disallow: \/$/m);
    assert.match(readFileSync(join(site, "_headers"), "utf8"), /^ {2}X-Robots-Tag: noindex, nofollow$/m);
    assert.doesNotMatch(readFileSync(join(site, "404.html"), "utf8"), /data-preview/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
test("ci goes red when a preview page is missing its noindex", () => {
  expectOne(previewProblems(true, (site) => {
    const f = join(site, "b", "index.html");
    writeFileSync(f, readFileSync(f, "utf8").replace(PREVIEW_META + "\n", ""));
  }), /b\/index.html does not match site-mode.json preview: true/);
});
test("ci goes red when a preview robots.txt allows crawling", () => {
  expectOne(previewProblems(true, (site) => writeFileSync(join(site, "robots.txt"), ROBOTS_PUBLIC)), /robots.txt does not match/);
});
test("ci goes red when preview _headers drops X-Robots-Tag", () => {
  expectOne(previewProblems(true, (site) => {
    const f = join(site, "_headers");
    writeFileSync(f, readFileSync(f, "utf8").replace("  X-Robots-Tag: noindex, nofollow\n", ""));
  }), /_headers does not match/);
});
test("ci goes red when the public build still carries a noindex", () => {
  expectOne(previewProblems(false, (site) => {
    const f = join(site, "index.html");
    writeFileSync(f, readFileSync(f, "utf8").replace('<meta name="viewport"', PREVIEW_META + '\n<meta name="viewport"'));
  }), /index.html does not match site-mode.json preview: false/);
});
test("ci goes red on a missing or malformed site-mode.json", () => {
  expectOne(previewProblems(true, (site, repo) => rmSync(join(repo, "site-mode.json"))), /site-mode.json missing/);
  expectOne(previewProblems(true, (site, repo) => writeFileSync(join(repo, "site-mode.json"), '{"preview":"yes"}')), /needs "preview": true or false/);
});
test("the real repo matches its own preview flag", () => {
  const repo = resolve(REAL_SITE, "..");
  assert.equal(typeof readMode(repo).preview, "boolean");
  assert.deepEqual(checkPreview(repo, REAL_SITE), []);
});

// ---- search-mcp version (the site links the latest release) ------------------

function versionFixture(pages) {
  const root = mkdtempSync(join(tmpdir(), "search-mcp-site-ver-"));
  for (const [p, html] of Object.entries(pages)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), html);
  }
  return root;
}
const REL = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
const RELEASES = [REL("v0.6.0"), REL("v0.10.0"), REL("v0.7.0"), REL("widget-v9.0.0"), REL("v0.11.0", { prerelease: true }), REL("v1.0.0", { draft: true })];

test("latestUpstreamTag picks the highest vX.Y.Z by number, not by text, and skips drafts, prereleases and other tag shapes", () => {
  assert.equal(latestUpstreamTag(RELEASES), "v0.10.0");
  assert.equal(latestUpstreamTag([]), null);
});

test("upstreamVersionRefs finds links, the clone branch, the npm pin and text, and ignores the site repo and comments", () => {
  const root = versionFixture({
    "index.html": [
      '<a href="https://github.com/skyphusion-labs/search-mcp/blob/v0.6.0/docs/DEPLOY.md">a</a>',
      '<a href="https://github.com/skyphusion-labs/search-mcp/releases/tag/v0.6.0">search-mcp v0.6.0</a>',
      "<pre>git clone --branch v0.6.0 https://github.com/skyphusion-labs/search-mcp.git</pre>",
      "<pre>npm install @skyphusion/search-mcp@0.6.0</pre>",
      '<a href="https://github.com/skyphusion-labs/search-mcp-site/blob/v3.0.0/x">site</a>',
      "<pre>git clone --branch v3.0.0 https://github.com/skyphusion-labs/search-mcp-site</pre>",
      "<!-- https://github.com/skyphusion-labs/search-mcp/blob/v0.1.0/old -->",
    ].join("\n"),
  });
  try {
    const refs = upstreamVersionRefs(root);
    assert.deepEqual(refs.map((r) => [r.line, r.version]), [[1, "v0.6.0"], [2, "v0.6.0"], [2, "v0.6.0"], [3, "v0.6.0"], [4, "v0.6.0"]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ci goes red when the site links a search-mcp release that is not the latest", () => {
  const refs = [{ file: "index.html", line: 3, version: "v0.7.0" }, { file: "install/index.html", line: 9, version: "v0.6.0" }];
  assert.deepEqual(checkUpstreamVersion(refs, "v0.7.0"), ["install/index.html:9: links search-mcp v0.6.0, the latest release is v0.7.0"]);
  assert.deepEqual(checkUpstreamVersion(refs.slice(0, 1), "v0.7.0"), []);
});

test("ci goes red, not green, when there is nothing to judge", () => {
  assert.equal(checkUpstreamVersion([], "v0.7.0").length, 1);
  assert.equal(checkUpstreamVersion([{ file: "a", line: 1, version: "v0.7.0" }], null).length, 1);
});

test("the version CLI exits 1 on a stale pin, 0 on the latest, and 2 when it cannot read releases", () => {
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-upstream-version.mjs");
  const stale = versionFixture({ "index.html": "<pre>npm install @skyphusion/search-mcp@0.6.0</pre>" });
  const fresh = versionFixture({ "index.html": "<pre>npm install @skyphusion/search-mcp@0.10.0</pre>" });
  const rel = join(stale, "releases.json");
  writeFileSync(rel, JSON.stringify(RELEASES));
  const run = (site, file) => spawnSync(process.execPath, [cli, site, "--releases-json", file], { encoding: "utf8" });
  try {
    assert.equal(run(stale, rel).status, 1);
    assert.equal(run(fresh, rel).status, 0);
    const missing = run(fresh, join(stale, "no-such.json"));
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /UNMEASURED/);
  } finally {
    rmSync(stale, { recursive: true, force: true });
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("the real site names one search-mcp release everywhere", () => {
  const refs = upstreamVersionRefs(REAL_SITE);
  const versions = new Set(refs.map((r) => r.version));
  assert.ok(refs.length >= 5, `the site should pin search-mcp in several places, found ${refs.length}`);
  assert.equal(versions.size, 1, `the site links several search-mcp releases: ${[...versions].join(", ")}`);
});
