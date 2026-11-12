// Controls for comment handling in parseTags (CodeQL js/incomplete-multi-character-sanitization,
// alert 1). The checks must see every tag a browser would run. A browser ends a comment
// at "<!-->", "<!--->", "-->" or "--!>"; a scanner that only knows "-->" hides what
// follows those shorter forms, and the smoke reads HTML the edge served, not the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTags, stripComments } from "../scripts/site-lib.mjs";
import { expectations, checkPage } from "../scripts/smoke.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXP = expectations(REPO);
const HOME = EXP.pages.find((p) => p.path === "/");
const EVIL = '<script src="https://evil.example/x.js"></script>';
const scripts = (html) => parseTags(html).tags.filter((t) => t.name === "script").map((t) => t.attrs.src);

test("a normal comment hides its content, as in a browser", () => {
  assert.deepEqual(scripts(`a<!-- ${EVIL} -->b`), []);
  assert.equal(stripComments("a<!-- x -->b<!--y-->c"), "abc");
});
test("an abruptly closed comment <!--> or <!---> does not hide what follows", () => {
  assert.deepEqual(scripts(`<!--> ${EVIL} <!-- -->`), ["https://evil.example/x.js"]);
  assert.deepEqual(scripts(`<!---> ${EVIL} <!-- -->`), ["https://evil.example/x.js"]);
});
test("--!> ends a comment, as in a browser", () => {
  assert.deepEqual(scripts(`<!-- a --!> ${EVIL} <!-- -->`), ["https://evil.example/x.js"]);
});
test("a nested opener does not extend the comment", () => {
  assert.deepEqual(scripts(`<!-- <!-- --> ${EVIL} -->`), ["https://evil.example/x.js"]);
});
test("an unterminated comment runs to the end of the input, as in a browser", () => {
  assert.equal(stripComments("a<!-- b <script>"), "a");
});
test("smoke goes red on a foreign script behind an abruptly closed comment", () => {
  const body = readFileSync(join(REPO, "site", "index.html"), "utf8").replace("</body>", `<!--> ${EVIL} <!-- --></body>`);
  const res = { status: 200, headers: { "content-type": "text/html", "content-security-policy": EXP.csp, "x-robots-tag": "noindex" }, body };
  const problems = checkPage(res, HOME, EXP);
  assert.ok(problems.some((p) => /foreign <script src="https:\/\/evil.example/.test(p)), JSON.stringify(problems));
});
