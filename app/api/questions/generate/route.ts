import {
  createPlayerGenderMap,
  areQuestionsSemanticallySimilar,
  createFallbackQuestions,
  questionFingerprint,
  type GameQuestion,
  type QuestionPlayer,
  validateQuestion,
} from "../../../../lib/questions";

type GeneratePayload = {
  players?: QuestionPlayer[];
  warmth?: number;
  excludeTexts?: string[];
  questionDirection?: string | null;
  inventoryNeeds?: InventoryNeed[];
};

type InventoryNeed = { actorPlayerId: number; mode: "truth" | "dare"; count: number };

const questionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 16,
      maxItems: 48,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          mode: { type: "string", enum: ["truth", "dare"] },
          actorPlayerId: { type: "integer" },
          targetPlayerIds: { type: "array", items: { type: "integer" }, minItems: 1 },
          text: { type: "string" },
        },
        required: ["id", "mode", "actorPlayerId", "targetPlayerIds", "text"],
      },
    },
  },
  required: ["questions"],
};

function questionSchemaFor(expectedItems: number) {
  return {
    ...questionSchema,
    properties: {
      ...questionSchema.properties,
      questions: { ...questionSchema.properties.questions, minItems: expectedItems, maxItems: expectedItems },
    },
  };
}

function warmthGuidance(warmth: number) {
  if (warmth <= 24) return "破冰（0-24）：大胆度2/10、暧昧度1/10、隐私度1/10、搞笑度8/10；轻松习惯、无厘头选择和低压力小动作，禁止感情与秘密";
  if (warmth <= 49) return "熟悉（25-49）：大胆度5/10、暧昧度3/10、隐私度3/10、搞笑度8/10；熟人反差、共同经历、善意互损和轻微社死";
  if (warmth <= 74) return "深入（50-74）：大胆度7/10、暧昧度7/10、隐私度6/10、搞笑度6/10；心动、吃醋、关系变化、没说出口的欣赏和有张力的互动";
  return "成人夜场（75-100）：大胆度10/10、暧昧度10/10、隐私度9/10、搞笑度6/10；允许直接谈身体吸引力、接吻意愿、约会选择、暗恋、前任、欲望、酒后冲动和关系试探。真心话可以让人脸红，大冒险可以有挑逗性表达、近距离互动和暧昧表演；任何真实身体接触必须明确可拒绝，并提供不接触的替代动作";
}

const directionGuidance: Record<string, string> = {
  flirty: "暧昧升温：围绕欣赏、心动、在意和轻微关系试探",
  heartfelt: "更加走心：围绕真实感受、理解、支持和未表达的话",
  exciting: "刺激一点：题目更直接、更有张力，但不得危险、强迫或越界",
  funny: "轻松搞笑：围绕反差、趣事、尴尬瞬间和善意玩笑",
  past: "聊聊过去：围绕第一印象、成长经历和共同回忆",
  future: "聊聊未来：围绕期待、理想生活和想共同完成的事情",
  unspoken: "没说出口：围绕一直想问或想表达但尚未说出口的内容",
  appreciation: "彼此欣赏：围绕具体优点、被打动的细节和感谢",
  values: "价值观：围绕选择、原则、生活态度和关系观念",
  imagination: "脑洞假设：使用有趣的假设情境了解彼此",
  chemistry: "默契挑战：通过同步选择、猜测、接话和彼此预判测试默契，结果应能当场揭晓",
  improv: "即兴演技：增加模仿、配音、角色扮演、临场台词和可观看的表演",
  secretMission: "秘密任务：围绕隐藏意图、不能提前解释的小任务和让其他玩家猜目的的互动",
};

