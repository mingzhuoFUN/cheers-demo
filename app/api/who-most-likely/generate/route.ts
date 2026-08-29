import { questionFingerprint, type QuestionPlayer } from "../../../../lib/questions";
import {
  createMostLikelyFallback,
  areMostLikelyQuestionsSimilar,
  validateMostLikelyQuestion,
  type MostLikelyQuestion,
} from "../../../../lib/who-most-likely";

type Payload = { players?: QuestionPlayer[]; warmth?: number; excludeTexts?: string[]; questionDirection?: string | null; requestedCount?: number };

const directionGuidance: Record<string, string> = {
  funny: "爆笑离谱：增加反差、社死、误会和现场起哄感",
  flirty: "暧昧升温：增加心动、吃醋、吸引力和关系试探",
  bold: "大胆坦白：更直接、更尖锐、更容易让人脸红，但仍尊重边界",
  roast: "互损揭短：增加熟人黑历史、嘴硬和可辩解的小缺点，不做人身攻击",
  absurd: "脑洞失控：增加荒诞假设、意外后果和不按常理的选择",
  confessions: "酒后真话：增加没说出口的话、冲动决定和隐藏想法",
  details: "细节侦探：聚焦熟人才能发现的小动作、口头习惯、微表情和藏不住的反应",
  friendship: "损友默契：增加朋友间的接梗、包庇、拆台、救场和心照不宣",
  crisis: "阵营危机：把玩家放进共同困境，判断谁会带队、叛变、误判、拖后腿或意外救场",
};

const baseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 16,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          tag: { type: "string" },
        },
        required: ["id", "text", "tag"],
      },
    },
  },
  required: ["questions"],
};

function schemaFor(requestedCount: number) {
  return { ...baseSchema, properties: { ...baseSchema.properties, questions: { ...baseSchema.properties.questions, minItems: requestedCount, maxItems: requestedCount } } };
}

function validPayload(payload: Payload) {
  if (!Array.isArray(payload.players) || payload.players.length < 2 || payload.players.length > 6) return false;
  if (!Number.isInteger(payload.warmth) || payload.warmth! < 0 || payload.warmth! > 100) return false;
  if (payload.excludeTexts !== undefined && (!Array.isArray(payload.excludeTexts) || payload.excludeTexts.length > 100 || !payload.excludeTexts.every(text => typeof text === "string" && text.length <= 200))) return false;
  if (payload.questionDirection !== undefined && payload.questionDirection !== null && !directionGuidance[payload.questionDirection]) return false;
  if (payload.requestedCount !== undefined && (!Number.isInteger(payload.requestedCount) || payload.requestedCount < 4 || payload.requestedCount > 16)) return false;
  const ids = new Set<number>();
  return payload.players.every((player) => {
    if (!Number.isInteger(player.id) || ids.has(player.id)) return false;
    ids.add(player.id);
    return typeof player.name === "string" && player.name.trim().length > 0 && player.name.length <= 12 && ["男", "女"].includes(player.gender);
  });
}

function warmthProfile(warmth: number) {
  if (warmth <= 24) return { stage: "破冰热场", boldness: 3, flirt: 1, exposure: 2, privacy: 1, humor: 8 };
  if (warmth <= 49) return { stage: "熟人互损", boldness: 5, flirt: 3, exposure: 5, privacy: 3, humor: 9 };
  if (warmth <= 74) return { stage: "暧昧升温", boldness: 7, flirt: 7, exposure: 6, privacy: 6, humor: 8 };
  return { stage: "成人夜场", boldness: 10, flirt: 10, exposure: 9, privacy: 9, humor: 7 };
}

