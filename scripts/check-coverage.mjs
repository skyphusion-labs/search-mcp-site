#!/usr/bin/env node
// CI `coverage` job: every page in site/sitemap.xml is built, every built page is in
// the site map, every page is reachable from /, and every page is linked from every
// other page. Prints the counts; exit 1 unless all of them are 100 percent.
// Usage: node scripts/check-coverage.mjs [siteDir]
import { resolve } from "node:path";
import { checkCoverage } from "./site-lib.mjs";

const root = resolve(process.argv[2] || "site");
const { problems, stats } = checkCoverage(root);
for (const p of problems) console.log(`::error::${p}`);
if (stats) {
  const n = stats.inSitemap;
  console.log(`coverage: built ${stats.built}/${n}, reachable from / ${stats.reachable}/${n}, linked from every page ${stats.linkedEverywhere}/${n}`);
}
console.log(`check-coverage: ${problems.length} problem(s)`);
process.exit(problems.length || !stats || stats.inSitemap === 0 ? 1 : 0);
