import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("does not ship a fixed first question or static fallback array", async () => {
  const html = await readFile(new URL("../public/who-most-likely.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /说走就走，临时买票去旅行/);
  assert.match(html, /let questions=\[\]/);
  assert.match(html, /shuffleQuestions/);
  assert.match(html, /if\(!activeQuestion\)/);
});
