"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import CheersUI from "./CheersUI";
import SharedGameSetup, { type SharedGameConfig } from "./SharedGameSetup";
import type { GameQuestion } from "../lib/questions";

type GameId = "truth-dare" | "most-likely";
type HubPhase = "splash" | "select" | "setup" | "playing";

const BackIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>;
const EnterIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>;

const games = {
  "truth-dare": { title: "真心话大冒险", tone: "blue", icon: "/game-assets/game-icons/truth-dare-v1.png" },
  "most-likely": { title: "谁最可能", tone: "orange", icon: "/game-assets/game-icons/most-likely-v1.png" },
} as const;
const QUESTION_PROMPT_VERSION = "party-fun-v18";
const TRUTH_DARE_HISTORY_KEY = "cheers-truth-dare-question-history-v1";
const MOST_LIKELY_HISTORY_KEY = "cheers-most-likely-question-history-v1";

function readStoredHistory(key: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((text): text is string => typeof text === "string").slice(-100) : [];
  } catch { return []; }
}

export default function GameHub() {
  const [phase, setPhase] = useState<HubPhase>("splash");
  const [selectedGame, setSelectedGame] = useState<GameId>("truth-dare");
  const [gameConfig, setGameConfig] = useState<SharedGameConfig>({ players: [
    { id: 1, name: "", gender: "男", avatar: 0 }, { id: 2, name: "", gender: "女", avatar: 1 },
  ], warmth: 58 });
  const [prefetchedTruth, setPrefetchedTruth] = useState<{ key: string; questions: GameQuestion[]; source: "ai" | "fallback" } | null>(null);
  const configKey = JSON.stringify({ promptVersion: QUESTION_PROMPT_VERSION, players: gameConfig.players.map(({ id, name, gender }) => ({ id, name: name.trim(), gender })), warmth: gameConfig.warmth });

  useEffect(() => {
    sessionStorage.removeItem("cheers-prefetched-most-likely");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase("select"), reduced ? 120 : 1650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "setup" || gameConfig.players.some(player => !player.name.trim())) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const endpoint = selectedGame === "truth-dare" ? "/api/questions/generate" : "/api/who-most-likely/generate";
      try {
        const historyKey = selectedGame === "truth-dare" ? TRUTH_DARE_HISTORY_KEY : MOST_LIKELY_HISTORY_KEY;
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ players: gameConfig.players.map(({ id, name, gender }) => ({ id, name: name.trim(), gender })), warmth: gameConfig.warmth, excludeTexts: readStoredHistory(historyKey) }) });
        if (!response.ok) return;
        const data = await response.json();
        if (selectedGame === "truth-dare") setPrefetchedTruth({ key: configKey, questions: data.questions, source: data.source });
        else sessionStorage.setItem("cheers-prefetched-most-likely", JSON.stringify({ key: configKey, questions: data.questions }));
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("题库预生成失败", error); }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [phase, selectedGame, configKey]);

  function enterGame(game: GameId) {
    if (game === "most-likely") sessionStorage.removeItem("cheers-prefetched-most-likely");
    if (game === "truth-dare") setPrefetchedTruth(null);
    setSelectedGame(game);
    setPhase("setup");
  }

  function returnToHub() {
    setPrefetchedTruth(null);
    sessionStorage.removeItem("cheers-prefetched-most-likely");
    setPhase("select");
  }

  function startSelectedGame() {
    if (selectedGame === "most-likely") sessionStorage.setItem("cheers-game-config", JSON.stringify(gameConfig));
    setPhase("playing");
  }

  if (phase === "splash") return <main className="hub-shell"><section className="hub-phone splash-screen" aria-label="干杯应用正在启动">
    <div className="splash-art"><Image src="/game-assets/loading/cheers-splash-v4.png" alt="两只啤酒杯碰杯" width={1536} height={1536} priority/></div>
    <p>把手机放在中间</p>
    <h1>干杯！</h1>
    <span className="splash-progress" aria-hidden="true"><i/></span>
    <button type="button" className="skip-splash" onClick={() => setPhase("select")}>跳过</button>
  </section></main>;

  if (phase === "select") return <main className="hub-shell"><section className="hub-phone game-select-screen page-enter">
    <header className="simple-select-header"><h1>选择游戏</h1></header>
    <div className="game-choice-list" role="group" aria-label="选择游戏">
      {(Object.keys(games) as GameId[]).map((id) => {
        const game = games[id];
        return <button type="button" key={id} className={`game-choice-card ${game.tone}`} onClick={() => enterGame(id)} aria-label={`进入${game.title}`}>
          <span className="game-choice-art"><Image src={game.icon} alt="" width={1536} height={1536} priority/></span>
          <span className="game-choice-title"><strong>{game.title}</strong><EnterIcon/></span>
        </button>;
      })}
    </div>
  </section></main>;

  if (phase === "setup") return <SharedGameSetup config={gameConfig} onChange={setGameConfig} onBack={returnToHub} onStart={startSelectedGame}/>;

  if (selectedGame === "truth-dare") return <div className="integrated-game"><CheersUI onExit={returnToHub} initialConfig={gameConfig} initialQuestionBank={prefetchedTruth?.key === configKey ? prefetchedTruth.questions : undefined} initialQuestionSource={prefetchedTruth?.key === configKey ? prefetchedTruth.source : undefined}/></div>;
  return <main className="hub-shell"><section className="hub-phone embedded-game">
    <button type="button" className="embedded-home" aria-label="返回游戏选择" onClick={returnToHub}><BackIcon/></button>
    <iframe title="谁最可能" src="/who-most-likely.html?embedded=1&autostart=1"/>
  </section></main>;
}
