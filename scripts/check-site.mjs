#!/usr/bin/env node
// CI `ci` job: the site's own rules. Exit 1 on any problem.
//   - no third-party URL in any script, stylesheet, image, font or icon, and no frames,
//     embeds or forms (privacy: nothing loads from anyone else);
//   - every internal link, asset and #fragment resolves;
//   - no inline script, inline style or event handler (the CSP would block them);
//   - the CSP in site/_headers names only 'self' and 'none';
//   - page basics: lang, title, description, viewport, one h1, img alt and size;
//   - no em-dash or en-dash in any tracked text file;
//   - the served files match the preview flag in site-mode.json (noindex while preview).
// Usage: node scripts/check-site.mjs [siteDir] [-- file ...]
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { checkSite, checkDashes, checkPreview } from "./site-lib.mjs";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
const root = resolve(args[0] && args[0] !== "--" ? args[0] : "site");
const files = sep >= 0
  ? args.slice(sep + 1)
  : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

const problems = [...checkSite(root), ...checkPreview(dirname(root), root), ...checkDashes(files)];
for (const p of problems) console.log(`::error::${p}`);
console.log(`check-site: ${problems.length} problem(s) in ${root} and ${files.length} tracked file(s)`);
process.exit(problems.length ? 1 : 0);
