export type GameMode = "truth" | "dare";

export type QuestionPlayer = {
  id: number;
  name: string;
  gender: "男" | "女";
};

export type PlayerGenderMap = Record<number, QuestionPlayer["gender"]>;

export function createPlayerGenderMap(players: QuestionPlayer[]): PlayerGenderMap {
  return Object.fromEntries(players.map((player) => [player.id, player.gender]));
}

export type GameQuestion = {
  id: string;
  mode: GameMode;
  actorPlayerId: number;
  targetPlayerIds: number[];
  text: string;
};

export function questionFingerprint(text: string) {
  return text
    .replace(/[\s，。！？、,.!?：:；;“”"']/g, "")
    .toLowerCase();
}

export function questionSemanticCore(text: string) {
  return text
    .replace(/\{\{player:\d+\}\}/g, "人")
    .replace(/^(人[，,]?)+/, "")
    .replace(/(请|你|你的|一下|一次|一个|并且|然后|接着)/g, "")
    .replace(/[\s，。！？、,.!?：:；;“”"'（）()]/g, "")
    .toLowerCase();
}

export function areQuestionsSemanticallySimilar(left: string, right: string) {
  const a = questionSemanticCore(left);
  const b = questionSemanticCore(right);
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 9 && (a.includes(b) || b.includes(a))) return true;
  const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const aGrams = grams(a), bGrams = grams(b);
  if (!aGrams.size || !bGrams.size) return false;
  let overlap = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) overlap += 1;
  return overlap / Math.min(aGrams.size, bGrams.size) >= 0.6;
}

export function renderQuestionText(text: string, players: QuestionPlayer[]) {
  const names = new Map(players.map((player) => [player.id, player.name]));
  return text.replace(/\{\{player:(\d+)\}\}/g, (_, rawId: string) => {
    return names.get(Number(rawId)) ?? `玩家${rawId}`;
  });
}

export function validateQuestion(
  question: GameQuestion,
  players: QuestionPlayer[],
): boolean {
  // “你/你的”在题面中专指开头点名的 actor，既保留 ID 绑定，
  // 也避免把同一个名字机械地重复三四遍。
  const forbiddenPronounPattern = /(?:我|(?<!其)他|她|它)(?:们)?|对方|某人|在场的人/;
  if (forbiddenPronounPattern.test(question.text)) return false;
  const readableText = question.text.replace(/\{\{player:\d+\}\}/g, "人");
  const maximumLength = question.mode === "truth" ? 64 : 80;
  if (readableText.length < 6 || readableText.length > maximumLength) return false;
  if (question.mode === "dare" && /(并|再)(告诉|说明|解释).*(为什么|为何|原因)|以及.*希望.*(理解|明白)|为什么(选择|选)/.test(readableText)) return false;
  const playerIds = new Set(players.map((player) => player.id));
  if (!playerIds.has(question.actorPlayerId)) return false;
  if (!question.targetPlayerIds.every((id) => playerIds.has(id))) return false;
  if (!question.targetPlayerIds.length) return false;
  if (new Set(question.targetPlayerIds).size !== question.targetPlayerIds.length) return false;
  if (question.targetPlayerIds.includes(question.actorPlayerId)) return false;

  const referencedIds = Array.from(
    question.text.matchAll(/\{\{player:(\d+)\}\}/g),
    (match) => Number(match[1]),
  );
  if (!referencedIds.every((id) => playerIds.has(id))) return false;
  if (referencedIds.filter((id) => id === question.actorPlayerId).length !== 1) return false;
  return question.targetPlayerIds.every((id) => referencedIds.includes(id));
}

const truthTemplates = [
  "{{actor}}，第一次真正注意到 {{target}} 是在什么瞬间？",
  "{{actor}}，说一个 {{target}} 自己可能还没发现的优点。",
  "{{actor}}，你对 {{target}} 的第一印象和现在相比，最大变化是什么？",
  "{{actor}}，如果能重新认识一次，你最想从 {{target}} 的哪一面开始了解？",
  "{{actor}}，你觉得自己最容易被 {{target}} 误解的地方是什么？",
  "{{actor}}，最近一次因为 {{target}} 感到开心是什么时候？",
  "{{actor}}，你最想认真问 {{target}}、但一直没找到机会的问题是什么？",
  "{{actor}}，你和 {{target}} 最默契的一件事是什么？",
];

const dareTemplates = [
  "{{actor}}，和 {{target}} 对视十秒，谁先笑谁就分享一件最近的小秘密。",
  "{{actor}}，用三个具体的词形容 {{target}}，其中一个必须让大家意外。",
  "{{actor}}，模仿 {{target}} 最有辨识度的一个小动作，让大家猜。",
  "{{actor}}，和 {{target}} 设计一个只属于你们的秘密手势。",
  "{{actor}}，真诚地夸 {{target}} 十五秒，中间不能重复形容词。",
  "{{actor}}，为 {{target}} 即兴取一个贴合今晚气氛的新昵称，让大家猜灵感来源。",
  "{{actor}}，和 {{target}} 同时摆出最像对方的招牌姿势，让大家投票谁更像。",
  "{{actor}}，用一句电影台词般的话邀请 {{target}} 完成下一轮游戏。",
];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createFallbackQuestions(
  players: QuestionPlayer[],
  warmth: number,
  excludedFingerprints = new Set<string>(),
  questionsPerMode = 4,
): GameQuestion[] {
  const questions: GameQuestion[] = [];
  const shift = warmth <= 24 ? 0 : warmth <= 49 ? 2 : warmth <= 74 ? 4 : 6;

  for (const actor of players) {
    const targets = players.filter((player) => player.id !== actor.id);
    for (const mode of ["truth", "dare"] as const) {
      const templates = mode === "truth" ? truthTemplates : dareTemplates;
      for (let offset = 0; offset < Math.min(questionsPerMode, templates.length); offset += 1) {
        const target = targets[(actor.id + offset) % targets.length];
        const genderOffset = actor.gender === target.gender ? 0 : 1;
        const template = templates[(shift + genderOffset + offset) % templates.length];
        const text = template
          .replaceAll("{{actor}}", `{{player:${actor.id}}}`)
          .replaceAll("{{target}}", `{{player:${target.id}}}`);
        const fingerprint = questionFingerprint(text);
        if (excludedFingerprints.has(fingerprint)) continue;
        questions.push({
          id: `local_${hash(`${mode}:${actor.id}:${target.id}:${text}`)}`,
          mode,
          actorPlayerId: actor.id,
          targetPlayerIds: [target.id],
          text,
        });
      }
    }
  }

  // A fallback is not AI-generated, but it should still avoid serving the
  // exact same sequence whenever a new local game starts.
  for (let index = questions.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [questions[index], questions[swapIndex]] = [questions[swapIndex], questions[index]];
  }
  return questions;
}
