#!/usr/bin/env node
// Post-deploy smoke (postern-site#3). The `ci` checks read the repo's files; this reads
// what the deployed host actually SERVES, after the Cloudflare edge has had its turn.
// It fetches as a browser (a browser User-Agent and Accept: text/html), because the
// edge can rewrite only browser-shaped requests: on 2026-11-10 Web Analytics
// auto-install injected a static.cloudflareinsights.com beacon for browser UAs only,
// and a plain curl got the clean file.
//
// Fails on: a foreign or inline script, a foreign link or frame (the check-site rules);
// a CSP that is missing or differs from site/_headers; a missing X-Robots-Tag noindex in
// preview mode (pages AND assets); any Set-Cookie; an unexpected status or redirect; a
// page <title> that differs from the repo (a stale or wrong version); and, in preview
// mode, a robots.txt without our own Disallow group. Cloudflare Managed robots.txt
// prepends its own block, so ours need not be the only group.
//
// Usage: node scripts/smoke.mjs [baseUrl ...]   (default: every custom-domain route in
// wrangler.toml). Retries only transport errors, 5xx and a stale title, never a
// content finding.
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTags, isOffsite, listFiles, readMode, sitemapPaths, SITE_ORIGIN } from "./site-lib.mjs";

export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const FOREIGN_ELEMENTS = new Set(["iframe", "frame", "frameset", "embed", "object", "portal", "applet"]);
const FETCH_ATTRS = { script: ["src"], link: ["href"], img: ["src", "srcset"], source: ["src", "srcset"], video: ["src", "poster"], audio: ["src"], iframe: ["src"], frame: ["src"], embed: ["src"], object: ["data"] };

// What the repo says each URL must serve.
export function expectations(repoRoot) {
  const site = join(repoRoot, "site");
  const mode = readMode(repoRoot);
  if (mode.error) throw new Error(mode.error);
  const headers = readFileSync(join(site, "_headers"), "utf8");
  const csp = (headers.split("\n").find((l) => /^\s*Content-Security-Policy:/i.test(l)) || "").replace(/^\s*Content-Security-Policy:\s*/i, "").trim();
  if (!csp) throw new Error("site/_headers has no Content-Security-Policy");
  const titleOf = (f) => (readFileSync(f, "utf8").match(/<title>([^<]*)<\/title>/) || [])[1];
  const sm = sitemapPaths(site);
  if (sm.error) throw new Error(sm.error);
  const pages = sm.locs.map((loc) => {
    const path = loc.slice(SITE_ORIGIN.length);
    const file = path.endsWith("/") ? join(site, path, "index.html") : join(site, path);
    return { path, status: 200, title: titleOf(file) };
  });
  pages.push({ path: "/__smoke-no-such-page__/", status: 404, title: titleOf(join(site, "404.html")) });
  const assets = listFiles(site)
    .map((f) => "/" + relative(site, f).split(sep).join("/"))
    .filter((p) => p.startsWith("/assets/") || p === "/favicon.svg");
  return { preview: mode.preview, csp, pages, assets };
}

function header(res, name) {
  return res.headers[name.toLowerCase()];
}

// Pure check of one served page. `res` is { status, headers: {lowercased: value}, body, location }.
export function checkPage(res, page, exp) {
  const problems = [];
  const p = (m) => problems.push(`${page.path}: ${m}`);
  if (res.status !== page.status) p(`status ${res.status}, expected ${page.status}${(res.location ?? header(res, "location")) ? ` (redirect to ${res.location ?? header(res, "location")})` : ""}`);
  const csp = header(res, "content-security-policy");
  if (!csp) p("no Content-Security-Policy header");
  else if (csp.trim() !== exp.csp) p(`CSP differs from site/_headers: ${csp}`);
  if (header(res, "set-cookie")) p(`sets a cookie: ${String(header(res, "set-cookie")).split(";")[0].split("=")[0]}=...`);
  const xrt = header(res, "x-robots-tag") || "";
  if (exp.preview && !/\bnoindex\b/i.test(xrt)) p("preview mode, but no X-Robots-Tag: noindex");
  const { src, tags } = parseTags(res.body || "");
  const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (title !== page.title) p(`<title> is "${title}", the repo has "${page.title}" (stale or wrong version)`);
  if (exp.preview && !tags.some((t) => t.name === "meta" && t.attrs.name === "robots" && /noindex/.test(t.attrs.content || ""))) p("preview mode, but no robots noindex meta");
  for (const t of tags) {
    if (FOREIGN_ELEMENTS.has(t.name)) p(`served an <${t.name}> (frames and embeds are not allowed)`);
    if (t.name === "script" && !t.attrs.src) p("served an inline <script> (not in the repo; the edge added it?)");
    for (const attr of FETCH_ATTRS[t.name] || []) {
      const v = t.attrs[attr];
      if (v === undefined) continue;
      if (t.name === "link" && /\bcanonical\b/i.test(t.attrs.rel || "")) continue;
      const urls = attr === "srcset" ? v.split(",").map((s) => s.trim().split(/\s+/)[0]) : [v];
      for (const u of urls) if (u && isOffsite(u)) p(`served a foreign <${t.name} ${attr}="${u}">`);
    }
  }
  return problems;
}