function prompt(players: QuestionPlayer[], warmth: number, excludedTexts: string[], requestedCount: number, questionDirection?: string | null) {
  const profile = warmthProfile(warmth);
  const genderCounts = players.reduce((v, p) => ({ ...v, [p.gender]: v[p.gender] + 1 }), { 男: 0, 女: 0 });
  const composition = genderCounts.男 > 0 && genderCounts.女 > 0 ? "混合性别局" : "单一性别局";
  const intensityDirective = warmth >= 75
    ? "当前是最高尺度的成年人酒局。可以直接涉及身体吸引力、想和谁约会或接吻、暗恋暴露、前任、欲望、暧昧对象、酒后冲动和关系选择；不要用含蓄的正向夸奖替代这些张力。允许尖锐和让人脸红，但不羞辱、不曝光创伤、不鼓励危险或非自愿行为。"
    : "按风格坐标控制尺度，不要擅自升级到更高隐私级别。";
  return [
    `生成 ${requestedCount} 道中文聚会游戏《谁最可能》题目，严格只输出 JSON；${requestedCount >= 16 ? "这是首批题库，要有足够冗余供连续游玩和去重筛选" : "这是后台补充批次，要全部使用新的情境和笑点"}。`,
    "这是酒桌热场游戏，不是访谈或心理测评。每题必须一眼看懂投票点，读完两秒内能开始投票。",
    "可自然使用‘谁最有可能’或‘谁最不可能’，根据题意选择，不规定比例；但同一批不要全部使用同一种句式。",
    "遵守‘一题一梗、一眼一票’：每题只保留一个核心行为、冲突或反差，不把两个独立情境拼在一起。",
    "长度由梗决定，不为凑字数添加解释。多数题目写成 14–34 字；允许少量 8–18 字的短促题和少量 35–52 字的情境题，不要求精确比例。固定开头后的核心内容至少 6 字。",
    "只有场景条件会改变玩家的投票判断时才允许写长；删除某个条件后若投票对象基本不会改变，就删除该条件。短题也必须包含具体行为或明确反差，不能只剩抽象性格词。tag 保持简短。",
    "每题必须做到投票点清晰，并在以下四项中至少做到两项：能想象具体现场；存在意外或反差；至少两位玩家都有合理中票可能；投票后容易引发起哄、辩解或爆料。不要为了同时满足全部项目而堆叠分句。",
    "自由选择题材，不使用封闭主题清单。同批题目应采用彼此不同的喜剧或关系机制；冲动后果、嘴硬反差、秘密行为、错误预判、社交翻车、暧昧暴露、荒诞选择只是启发，不是必须逐项覆盖的清单。",
    "拒绝正确但无聊的正向判断，例如‘最靠谱、最会照顾人、最有仪式感、最容易交朋友、最会做攻略’；不要像人格测试，也不要把普通优点包装成问题。",
    "允许不完美、轻微冒犯感、善意互损、暧昧试探和可辩解的社死；避免答案过于明显或只有一个玩家符合。",
    "题目由全员同时投票，不要指定某位玩家，不要在题目中出现玩家姓名、ID或性别。",
    "允许善意互损、暧昧试探、酒后反差和轻微社死；不得羞辱、歧视、鼓励危险行为、强迫饮酒或身体接触。",
    "输出前在内部淘汰平庸候选：优先保留听起来像真实朋友会争论的题；删除答案显而易见、只能投一个人、只有抽象优点、依赖网络陈词滥调或与同批共享同一笑点的题。不要输出筛选过程。",
    `关系温度：${warmth}/100；风格坐标：${JSON.stringify(profile)}。坐标只控制尺度和语气，不限制题材。`,
    intensityDirective,
    questionDirection ? `本批主方向：${directionGuidance[questionDirection]}。它是表达重心，不是封闭题材：约一半题目明显体现该方向，一部分只轻微体现，仍保留少量其他相容机制，避免整批使用同一场景和问法。不要把方向名称直接复述进题面。方向不得突破当前关系温度的尺度。` : "本批没有额外风格方向，保持题材、场景和喜剧机制的多样变化。",
    `玩家构成：${JSON.stringify({ count: players.length, genderCounts, composition })}。性别只用于判断话题适配和关系张力；混合局也不得默认异性恋，单一性别局也不要自动回避暧昧题；禁止性别刻板印象。`,
    `以下是本局已经出现的原题。禁止生成同义改写、相同情境或相同笑点，只换主语和措辞也算重复：${JSON.stringify(excludedTexts)}。`,
    `提交前逐题核对：恰好 ${requestedCount} 道；每题以‘谁最有可能’或‘谁最不可能’开头；投票点清晰且同批笑点不重复；不合格候选先替换再输出。`,
  ].join("\n");
}