function isValidPayload(payload: GeneratePayload) {
  if (!Array.isArray(payload.players) || payload.players.length < 2 || payload.players.length > 6) return false;
  if (!Number.isInteger(payload.warmth) || payload.warmth! < 0 || payload.warmth! > 100) return false;
  if (payload.excludeTexts !== undefined && (!Array.isArray(payload.excludeTexts) || payload.excludeTexts.length > 100 || !payload.excludeTexts.every(text => typeof text === "string" && text.length <= 300))) return false;
  if (payload.questionDirection !== undefined && payload.questionDirection !== null && !directionGuidance[payload.questionDirection]) return false;
  const ids = new Set<number>();
  const validPlayers = payload.players.every((player) => {
    if (!Number.isInteger(player.id) || ids.has(player.id)) return false;
    ids.add(player.id);
    return typeof player.name === "string" && player.name.trim().length > 0 && player.name.length <= 12 && ["男", "女"].includes(player.gender);
  });
  if (!validPlayers) return false;
  if (payload.inventoryNeeds !== undefined) {
    if (!Array.isArray(payload.inventoryNeeds) || !payload.inventoryNeeds.length || payload.inventoryNeeds.length > payload.players.length * 2) return false;
    const needKeys = new Set<string>();
    if (!payload.inventoryNeeds.every((need) => {
      const key = `${need.actorPlayerId}:${need.mode}`;
      if (!ids.has(need.actorPlayerId) || !["truth", "dare"].includes(need.mode) || !Number.isInteger(need.count) || need.count < 1 || need.count > 4 || needKeys.has(key)) return false;
      needKeys.add(key);
      return true;
    })) return false;
  }
  return true;
}

function extractOutputText(response: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
}

