#!/usr/bin/env node
// Deploy gate: which refs may deploy.
//   push of tag vX.Y.Z -> allowed only if CHANGELOG.md has a "## X.Y.Z" heading
//   workflow_dispatch  -> allowed only from refs/heads/main
// Anything else is refused. The workflow separately proves the commit is on main.
// Usage: node scripts/deploy-gate.mjs <event> <ref> <changelog>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function gate(event, ref, changelogText) {
  if (event === "workflow_dispatch") {
    return ref === "refs/heads/main"
      ? { ok: true, reason: "workflow_dispatch from main" }
      : { ok: false, reason: `workflow_dispatch may deploy only from main, not ${ref}` };
  }
  if (event !== "push") return { ok: false, reason: `event ${event} never deploys` };
  const m = /^refs\/tags\/v(\d+\.\d+\.\d+)$/.exec(ref);
  if (!m) return { ok: false, reason: `ref ${ref} is not a vX.Y.Z tag` };
  const version = m[1];
  const headings = [...changelogText.matchAll(/^## \[?(\d+\.\d+\.\d+)\]?(?:\s|$)/gm)].map((h) => h[1]);
  if (!headings.includes(version)) {
    return { ok: false, reason: `tag v${version} has no "## ${version}" heading in CHANGELOG.md` };
  }
  return { ok: true, reason: `tag v${version} matches CHANGELOG.md` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [event, ref, changelog] = process.argv.slice(2);
  if (!event || !ref || !changelog) {
    console.log("::error::usage: deploy-gate.mjs <event> <ref> <changelog>");
    process.exit(2);
  }
  const r = gate(event, ref, readFileSync(changelog, "utf8"));
  console.log(r.ok ? `deploy gate: ALLOWED, ${r.reason}` : `::error::deploy gate: REFUSED, ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
}