async function generate(players: QuestionPlayer[], warmth: number, excludedTexts: string[], requestedCount: number, questionDirection?: string | null) {
  const excluded = new Set(excludedTexts.map(questionFingerprint));
  const userPrompt = prompt(players, warmth, excludedTexts, requestedCount, questionDirection);
  const schema = schemaFor(requestedCount);
  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  let outputText: string | undefined;
  if (dashscopeKey) {
    const baseUrl = (process.env.DASHSCOPE_BASE_URL ?? "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dashscopeKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_MODEL ?? "qwen3.7-plus",
        messages: [{ role: "system", content: "你是安全、有趣的中文聚会游戏题库设计师。" }, { role: "user", content: `${userPrompt}\nJSON Schema：${JSON.stringify(schema)}` }],
        response_format: { type: "json_object" },
        enable_thinking: false,
      }),
    });
    if (!response.ok) throw new Error(`DashScope request failed: ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    outputText = data.choices?.[0]?.message?.content;
  } else if (process.env.OPENAI_API_KEY) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_QUESTION_MODEL ?? "gpt-4.1-mini",
        store: false,
        instructions: "你是安全、有趣的中文聚会游戏题库设计师。",
        input: userPrompt,
        text: { format: { type: "json_schema", name: "most_likely_bank", strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const data = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    outputText = data.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
  }
  if (!outputText) return [];
  const parsed = JSON.parse(outputText) as { questions?: MostLikelyQuestion[] };
  return (parsed.questions ?? []).map(question => ({
    ...question,
    text: typeof question.text === "string" ? question.text.trim().replace(/^谁最可能/, "谁最有可能") : question.text,
  })).filter(question => validateMostLikelyQuestion(question) && !excluded.has(questionFingerprint(question.text)));
}

export async function POST(request: Request) {
  let payload: Payload;
  try { payload = await request.json() as Payload; }
  catch { return Response.json({ error: "请求内容必须是 JSON" }, { status: 400 }); }
  if (!validPayload(payload)) return Response.json({ error: "玩家或关系温度参数无效" }, { status: 400 });

  const players = payload.players!;
  const warmth = payload.warmth!;
  const excludedTexts = payload.excludeTexts ?? [];
  const requestedCount = payload.requestedCount ?? 16;
  const excluded = new Set(excludedTexts.map(questionFingerprint));
  let questions: MostLikelyQuestion[] = [];
  let source: "ai" | "fallback" = "fallback";
  try {
    questions = await generate(players, warmth, excludedTexts, requestedCount, payload.questionDirection);
    if (questions.length) source = "ai";
  } catch (error) {
    console.error("Most-likely generation failed; using fallback bank", error);
  }
  const seen = new Set(excluded);
  const semanticHistory = [...excludedTexts];
  questions = questions.filter(question => {
    const fingerprint = questionFingerprint(question.text);
    if (seen.has(fingerprint) || semanticHistory.some(text => areMostLikelyQuestionsSimilar(text, question.text))) return false;
    seen.add(fingerprint);
    semanticHistory.push(question.text);
    return true;
  });
  if (!questions.length) {
    const fallback = createMostLikelyFallback(players, warmth, seen).filter(question => !semanticHistory.some(text => areMostLikelyQuestionsSimilar(text, question.text)));
    questions.push(...fallback.slice(0, requestedCount));
    source = "fallback";
  }
  questions = questions.slice(0, requestedCount);
  return Response.json({ questions, source, generationProfile: warmthProfile(warmth), questionDirection: payload.questionDirection ?? null, generationStats: { requested: requestedCount, accepted: questions.length, targeted: requestedCount < 16 } });
}
