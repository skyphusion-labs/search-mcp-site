// Controls for the post-deploy smoke (postern-site#3). The smoke must pass a clean
// deployment and FAIL each edge rewrite it exists to catch, above all the 2026-11-10
// shape: a foreign analytics script injected only for browser user agents.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { expectations, checkPage, checkAsset, checkRobots, smoke, fetchAs, customDomains } from "../scripts/smoke.mjs";
import { ROBOTS_PREVIEW } from "../scripts/site-lib.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(REPO, "site");
const EXP = expectations(REPO);
const BEACON = '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v123" integrity="sha512-x" data-cf-beacon=\'{"token":"t"}\' crossorigin="anonymous"></script>';
const HOME = EXP.pages.find((p) => p.path === "/");
const BEACON_FINDING = /: served a foreign <script src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\//;

function served(page, { body, headers = {}, status } = {}) {
  const file = page.status === 404 ? join(SITE, "404.html") : join(SITE, page.path, "index.html");
  return {
    status: status ?? page.status,
    headers: { "content-type": "text/html", "content-security-policy": EXP.csp, "x-robots-tag": "noindex, nofollow", ...headers },
    body: body ?? readFileSync(file, "utf8"),
  };
}
const has = (problems, re) => assert.ok(problems.some((p) => re.test(p)), `expected ${re}, got ${JSON.stringify(problems)}`);

test("expectations come from the repo: every site map page, the 404, assets, the CSP", () => {
  assert.ok(EXP.pages.length >= 8);
  assert.ok(EXP.pages.every((p) => p.title));
  assert.ok(EXP.assets.includes("/assets/site.css"));
  assert.match(EXP.csp, /^default-src 'none';/);
});
test("wrangler.toml custom domains are the default targets", () => {
  assert.deepEqual(customDomains(readFileSync(join(REPO, "wrangler.toml"), "utf8")), ["https://search-mcp.dev", "https://www.search-mcp.dev"]);
});

