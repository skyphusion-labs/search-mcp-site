#!/usr/bin/env node
// CI `ci` job, and a daily schedule: the site links the latest search-mcp release.
//
// Exit 0: every search-mcp version reference in the site names the latest release.
// Exit 1: a reference names any other version (each is listed, with file and line), or the
//         site names no release at all.
// Exit 2: the release list could not be read. That is could-not-measure, not a pass.
//
// The release list is read from the GitHub API, every page, and the latest is chosen by
// scripts/site-lib.mjs latestUpstreamTag (vX.Y.Z only: no drafts or prereleases), not by
// GitHub's "latest" flag, which a maintainer can set by hand on any release.
// Usage: node scripts/check-upstream-version.mjs [siteDir] [--releases-json FILE]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { upstreamVersionRefs, latestUpstreamTag, checkUpstreamVersion, UPSTREAM_REPO } from "./site-lib.mjs";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--releases-json");
const releasesFile = fileIdx >= 0 ? args[fileIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith("--") && !(fileIdx >= 0 && i === fileIdx + 1));
const root = resolve(positional[0] ?? "site");

async function readReleases() {
  if (releasesFile) return JSON.parse(readFileSync(releasesFile, "utf8"));
  const headers = { accept: "application/vnd.github+json", "user-agent": "search-mcp-site-ci" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  let url = `https://api.github.com/repos/${UPSTREAM_REPO}/releases?per_page=100`;
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`GET ${url} did not return a list`);
    all.push(...batch);
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "");
    url = next ? next[1] : null;
  }
  if (url) throw new Error("more than 20 pages of releases; refusing to judge a partial list");
  return all;
}

let releases;
try {
  releases = await readReleases();
} catch (e) {
  console.log(`::error::UNMEASURED: the search-mcp release list could not be read (${e.message}). This is not a pass.`);
  process.exit(2);
}
const latest = latestUpstreamTag(releases);
const refs = upstreamVersionRefs(root);
const problems = checkUpstreamVersion(refs, latest);
for (const p of problems) console.log(`::error::${p}`);
const pinned = [...new Set(refs.map((r) => r.version))].join(", ") || "none";
console.log(`check-upstream-version: releases_read=${releases.length} latest=${latest ?? "none"} references=${refs.length} pinned=${pinned} problems=${problems.length}`);
process.exit(problems.length ? 1 : 0);
