import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("truth-dare keeps used questions across game re-entry", async () => {
  const source = await readFile(new URL("../ui/CheersUI.tsx", import.meta.url), "utf8");
  assert.match(source, /cheers-truth-dare-question-history-v1/);
  assert.match(source, /usedQuestionTexts\.current=restoredHistory/);
  assert.match(source, /saveQuestionHistory\(usedQuestionTexts\.current\)/);
  assert.doesNotMatch(source, /usedQuestionTexts\.current=\[\]/);
});

test("most-likely restores history before its first API request", async () => {
  const source = await readFile(new URL("../public/who-most-likely.html", import.meta.url), "utf8");
  assert.match(source, /cheers-most-likely-question-history-v1/);
  assert.match(source, /usedQuestionTexts=readQuestionHistory\(\)/);
  assert.match(source, /loadQuestions\(usedQuestionTexts\)/);
  assert.match(source, /saveQuestionHistory\(usedQuestionTexts\)/);
  assert.doesNotMatch(source, /usedQuestionTexts=\[\]/);
});

test("hub prefetch sends stored history to both question APIs", async () => {
  const source = await readFile(new URL("../ui/GameHub.tsx", import.meta.url), "utf8");
  assert.match(source, /readStoredHistory\(historyKey\)/);
  assert.match(source, /excludeTexts: readStoredHistory\(historyKey\)/);
  assert.match(source, /setPrefetchedTruth\(null\)/);
  assert.match(source, /removeItem\("cheers-prefetched-most-likely"\)/);
});

test("truth-dare mode selection has a non-blocking exhaustion fallback", async () => {
  const source = await readFile(new URL("../ui/CheersUI.tsx", import.meta.url), "utf8");
  assert.match(source, /leastRecentlyUsedFallback/);
  assert.match(source, /timeoutMs:12000,inventoryNeeds:\[\{actorPlayerId:actorId,mode:next,count:4\}\]/);
  assert.match(source, /if\(!chosen\)\{chosen=leastRecentlyUsedFallback/);
  assert.match(source, /if\(chosen\)\{setPhase\("question"\)/);
});

test("both games replenish before their banks are exhausted", async () => {
  const truthDare = await readFile(new URL("../ui/CheersUI.tsx", import.meta.url), "utf8");
  const mostLikely = await readFile(new URL("../public/who-most-likely.html", import.meta.url), "utf8");
  assert.match(truthDare, /proactiveTopUps\.current=1/);
  assert.match(truthDare, /questionBankRef\.current\.map/);
  assert.match(mostLikely, /questions\.length<10/);
  assert.match(mostLikely, /\.length<=6\)replenishQuestions/);
});

test("replenishment requests only the missing inventory", async () => {
  const client = await readFile(new URL("../ui/CheersUI.tsx", import.meta.url), "utf8");
  const truthApi = await readFile(new URL("../app/api/questions/generate/route.ts", import.meta.url), "utf8");
  const mostLikely = await readFile(new URL("../public/who-most-likely.html", import.meta.url), "utf8");
  assert.match(client, /inventoryNeeds\(questionBankRef\.current\)/);
  assert.match(client, /inventoryNeeds:\[\{actorPlayerId:actorId,mode:next,count:4\}\]/);
  assert.match(truthApi, /inventoryNeeds\?: InventoryNeed\[\]/);
  assert.match(truthApi, /targeted: Boolean\(payload\.inventoryNeeds\?\.length\)/);
  assert.match(mostLikely, /activeDirection,8\)/);
});