test("control: every real page, served cleanly, passes", () => {
  for (const page of EXP.pages) assert.deepEqual(checkPage(served(page), page, EXP), [], page.path);
});
test("smoke goes red on an injected foreign script (the 2026-11-10 beacon)", () => {
  const body = readFileSync(join(SITE, "index.html"), "utf8").replace("</body>", BEACON + "</body>");
  has(checkPage(served(HOME, { body }), HOME, EXP), BEACON_FINDING);
});
test("smoke goes red on an injected inline script, stylesheet or iframe", () => {
  const base = readFileSync(join(SITE, "index.html"), "utf8");
  has(checkPage(served(HOME, { body: base.replace("</body>", "<script>window.x=1</script></body>") }), HOME, EXP), /inline <script>/);
  has(checkPage(served(HOME, { body: base.replace("</head>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2">\n</head>') }), HOME, EXP), /foreign <link href/);
  has(checkPage(served(HOME, { body: base.replace("</body>", '<iframe src="https://x.example/"></iframe></body>') }), HOME, EXP), /<iframe>/);
});
test("smoke goes red on a missing or altered CSP", () => {
  has(checkPage(served(HOME, { headers: { "content-security-policy": undefined } }), HOME, EXP), /no Content-Security-Policy/);
  has(checkPage(served(HOME, { headers: { "content-security-policy": EXP.csp.replace("script-src 'self'", "script-src 'self' https://static.cloudflareinsights.com") } }), HOME, EXP), /CSP differs/);
});
test("smoke goes red on a missing X-Robots-Tag in preview mode, on a page and on an asset", () => {
  const PREVIEW = { ...EXP, preview: true };
  has(checkPage(served(HOME, { headers: { "x-robots-tag": undefined } }), HOME, PREVIEW), /no X-Robots-Tag/);
  has(checkAsset({ status: 200, headers: {} }, "/favicon.svg", PREVIEW), /no X-Robots-Tag/);
  assert.deepEqual(checkAsset({ status: 200, headers: {} }, "/x.png", { ...EXP, preview: false }), []);
});
test("smoke goes red on a cookie", () => {
  has(checkPage(served(HOME, { headers: { "set-cookie": "__cf_bm=abc; Path=/" } }), HOME, EXP), /sets a cookie: __cf_bm=/);
  has(checkAsset({ status: 200, headers: { "x-robots-tag": "noindex", "set-cookie": "a=b" } }, "/favicon.svg", EXP), /sets a cookie/);
});
test("smoke goes red on a stale version, a redirect, or a wrong status", () => {
  const body = readFileSync(join(SITE, "index.html"), "utf8").replace(/<title>[^<]*<\/title>/, "<title>Old title</title>");
  has(checkPage(served(HOME, { body }), HOME, EXP), /stale or wrong version/);
  has(checkPage({ status: 301, headers: { location: "https://example.net/" }, body: "" }, HOME, EXP), /status 301, expected 200 \(redirect to https:\/\/example.net\/\)/);
  const nf = EXP.pages.find((p) => p.status === 404);
  has(checkPage(served(nf, { status: 200 }), nf, EXP), /status 200, expected 404/);
});

const CF_MANAGED = "# BEGIN Cloudflare Managed content\n\nUser-agent: *\nContent-Signal: search=yes,ai-train=no\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\n# END Cloudflare Managed Content\n\n";
test("robots: our Disallow group passes alone and behind Cloudflare Managed robots.txt", () => {
  const PREVIEW = { ...EXP, preview: true };
  assert.deepEqual(checkRobots({ status: 200, body: ROBOTS_PREVIEW }, PREVIEW), []);
  assert.deepEqual(checkRobots({ status: 200, body: CF_MANAGED + ROBOTS_PREVIEW }, PREVIEW), []);
});
test("robots goes red when our own Disallow group is missing in preview mode", () => {
  const PREVIEW = { ...EXP, preview: true };
  has(checkRobots({ status: 200, body: CF_MANAGED }, PREVIEW), /group is missing/);
  has(checkRobots({ status: 200, body: "User-agent: *\nAllow: /\n" }, PREVIEW), /group is missing/);
  assert.deepEqual(checkRobots({ status: 200, body: "User-agent: *\nAllow: /\n" }, { ...EXP, preview: false }), []);
});

// ---- end to end over HTTP: a stand-in edge that rewrites only browser requests -------
const HEADERS = { "content-security-policy": EXP.csp, "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml" };
function edge({ injectForBrowsers }) {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = join(SITE, url.pathname);
    let status = 200;
    if (url.pathname.endsWith("/")) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile() || url.pathname === "/_headers") { file = join(SITE, "404.html"); status = 404; }
    let body = readFileSync(file);
    const isBrowser = /Chrome\//.test(req.headers["user-agent"] || "") && /text\/html/.test(req.headers.accept || "");
    if (injectForBrowsers && isBrowser && extname(file) === ".html") body = Buffer.from(body.toString("utf8").replace("</body>", BEACON + "</body>"));
    res.writeHead(status, { "content-type": TYPES[extname(file)] || "application/octet-stream", ...HEADERS });
    res.end(body);
  });
}
async function listen(server) {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}
const quiet = { tries: 1, waitMs: 0, log: () => {} };

test("end to end: a clean edge passes the smoke", async () => {
  const base = await listen(edge({ injectForBrowsers: false }));
  assert.deepEqual(await smoke(base, EXP, quiet), []);
});
test("end to end: an edge that injects a beacon for browsers only FAILS the smoke", async () => {
  const base = await listen(edge({ injectForBrowsers: true }));
  // The shape that hid the real defect: a non-browser fetch sees the clean file...
  const plain = await (await fetch(base + "/")).text();
  assert.doesNotMatch(plain, /cloudflareinsights/);
  // ...and the smoke, which fetches as a browser, does not.
  const problems = await smoke(base, EXP, quiet);
  assert.equal(problems.filter((p) => BEACON_FINDING.test(p)).length, EXP.pages.length, JSON.stringify(problems));
  assert.match((await fetchAs(base + "/")).body, /cloudflareinsights/);
});
