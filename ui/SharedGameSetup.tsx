"use client";
import { useState } from "react";

export type SharedPlayer = { id: number; name: string; gender: "男" | "女"; avatar: number };
export type SharedGameConfig = { players: SharedPlayer[]; warmth: number };

const seedPlayers: SharedPlayer[] = [
  { id: 1, name: "", gender: "男", avatar: 0 },
  { id: 2, name: "", gender: "女", avatar: 1 },
  { id: 3, name: "", gender: "男", avatar: 3 },
  { id: 4, name: "", gender: "女", avatar: 2 },
  { id: 5, name: "", gender: "男", avatar: 5 },
  { id: 6, name: "", gender: "女", avatar: 4 },
];
const avatarOptions = { 男: [0, 3, 5, 6, 8], 女: [1, 2, 4, 7] } as const;

const BackIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>;

export default function SharedGameSetup({ config, onChange, onBack, onStart }: {
  config: SharedGameConfig;
  onChange: (config: SharedGameConfig) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const [avatarPlayerId, setAvatarPlayerId] = useState<number | null>(null);
  const players = config.players;
  const setCount = (count: number) => onChange({ ...config, players: seedPlayers.slice(0, count).map((seed, index) => players[index] ?? seed) });
  const updatePlayer = (id: number, patch: Partial<SharedPlayer>) => onChange({ ...config, players: players.map(player => player.id === id ? { ...player, ...patch } : player) });
  return <main className="hub-shell"><section className="hub-phone shared-game-setup page-enter">
    <button type="button" className="hub-back-button" aria-label="返回游戏选择" onClick={onBack}><BackIcon/></button>
    <header className="count-header"><h1>人数选择</h1></header>
    <div className="count-picker" role="group" aria-label="选择游戏人数">{[2,3,4,5,6].map(count => <button type="button" className="count-button" key={count} aria-pressed={players.length === count} onClick={() => setCount(count)}>{count}</button>)}</div>
    <div className={`setup-player-list count-${players.length}`}>{players.map((player, index) => <div className="setup-player-row" key={player.id}>
      <button type="button" className={`setup-avatar-button avatar-art avatar-${player.avatar}`} aria-label={`为玩家${index + 1}选择头像`} onClick={() => setAvatarPlayerId(player.id)}/>
      <label className="name-field"><input value={player.name} placeholder={`输入玩家${index + 1}昵称`} maxLength={6} aria-label={`玩家${index + 1}昵称`} onChange={event => updatePlayer(player.id, { name: event.target.value })}/><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4-1 10-10-3-3L5 16zM13 8l3 3"/></svg></label>
      <div className="gender-switch" aria-label={`玩家${index + 1}的性别`}>{(["男","女"] as const).map(gender => <button type="button" key={gender} aria-pressed={player.gender === gender} onClick={() => updatePlayer(player.id, { gender, avatar: avatarOptions[gender][0] })}>{gender}</button>)}</div>
    </div>)}</div>
    <section className="warmth-setup"><h2>关系温度</h2><div className="warmth-labels"><span>慢慢认识</span><span>无话不谈</span></div><input className="warmth-range" aria-label="关系温度" type="range" min="0" max="100" value={config.warmth} onChange={event => onChange({ ...config, warmth: Number(event.target.value) })}/></section>
    <section className="setup-roster"><header><h2>本桌玩家</h2><span>{players.length}人</span></header><div className="roster-players">{players.map(player => <div className="roster-player" key={player.id}><span className={`avatar-art avatar-${player.avatar}`} aria-hidden="true"/><b>{player.name || `玩家${player.id}`}</b></div>)}</div></section>
    <button type="button" className="primary-button shared-start" disabled={players.some(player => !player.name.trim())} onClick={onStart}>开始</button>
    {avatarPlayerId !== null && (() => { const player = players.find(item => item.id === avatarPlayerId); if (!player) return null; return <div className="avatar-picker-backdrop" role="presentation" onMouseDown={() => setAvatarPlayerId(null)}><section className="shared-avatar-picker" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title" onMouseDown={event => event.stopPropagation()}><header><h2 id="avatar-picker-title">选择头像</h2><button type="button" aria-label="关闭头像选择" onClick={() => setAvatarPlayerId(null)}>×</button></header><div className="shared-avatar-options">{avatarOptions[player.gender].map(avatar => <button type="button" key={avatar} className={`avatar-art avatar-${avatar} ${player.avatar === avatar ? "selected" : ""}`} aria-label={`选择头像${avatar + 1}`} aria-pressed={player.avatar === avatar} onClick={() => { updatePlayer(player.id, { avatar }); setAvatarPlayerId(null); }}/>)}</div></section></div>; })()}
  </section></main>;
}
