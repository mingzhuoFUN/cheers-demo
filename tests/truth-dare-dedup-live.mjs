import assert from "node:assert/strict";

const baseUrl = process.env.CHEERS_TEST_URL ?? "http://localhost:3000";
const batches = Number(process.env.CHEERS_TEST_BATCHES ?? 2);
const players = [
  { id: 1, name: "阿青", gender: "男" },
  { id: 2, name: "小禾", gender: "女" },
  { id: 3, name: "可乐", gender: "男" },
  { id: 4, name: "团子", gender: "女" },
];

const core = (text) => text
  .replace(/\{\{player:\d+\}\}/g, "人")
  .replace(/^(人[，,]?)+/, "")
  .replace(/(请|你|你的|一下|一次|一个|并且|然后|接着)/g, "")
  .replace(/[\s，。！？、,.!?：:；;“”"'（）()]/g, "")
  .toLowerCase();

function similar(left, right) {
  const a = core(left), b = core(right);
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 9 && (a.includes(b) || b.includes(a))) return true;
  const grams = (value) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const ag = grams(a), bg = grams(b);
  if (!ag.size || !bg.size) return false;
  let overlap = 0;
  for (const gram of ag) if (bg.has(gram)) overlap += 1;
  return overlap / Math.min(ag.size, bg.size) >= 0.6;
}

const history = [];
for (let batch = 1; batch <= batches; batch += 1) {
  const response = await fetch(`${baseUrl}/api/questions/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players, warmth: 82, excludeTexts: history }),
  });
  assert.equal(response.status, 200, `batch ${batch} HTTP ${response.status}`);
  const data = await response.json();
  const incoming = data.questions.map((question) => question.text);
  const collisions = incoming.flatMap((text) => history.filter((old) => similar(old, text)).map((old) => ({ old, text })));
  assert.deepEqual(collisions, [], `batch ${batch} contained semantic repeats`);
  for (let left = 0; left < incoming.length; left += 1) {
    for (let right = left + 1; right < incoming.length; right += 1) assert.equal(similar(incoming[left], incoming[right]), false, `batch ${batch} repeated internally`);
  }
  history.push(...incoming);
  console.log(`batch=${batch} source=${data.source} accepted=${incoming.length} total=${history.length}`);
}
console.log(`PASS: ${history.length} truth/dare questions across ${batches} batches, no player-swapped or similarity-threshold repeats.`);