async function generateWithOpenAI(
  players: QuestionPlayer[],
  warmth: number,
  excludedTexts: string[],
  questionDirection?: string | null,
  inventoryNeeds?: InventoryNeed[],
): Promise<GameQuestion[]> {
  const requestedItems = inventoryNeeds?.reduce((total, need) => total + need.count, 0) ?? players.length * 8;
  const outputSchema = questionSchemaFor(requestedItems);
  const generationPlan = inventoryNeeds?.length
    ? `本次只补充以下库存缺口，共 ${requestedItems} 道：${JSON.stringify(inventoryNeeds)}。严格按每项 actorPlayerId、mode 和 count 生成，不为未列出的玩家或模式生成题目。`
    : "首批为每位 actor 生成 4 道 truth 和 4 道 dare：其中 1 道正常展示、2 道供用户连续换题、1 道作为校验与去重损耗冗余。目标玩家和互动机制分布均衡。";
  const submissionChecklist = inventoryNeeds?.length
    ? "提交前逐项核对 inventoryNeeds：每项数量必须准确；同一 actor、同一模式的补充题不得共享核心问题或互动机制；不合格候选先替换再输出。"
    : "提交前按 actor 逐一核对：每位 actor 恰好 4 道 truth 和 4 道 dare；每题开头只出现一次 actor 占位符；被指定互动的目标玩家使用占位符且出现在 targetPlayerIds；同一 actor、同一模式的 4 道题不得共享核心问题或互动机制；不合格候选先替换再输出。";
  const excluded = new Set(excludedTexts.map(questionFingerprint));
  const playerGenderMap = createPlayerGenderMap(players);
  const genderCounts = players.reduce(
    (counts, player) => ({ ...counts, [player.gender]: counts[player.gender] + 1 }),
    { 男: 0, 女: 0 },
  );
  const identityRules = [
    `玩家ID与性别映射（唯一可信来源）：${JSON.stringify(playerGenderMap)}。性别人数：${JSON.stringify(genderCounts)}。`,
    "必须先根据 actorPlayerId 和 targetPlayerIds 查询上述映射，再设计题目；禁止根据昵称猜测性别。",
    "尤其是大冒险，要结合实际人数及参与者的性别组合调整表达和动作设计，同性与异性组合都要自然且分布均衡。",
    "当本桌同时存在同性和异性组合时，每位 actor 的题目尽量覆盖两类目标组合；性别只影响情境适配，不得默认异性恋或套用性别刻板印象。",
    "性别映射用于题目语境和参与者组合设计；不得根据昵称推断或改写任何玩家 ID。",
  ].join("\n");
  const dashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  if (dashscopeApiKey) {
    const prompt = [
      "生成中文酒桌版真心话大冒险题库，只输出 JSON。题目要清楚、有画面、现场可执行，不写成生硬问卷。",
      "遵守‘一题一体验’：每题只有一个核心秘密、选择或挑战；允许添加一个真正改变回答或玩法的戏剧条件，不拼接两个独立任务。",
      "长度由体验决定，不为凑字数添加解释。真心话多数 16–38 字、最多 64 字；大冒险多数 18–48 字、最多 80 字。推荐区间用于保持节奏，不要求机械凑字数。",
      "真心话采用‘一问一钩子’：只问一个核心信息，可以用一个具体情境或二选一制造张力；不要连续换一种说法追问。理由本身是答案核心时可以询问理由。",
      "大冒险采用‘核心任务+可选戏剧条件’：明确做什么、对谁、怎样算完成；戏剧条件应制造表演、选择、误会或悬念。不要在完成动作后追加感受、原因或希望别人如何理解等复盘。",
      "输出前做删减测试：删除某个分句后，如果玩家接下来要回答或完成的内容没有变化，就删除该分句。压缩不能牺牲画面感、表演性和完成条件。",
      "输出前在内部比较候选并淘汰平庸题：真心话应有值得回答的具体钩子，大冒险应有可观看的过程或明确悬念；删除泛泛夸奖、普通问卷、机械口令、答案显而易见和同批机制重复的题。不要输出筛选过程。",
      `本局已出现原题：${JSON.stringify(excludedTexts)}。不得生成相同动作、相同问题、相同互动机制或同义改写；仅更换玩家ID也算重复。`,
      "开头用 {{player:actorPlayerId}} 点名一次，之后可用“你”；目标玩家必须写 {{player:数字ID}}。禁止含糊的人物代词。",
      "自由选择题材，风格坐标只控制尺度，不限制主题；同批题目必须使用不同场景、冲突和笑点机制，避免同义改写。",
      identityRules,
      generationPlan,
      `本局关系尺度：${warmthGuidance(warmth)}。每一道题都必须明显符合这一档，而不是生成通用题。关系温度不表示身体接触许可。`,
      questionDirection ? `本批主方向：${directionGuidance[questionDirection] ?? questionDirection}。它覆盖此前走向，但只是表达重心，不是封闭题材：约一半题目明显体现，一部分轻微体现，并保留少量其他相容机制。不要把方向名称复述进题面，不要让整批重复同一种场景、关系问题或动作。方向不得突破当前关系尺度。` : "当前没有额外题目走向，保持场景、冲突和互动机制的多样变化。",
      submissionChecklist,
      `输出 JSON 结构：${JSON.stringify(outputSchema)}`,
      `游戏参数：${JSON.stringify({ players, playerGenderMap, genderCounts, warmth, questionDirection, inventoryNeeds })}`,
    ].join("\n");
    const baseUrl = (process.env.DASHSCOPE_BASE_URL ?? "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dashscopeApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_MODEL ?? "qwen3.7-plus",
        messages: [
          { role: "system", content: "你是中文派对游戏题库设计师。必须只输出合法 JSON。" },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DashScope request failed: ${response.status} ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const outputText = data.choices?.[0]?.message?.content;
    if (!outputText) return [];
    const parsed = JSON.parse(outputText) as { questions?: GameQuestion[] };
    return (parsed.questions ?? []).filter(
      (question) => validateQuestion(question, players) && !excluded.has(questionFingerprint(question.text)),
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_QUESTION_MODEL ?? "gpt-4.1-mini",
      store: false,
      instructions: [
        "你是中文酒桌版真心话大冒险题库设计师。题目要清楚、有画面、现场可执行，不写成生硬问卷。",
        "遵守‘一题一体验’：每题只有一个核心秘密、选择或挑战；允许添加一个真正改变回答或玩法的戏剧条件，不拼接两个独立任务。",
        "长度由体验决定，不为凑字数添加解释。真心话多数 16–38 字、最多 64 字；大冒险多数 18–48 字、最多 80 字。推荐区间用于保持节奏，不要求机械凑字数。",
        "真心话采用‘一问一钩子’：只问一个核心信息，可以用一个具体情境或二选一制造张力；不要连续换一种说法追问。理由本身是答案核心时可以询问理由。",
        "大冒险采用‘核心任务+可选戏剧条件’：明确做什么、对谁、怎样算完成；戏剧条件应制造表演、选择、误会或悬念。不要在完成动作后追加感受、原因或希望别人如何理解等复盘。",
        "输出前做删减测试：删除某个分句后，如果玩家接下来要回答或完成的内容没有变化，就删除该分句。压缩不能牺牲画面感、表演性和完成条件。",
        "输出前在内部比较候选并淘汰平庸题：真心话应有值得回答的具体钩子，大冒险应有可观看的过程或明确悬念；删除泛泛夸奖、普通问卷、机械口令、答案显而易见和同批机制重复的题。不要输出筛选过程。",
        `本局已出现原题：${JSON.stringify(excludedTexts)}。不得生成相同动作、相同问题、相同互动机制或同义改写；仅更换玩家ID也算重复。`,
        "开头用 {{player:actorPlayerId}} 点名一次，之后可用“你”；目标玩家必须写 {{player:数字ID}}。禁止含糊的人物代词。",
        "自由选择题材，风格坐标只控制尺度，不限制主题；同批题目必须使用不同场景、冲突和笑点机制，避免同义改写。",
        identityRules,
        generationPlan,
        `本局关系尺度：${warmthGuidance(warmth)}。每一道题都必须明显符合这一档，而不是生成通用题。关系温度不表示身体接触许可。`,
        questionDirection ? `本批主方向：${directionGuidance[questionDirection] ?? questionDirection}。它覆盖此前走向，但只是表达重心，不是封闭题材：约一半题目明显体现，一部分轻微体现，并保留少量其他相容机制。不要把方向名称复述进题面，不要让整批重复同一种场景、关系问题或动作。方向不得突破当前关系尺度。` : "当前没有额外题目走向，保持场景、冲突和互动机制的多样变化。",
        submissionChecklist,
        "双人题必须明确绑定两人的 ID；多人题也必须明确列出参与者 ID。",
      ].join("\n"),
      input: JSON.stringify({ players, playerGenderMap, genderCounts, warmth, questionDirection, inventoryNeeds }),
      text: {
        format: {
          type: "json_schema",
          name: "cheers_question_bank",
          strict: true,
          schema: outputSchema,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const data = (await response.json()) as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = extractOutputText(data);
  if (!outputText) return [];
  const parsed = JSON.parse(outputText) as { questions?: GameQuestion[] };
  return (parsed.questions ?? []).filter(
    (question) => validateQuestion(question, players) && !excluded.has(questionFingerprint(question.text)),
  );
}

export async function POST(request: Request) {
  let payload: GeneratePayload;
  try {
    payload = (await request.json()) as GeneratePayload;
  } catch {
    return Response.json({ error: "请求内容必须是 JSON" }, { status: 400 });
  }
  if (!isValidPayload(payload)) {
    return Response.json({ error: "玩家或关系温度参数无效" }, { status: 400 });
  }

  const players = payload.players!;
  const warmth = payload.warmth!;
  const excludedTexts = payload.excludeTexts ?? [];
  const playerGenderMap = createPlayerGenderMap(players);
  const genderCounts = players.reduce(
    (counts, player) => ({ ...counts, [player.gender]: counts[player.gender] + 1 }),
    { 男: 0, 女: 0 },
  );
  const excluded = new Set(excludedTexts.map(questionFingerprint));
  let questions: GameQuestion[] = [];
  let source: "ai" | "fallback" = "fallback";
  try {
    questions = await generateWithOpenAI(players, warmth, excludedTexts, payload.questionDirection, payload.inventoryNeeds);
    if (questions.length) source = "ai";
  } catch (error) {
    console.error("Question generation failed; using fallback bank", error);
  }

  const seen = new Set(excluded);
  const semanticHistory = [...excludedTexts];
  const uniqueQuestions = questions.filter((question) => {
    const fingerprint = questionFingerprint(question.text);
    if (seen.has(fingerprint) || semanticHistory.some(text => areQuestionsSemanticallySimilar(text, question.text))) return false;
    seen.add(fingerprint);
    semanticHistory.push(question.text);
    return true;
  });
  if (!uniqueQuestions.length) {
    const fallback = createFallbackQuestions(players, warmth, excluded, 8).filter(question => !semanticHistory.some(text => areQuestionsSemanticallySimilar(text, question.text)));
    if (payload.inventoryNeeds?.length) {
      for (const need of payload.inventoryNeeds) uniqueQuestions.push(...fallback.filter(question => question.actorPlayerId === need.actorPlayerId && question.mode === need.mode).slice(0, need.count));
    } else uniqueQuestions.push(...fallback.slice(0, players.length * 8));
    source = "fallback";
  }

  return Response.json({ questions: uniqueQuestions, source, playerGenderMap, genderCounts, generationStats: { requested: payload.inventoryNeeds?.reduce((total, need) => total + need.count, 0) ?? players.length * 8, accepted: uniqueQuestions.length, targeted: Boolean(payload.inventoryNeeds?.length) } });
}
