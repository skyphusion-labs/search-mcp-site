#!/usr/bin/env node
// Flip the preview flag and apply it to the served files in one step.
//   node scripts/set-preview.mjs on    # preview build: noindex everywhere (today)
//   node scripts/set-preview.mjs off   # public build: indexable (at the apex cutover)
// CI (check-site) fails whenever site-mode.json and the files disagree.
import { writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { previewEdits } from "./site-lib.mjs";

const arg = process.argv[2];
if (arg !== "on" && arg !== "off") {
  console.log("usage: node scripts/set-preview.mjs on|off");
  process.exit(2);
}
const on = arg === "on";
const repo = resolve(".");
const root = resolve("site");
const edits = previewEdits(root, on);
for (const [f, text] of Object.entries(edits)) {
  writeFileSync(f, text);
  console.log(`updated ${relative(repo, f)}`);
}
writeFileSync(resolve("site-mode.json"), JSON.stringify({ preview: on }, null, 2) + "\n");
console.log(`site-mode.json preview: ${on} (${Object.keys(edits).length} served file(s) changed)`);
