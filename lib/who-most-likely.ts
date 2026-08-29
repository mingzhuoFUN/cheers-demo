import { questionFingerprint, type QuestionPlayer } from "./questions";

export type MostLikelyQuestion = {
  id: string;
  text: string;
  tag: string;
};

export function mostLikelyQuestionCore(text: string) {
  return text
    .replace(/^谁最[有不]可能/, "")
    .replace(/(请说说|为什么|大家觉得|哪个细节|会是|可能会)/g, "")
    .replace(/[\s，。！？、,.!?：:；;“”"']/g, "")
    .toLowerCase();
}

export function areMostLikelyQuestionsSimilar(left: string, right: string) {
  const a = mostLikelyQuestionCore(left);
  const b = mostLikelyQuestionCore(right);
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 8 && (a.includes(b) || b.includes(a))) return true;
  const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const aGrams = grams(a), bGrams = grams(b);
  if (!aGrams.size || !bGrams.size) return false;
  let overlap = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) overlap += 1;
  return overlap / Math.min(aGrams.size, bGrams.size) >= 0.56;
}

const templateBanks = [
  [["谁最可能喝两口就抢着当气氛组？","气氛组"],["谁最可能把骰子摇到桌子底下？","骰子逃兵"],["谁最可能唱歌跑调却最爱抢麦？","抢麦王"],["谁最可能聚餐结束才发现手机没带？","忘带手机"],["谁最可能靠猜拳赢到最后？","猜拳之王"],["谁最可能把宵夜点成满汉全席？","宵夜大户"],["谁最可能玩游戏时偷偷研究规则漏洞？","规则猎人"],["谁最可能清醒着却比喝多了还疯？","人间清醒疯"],],
  [["谁最可能喝上头后主动爆自己的糗事？","自爆选手"],["谁最可能群里潜水，现场却最能聊？","反差话痨"],["谁最可能嘴上说不喝，最后一个离场？","最后离场"],["谁最可能喝多后开始给所有人取外号？","外号大师"],["谁最可能把朋友的黑历史记得最清楚？","黑历史库"],["谁最可能输了游戏还要嘴硬？","嘴硬王"],["谁最可能临时放鸽子又靠撒娇过关？","撒娇过关"],["谁最可能酒醒后假装昨晚什么都没发生？","选择性失忆"],],
  [["谁最可能借着酒劲说出藏了很久的话？","酒后真话"],["谁最可能嘴上嫌弃，实际最容易心动？","嘴硬心动"],["谁最可能偷偷关注喜欢的人每条动态？","动态巡逻员"],["谁最可能吃醋了还坚持说没事？","醋坛嘴硬"],["谁最可能今晚突然对某个人改观？","瞬间改观"],["谁最可能收到消息后故意等几分钟再回？","回消息军师"],["谁最可能先动心却最后才承认？","后知后认"],["谁最可能把暧昧聊天截图给朋友分析？","暧昧分析师"],],
  [["谁最可能喝多后给不该联系的人发消息？","深夜冲动"],["谁最可能今晚把暗恋直接说漏嘴？","暗恋暴露"],["谁最可能和前任复合后又嘴硬不承认？","复合嘴硬"],["谁最可能表面洒脱，其实最放不下？","假装洒脱"],["谁最可能因为吃醋做出幼稚举动？","幼稚醋王"],["谁最可能今晚最想带一个人单独续摊？","单独续摊"],["谁最可能删了对话框里的真心话？","撤回真心"],["谁最可能明知道没结果还会心动？","清醒心动"],],
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function validateMostLikelyQuestion(question: MostLikelyQuestion) {
  if (!question || typeof question.id !== "string" || typeof question.text !== "string" || typeof question.tag !== "string") return false;
  const text = question.text.trim();
  const tag = question.tag.trim();
  if (text.length < 8 || text.length > 52 || tag.length < 2 || tag.length > 16) return false;
  if (/(最靠谱|最会照顾|最有仪式感|最容易交朋友|最会做攻略|最值得信赖)/.test(text)) return false;
  if (!/^谁最[有不]可能/.test(text)) return false;
  if (mostLikelyQuestionCore(text).length < 6) return false;
  return !/(色情|裸|强吻|灌酒|霸凌|羞辱|违法|自残|疾病|收入|身材|最丑|最穷)/.test(text + tag);
}

export function createMostLikelyFallback(
  players: QuestionPlayer[],
  warmth: number,
  excluded = new Set<string>(),
) {
  const templates = templateBanks[warmth <= 24 ? 0 : warmth <= 49 ? 1 : warmth <= 74 ? 2 : 3];
  const shift = players.length % templates.length;
  const questions: MostLikelyQuestion[] = [];
  for (let index = 0; index < templates.length; index += 1) {
    const [text, tag] = templates[(index + shift) % templates.length];
    if (excluded.has(questionFingerprint(text))) continue;
    questions.push({ id: `local_ml_${hash(`${players.length}:${warmth}:${text}`)}`, text, tag });
  }
  return questions;
}