export function checkAsset(res, path, exp) {
  const problems = [];
  if (res.status !== 200) problems.push(`${path}: status ${res.status}, expected 200`);
  if (header(res, "set-cookie")) problems.push(`${path}: sets a cookie`);
  if (exp.preview && !/\bnoindex\b/i.test(header(res, "x-robots-tag") || "")) problems.push(`${path}: preview mode, but no X-Robots-Tag: noindex`);
  return problems;
}

// Preview mode: our own "User-agent: *" group with "Disallow: /" must be present.
// Cloudflare Managed robots.txt may put other groups before it; that is allowed.
export function checkRobots(res, exp) {
  if (res.status !== 200) return [`/robots.txt: status ${res.status}`];
  if (!exp.preview) return [];
  const groups = (res.body || "").split(/\n\s*\n/);
  const ours = groups.some((g) => {
    const lines = g.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    return lines.includes("User-agent: *") && lines.includes("Disallow: /") && !lines.some((l) => /^Allow:/i.test(l));
  });
  return ours ? [] : ["/robots.txt: preview mode, but our own \"User-agent: * / Disallow: /\" group is missing"];
}

export async function fetchAs(url, { timeoutMs = 15000 } = {}) {
  const r = await fetch(url, { headers: BROWSER_HEADERS, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  const headers = {};
  r.headers.forEach((v, k) => { headers[k] = k in headers ? `${headers[k]}, ${v}` : v; });
  if (typeof r.headers.getSetCookie === "function" && r.headers.getSetCookie().length) headers["set-cookie"] = r.headers.getSetCookie().join("\n");
  const type = headers["content-type"] || "";
  const body = /text|xml|javascript|json/.test(type) ? await r.text() : (await r.arrayBuffer(), "");
  return { status: r.status, headers, body, location: headers.location };
}

const RETRYABLE = /status 5\d\d|stale or wrong version|transport error/;

export async function smoke(base, exp, { fetcher = fetchAs, tries = 5, waitMs = 10000, log = console.log } = {}) {
  base = base.replace(/\/$/, "");
  const one = async (label, fn) => {
    let last = [];
    for (let i = 1; i <= tries; i++) {
      try { last = await fn(); } catch (e) { last = [`${label}: transport error: ${e.message}`]; }
      if (!last.length || !last.every((m) => RETRYABLE.test(m)) || i === tries) return last;
      log(`retry ${i}/${tries - 1} for ${label}: ${last.join("; ")}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    return last;
  };
  const problems = [];
  for (const page of exp.pages) problems.push(...await one(page.path, async () => checkPage(await fetcher(base + page.path), page, exp)));
  for (const path of exp.assets) problems.push(...await one(path, async () => checkAsset(await fetcher(base + path), path, exp)));
  problems.push(...await one("/robots.txt", async () => checkRobots(await fetcher(base + "/robots.txt"), exp)));
  return problems;
}

export function customDomains(wranglerToml) {
  return [...wranglerToml.matchAll(/\{\s*pattern\s*=\s*"([^"]+)"\s*,\s*custom_domain\s*=\s*true\s*\}/g)].map((m) => `https://${m[1]}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = resolve(".");
  const bases = process.argv.slice(2).length ? process.argv.slice(2) : customDomains(readFileSync(join(repo, "wrangler.toml"), "utf8"));
  if (!bases.length) { console.log("::error::smoke: no base URL given and no custom-domain route in wrangler.toml"); process.exit(1); }
  const exp = expectations(repo);
  let total = 0;
  for (const base of bases) {
    const problems = await smoke(base, exp);
    for (const p of problems) console.log(`::error::${base}${p}`);
    console.log(`smoke ${base}: ${exp.pages.length} page(s), ${exp.assets.length} asset(s), robots.txt; preview=${exp.preview}; ${problems.length} problem(s)`);
    total += problems.length;
  }
  process.exit(total ? 1 : 0);
}
