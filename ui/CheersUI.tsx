"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { SharedGameConfig } from "./SharedGameSetup";
import { areQuestionsSemanticallySimilar, createFallbackQuestions, questionFingerprint, renderQuestionText, type GameQuestion } from "../lib/questions";
type Gender="男"|"女"; type Player={id:number;name:string;gender:Gender;avatar:number}; type Phase="setup"|"avatar"|"gameLoading"|"direction"|"ready"|"spinning"|"choice"|"question"; type Mode="truth"|"dare"; type InventoryNeed={actorPlayerId:number;mode:Mode;count:number};
const avatarOptions:Record<Gender,number[]>={男:[0,3,5,6,8],女:[1,2,4,7]};
 const directionLibrary=[{id:"flirty",label:"暧昧升温",hint:"多一点心跳与试探"},{id:"heartfelt",label:"更加走心",hint:"聊聊真实感受"},{id:"exciting",label:"刺激一点",hint:"大胆但不过界"},{id:"funny",label:"轻松搞笑",hint:"让这桌笑起来"},{id:"past",label:"聊聊过去",hint:"翻开共同或各自的回忆"},{id:"future",label:"聊聊未来",hint:"说说期待与可能"},{id:"unspoken",label:"没说出口",hint:"给藏着的话一个出口"},{id:"appreciation",label:"彼此欣赏",hint:"发现对方的闪光点"},{id:"values",label:"价值观",hint:"看看彼此在意什么"},{id:"imagination",label:"脑洞假设",hint:"进入有趣的平行世界"},{id:"chemistry",label:"默契挑战",hint:"看看谁最懂谁"},{id:"improv",label:"即兴演技",hint:"现场表演不许怂"},{id:"secretMission",label:"秘密任务",hint:"藏住目的让大家猜"}];
const seedPlayers:Player[]=[{id:1,name:"小林",gender:"男",avatar:0},{id:2,name:"小雨",gender:"女",avatar:1}];
const questionHistoryKey="cheers-truth-dare-question-history-v1";
function readQuestionHistory(){try{const value=JSON.parse(sessionStorage.getItem(questionHistoryKey)??"[]");return Array.isArray(value)?value.filter((text):text is string=>typeof text==="string").slice(-100):[]}catch{return[]}}
function saveQuestionHistory(texts:string[]){sessionStorage.setItem(questionHistoryKey,JSON.stringify(texts.slice(-100)))}
 const ArrowIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>;
 const RefreshIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M18.5 15a7 7 0 1 1-.7-7.8L20 11"/></svg>;
 const ForkIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V11"/><path d="M12 11 6 5"/><path d="M12 11l6-6"/><path d="M6 5v4M6 5h4M18 5v4M18 5h-4"/></svg>;
export default function CheersUI({onExit,initialConfig,initialQuestionBank,initialQuestionSource}:{onExit?:()=>void;initialConfig?:SharedGameConfig;initialQuestionBank?:GameQuestion[];initialQuestionSource?:"ai"|"fallback"}={}){
 const initialPlayers=(initialConfig?.players as Player[]|undefined)??seedPlayers;
 const[phase,setPhase]=useState<Phase>("setup"),[count,setCount]=useState(initialPlayers.length),[players,setPlayers]=useState<Player[]>(initialPlayers),[warmth,setWarmth]=useState(initialConfig?.warmth??58),[active,setActive]=useState<number|null>(null),[selected,setSelected]=useState<number|null>(null),[mode,setMode]=useState<Mode|null>(null),[editingAvatarPlayerId,setEditingAvatarPlayerId]=useState<number|null>(null),[questionBank,setQuestionBank]=useState<GameQuestion[]>([]),[currentQuestion,setCurrentQuestion]=useState<GameQuestion|null>(null),[questionSource,setQuestionSource]=useState<"ai"|"fallback"|null>(null),[refreshCount,setRefreshCount]=useState(0),[isRefreshingQuestion,setIsRefreshingQuestion]=useState(false),[refreshMessage,setRefreshMessage]=useState<string|null>(null),[showRefreshConfirm,setShowRefreshConfirm]=useState(false),[,setSpinProgress]=useState<"fast"|"slow"|"landed"|null>(null);
 const[totalRounds,setTotalRounds]=useState(0),[roundsSinceDirection,setRoundsSinceDirection]=useState(0),[directionPromptCount,setDirectionPromptCount]=useState(0),[activeDirection,setActiveDirection]=useState<string|null>(null),[selectedDirections,setSelectedDirections]=useState<string[]>([]),[directionOptions,setDirectionOptions]=useState(directionLibrary.slice(0,3)),[directionEntry,setDirectionEntry]=useState<"auto"|"manual">("auto"),[pickedDirection,setPickedDirection]=useState<string|null>(null),[isDirectionLoading,setIsDirectionLoading]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),previousWinner=useRef<number|null>(null),usedQuestionTexts=useRef<string[]>([]),questionBankRef=useRef<GameQuestion[]>([]),bankVersion=useRef(0),replenishingVersion=useRef<number|null>(null),proactiveTopUps=useRef(0),prefetchTimer=useRef<ReturnType<typeof setTimeout>|null>(null),prefetchedBank=useRef<{key:string;questions:GameQuestion[];source:"ai"|"fallback"}|null>(null),prefetchRequest=useRef<{key:string;promise:Promise<{questions:GameQuestion[];source:"ai"|"fallback"}>}|null>(null),latestConfigKey=useRef(""),confirmButtonRef=useRef<HTMLButtonElement|null>(null);
 const refreshesSinceDirection=useRef(0),refreshedRoundIds=useRef(new Set<number>());
 const autoStart=useRef(false);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(prefetchTimer.current)clearTimeout(prefetchTimer.current)},[]);
 useEffect(()=>{if(showRefreshConfirm)confirmButtonRef.current?.focus()},[showRefreshConfirm]);
 const visiblePlayers=useMemo(()=>players.slice(0,count),[players,count]),selectedPlayer=visiblePlayers.find(p=>p.id===selected),question=currentQuestion?renderQuestionText(currentQuestion.text,visiblePlayers):"";
 questionBankRef.current=questionBank;
 const gameConfigKey=JSON.stringify({players:visiblePlayers.map(({id,name,gender})=>({id,name:name.trim(),gender})),warmth});
 latestConfigKey.current=gameConfigKey;
 function renderHighlightedQuestion(){
  if(!currentQuestion)return null;
  const names=new Map(visiblePlayers.map(player=>[player.id,player.name]));
  return currentQuestion.text.split(/(\{\{player:\d+\}\})/g).filter(Boolean).map((part,index)=>{
   const match=part.match(/^\{\{player:(\d+)\}\}$/);
   if(!match)return <span key={`${index}-${part}`}>{part}</span>;
   const playerId=Number(match[1]);
   return <span className="question-player-ref" data-player-id={playerId} key={`${index}-${part}`}>{names.get(playerId)??`玩家${playerId}`}</span>;
  })
 }
 function uniqueQuestions(questions:GameQuestion[],existing:GameQuestion[]=[]){
  const accepted=[...usedQuestionTexts.current,...existing.map(item=>item.text)];
  return questions.filter(item=>{if(accepted.some(text=>areQuestionsSemanticallySimilar(text,item.text)))return false;accepted.push(item.text);return true})
 }
 function inventoryNeeds(bank:GameQuestion[],target=4):InventoryNeed[]{
  return visiblePlayers.flatMap(player=>(["truth","dare"] as Mode[]).flatMap(next=>{const available=bank.filter(item=>item.actorPlayerId===player.id&&item.mode===next).length;const missing=Math.max(0,target-available);return missing?[{actorPlayerId:player.id,mode:next,count:Math.min(4,missing)}]:[]}));
 }
 function updateCount(next:number){setCount(next);setPlayers(current=>{const copy=[...current];while(copy.length<next){const id=copy.length+1,gender:Gender=id%2===0?"女":"男",options=avatarOptions[gender];copy.push({id,name:`玩家${id}`,gender,avatar:options[(id-1)%options.length]})}return copy})}
 function updatePlayer(id:number,field:"name"|"gender",value:string){setPlayers(current=>current.map(player=>{if(player.id!==id)return player;if(field==="gender"){const gender=value as Gender;return{...player,gender,avatar:avatarOptions[gender].includes(player.avatar)?player.avatar:avatarOptions[gender][0]}}return{...player,name:value}}))}
 function openAvatarPicker(playerId:number){setEditingAvatarPlayerId(playerId);setPhase("avatar")}
 function chooseAvatar(avatar:number){if(editingAvatarPlayerId===null)return;setPlayers(current=>current.map(player=>player.id===editingAvatarPlayerId?{...player,avatar}:player));setEditingAvatarPlayerId(null);setPhase("setup")}
 async function requestQuestionBank(excludeTexts:string[],questionDirection=activeDirection,options?:{timeoutMs?:number;inventoryNeeds?:InventoryNeed[]}){
  const timeoutMs=options?.timeoutMs;
  const controller=timeoutMs?new AbortController():null;
  const timeout=controller?window.setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
   const response=await fetch("/api/questions/generate",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller?.signal,body:JSON.stringify({players:visiblePlayers.map(({id,name,gender})=>({id,name:name.trim(),gender})),warmth,excludeTexts,questionDirection,inventoryNeeds:options?.inventoryNeeds})});
   if(!response.ok)throw new Error("题库生成失败");
   return await response.json() as {questions:GameQuestion[];source:"ai"|"fallback"};
  }finally{if(timeout!==null)window.clearTimeout(timeout)}
 }
 useEffect(()=>{
  if(phase!=="setup"||visiblePlayers.some(player=>!player.name.trim()))return;
  if(prefetchTimer.current)clearTimeout(prefetchTimer.current);
  const requestedKey=gameConfigKey;
  prefetchTimer.current=setTimeout(()=>{
   const pending=requestQuestionBank(readQuestionHistory(),null);
   prefetchRequest.current={key:requestedKey,promise:pending};
   pending.then(data=>{if(requestedKey===latestConfigKey.current)prefetchedBank.current={key:requestedKey,...data}}).catch(()=>{}).finally(()=>{if(prefetchRequest.current?.promise===pending)prefetchRequest.current=null});
  },700);
  return()=>{if(prefetchTimer.current)clearTimeout(prefetchTimer.current)};
 },[gameConfigKey,phase]);
 async function startGame(){
  if(visiblePlayers.some(player=>!player.name.trim()))return;
  const version=++bankVersion.current;replenishingVersion.current=null;proactiveTopUps.current=1;
 const restoredHistory=readQuestionHistory();usedQuestionTexts.current=restoredHistory;
 setActive(null);setSelected(null);setMode(null);setCurrentQuestion(null);setSpinProgress(null);setIsDirectionLoading(false);setTotalRounds(0);setRoundsSinceDirection(0);setDirectionPromptCount(0);setActiveDirection(null);setSelectedDirections([]);refreshesSinceDirection.current=0;refreshedRoundIds.current.clear();
  setPhase("gameLoading");
  const minimumDelay=new Promise(resolve=>window.setTimeout(resolve,window.matchMedia("(prefers-reduced-motion: reduce)").matches?50:280));
  const cached=prefetchedBank.current?.key===gameConfigKey?prefetchedBank.current:null;
  const supplied=initialQuestionBank?.length?{questions:initialQuestionBank,source:initialQuestionSource??"ai" as const}:null;
  const pending=supplied?Promise.resolve(supplied):cached?Promise.resolve(cached):(prefetchRequest.current?.key===gameConfigKey?prefetchRequest.current.promise:requestQuestionBank(restoredHistory,null));
  prefetchRequest.current={key:gameConfigKey,promise:pending};
  try{let data=await pending;if(version!==bankVersion.current)return;let prepared=uniqueQuestions(data.questions);if(!prepared.length){data=await requestQuestionBank(restoredHistory,null);if(version!==bankVersion.current)return;prepared=uniqueQuestions(data.questions)}const fallback=createFallbackQuestions(visiblePlayers,warmth,new Set(restoredHistory.map(questionFingerprint))).filter(item=>!restoredHistory.some(text=>areQuestionsSemanticallySimilar(text,item.text)));setQuestionBank(prepared.length?prepared:fallback);setQuestionSource(prepared.length?data.source:"fallback");prefetchedBank.current={key:gameConfigKey,...data}}catch{if(version!==bankVersion.current)return;const fallback=createFallbackQuestions(visiblePlayers,warmth,new Set(restoredHistory.map(questionFingerprint))).filter(item=>!restoredHistory.some(text=>areQuestionsSemanticallySimilar(text,item.text)));setQuestionBank(fallback);setQuestionSource("fallback")}
  await minimumDelay;
  if(version===bankVersion.current){setPhase("ready");window.setTimeout(()=>replenish(),350)}
 }
 useEffect(()=>{if(initialConfig&&!autoStart.current){autoStart.current=true;void startGame()}},[]);
 function spin(){if(phase==="spinning"||visiblePlayers.length<2)return;if(questionSource!=="ai"&&!prefetchRequest.current)replenish();setPhase("spinning");setSelected(null);setMode(null);setSpinProgress("fast");const candidates=visiblePlayers.filter(p=>p.id!==previousWinner.current),target=candidates[Math.floor(Math.random()*candidates.length)]??visiblePlayers[0],targetIndex=visiblePlayers.findIndex(p=>p.id===target.id),steps=visiblePlayers.length*5+targetIndex+1;let step=0;const tick=()=>{setActive(visiblePlayers[step%visiblePlayers.length].id);step++;const progress=step/steps;setSpinProgress(progress>.68?"slow":"fast");if(step<=steps)timer.current=setTimeout(tick,62+Math.pow(progress,3)*220);else{setActive(target.id);setSelected(target.id);previousWinner.current=target.id;setSpinProgress("landed");timer.current=setTimeout(()=>setPhase("choice"),650)}};tick()}
 function takeQuestion(next:Mode,actorId:number){
  const usedFingerprints=new Set(usedQuestionTexts.current.map(questionFingerprint));
  let chosen=questionBank.find(item=>item.mode===next&&item.actorPlayerId===actorId&&!usedFingerprints.has(questionFingerprint(item.text)));
  if(chosen){const chosenFingerprint=questionFingerprint(chosen.text);setQuestionBank(current=>current.filter(item=>item.id!==chosen!.id&&questionFingerprint(item.text)!==chosenFingerprint))}
  if(!chosen){const fallback=createFallbackQuestions(visiblePlayers,warmth,new Set(usedQuestionTexts.current.map(questionFingerprint))).filter(item=>!usedQuestionTexts.current.some(text=>areQuestionsSemanticallySimilar(text,item.text)));chosen=fallback.find(item=>item.mode===next&&item.actorPlayerId===actorId)}
  if(chosen){usedQuestionTexts.current.push(chosen.text);saveQuestionHistory(usedQuestionTexts.current);setCurrentQuestion(chosen)}
  return chosen;
 }
 function commitGeneratedQuestion(chosen:GameQuestion,candidates:GameQuestion[],source:"ai"|"fallback"){
  const chosenFingerprint=questionFingerprint(chosen.text);
  const remaining=candidates.filter(item=>item.id!==chosen.id&&questionFingerprint(item.text)!==chosenFingerprint);
  setQuestionBank(current=>[...current,...uniqueQuestions(remaining,current)]);
  usedQuestionTexts.current.push(chosen.text);saveQuestionHistory(usedQuestionTexts.current);setCurrentQuestion(chosen);setQuestionSource(source);
 }
 function leastRecentlyUsedFallback(next:Mode,actorId:number){
  const candidates=createFallbackQuestions(visiblePlayers,warmth,new Set(),8).filter(item=>item.mode===next&&item.actorPlayerId===actorId);
  const semanticHistory=usedQuestionTexts.current;
  return candidates.sort((left,right)=>{
   const lastUsed=(text:string)=>{for(let index=semanticHistory.length-1;index>=0;index-=1)if(areQuestionsSemanticallySimilar(semanticHistory[index],text))return index;return-1};
   return lastUsed(left.text)-lastUsed(right.text);
  })[0];
 }
 function replenish(){
  const version=bankVersion.current;if(replenishingVersion.current===version)return;
  const needs=inventoryNeeds(questionBankRef.current);if(!needs.length)return;replenishingVersion.current=version;
  const excluded=[...usedQuestionTexts.current,...questionBankRef.current.map(item=>item.text)].slice(-100);
  requestQuestionBank(excluded,activeDirection,{inventoryNeeds:needs}).then(data=>{if(version!==bankVersion.current)return;setQuestionSource(data.source);setQuestionBank(current=>[...current,...uniqueQuestions(data.questions,current)])}).catch(()=>{}).finally(()=>{if(replenishingVersion.current===version){replenishingVersion.current=null;if(proactiveTopUps.current>0){proactiveTopUps.current-=1;window.setTimeout(()=>{if(version===bankVersion.current)replenish()},700)}}});
 }
 async function chooseMode(next:Mode){
  if(selected===null)return;
  const actorId=selected;setMode(next);setRefreshCount(0);setRefreshMessage(null);
  let chosen=takeQuestion(next,actorId);
  if(chosen){setPhase("question");replenish();return}
  setPhase("gameLoading");
  try{
   const data=await requestQuestionBank(usedQuestionTexts.current,activeDirection,{timeoutMs:12000,inventoryNeeds:[{actorPlayerId:actorId,mode:next,count:4}]});
   const fresh=uniqueQuestions(data.questions,questionBank);
   chosen=fresh.find(item=>item.mode===next&&item.actorPlayerId===actorId);
   if(chosen)commitGeneratedQuestion(chosen,fresh,data.source);
  }catch(error){console.warn("模式题库补充失败",error)}
  if(!chosen){chosen=leastRecentlyUsedFallback(next,actorId);if(chosen)commitGeneratedQuestion(chosen,[],"fallback")}
  if(chosen){setPhase("question");replenish()}else{setMode(null);setPhase("choice")}
 }
 function goBack(){
  if(timer.current){clearTimeout(timer.current);timer.current=null}
  setShowRefreshConfirm(false);
  if(phase==="avatar"){setPhase("setup");return}
  if(phase==="question"){setActive(null);setSelected(null);setMode(null);setCurrentQuestion(null);setRefreshCount(0);setPhase("ready");return}
  if(phase==="choice"){setPhase("ready");return}
  setActive(null);setSelected(null);setMode(null);setSpinProgress(null);setPhase("setup")
 }
 async function consumeRefresh(){
  if(!mode||selected===null||isRefreshingQuestion)return;
  setRefreshMessage(null);
  let chosen=takeQuestion(mode,selected);
  if(!chosen){
   setIsRefreshingQuestion(true);
   try{
    const data=await requestQuestionBank(usedQuestionTexts.current,activeDirection,{timeoutMs:10000,inventoryNeeds:[{actorPlayerId:selected,mode,count:4}]});
    const fresh=uniqueQuestions(data.questions,questionBank);
    chosen=fresh.find(item=>item.mode===mode&&item.actorPlayerId===selected);
    if(chosen){
     const chosenFingerprint=questionFingerprint(chosen.text);
     const remaining=fresh.filter(item=>item.id!==chosen!.id&&questionFingerprint(item.text)!==chosenFingerprint);
     setQuestionBank(current=>[...current,...uniqueQuestions(remaining,current)]);
     usedQuestionTexts.current.push(chosen.text);saveQuestionHistory(usedQuestionTexts.current);setCurrentQuestion(chosen);setQuestionSource(data.source);
    }
   }catch(error){console.warn("换题补充失败",error)}finally{setIsRefreshingQuestion(false)}
  }
  if(!chosen){setRefreshMessage("暂时没有准备好新题，请稍后再试");return}
  refreshesSinceDirection.current+=1;refreshedRoundIds.current.add(totalRounds+1);setRefreshCount(current=>current+1);replenish();
 }
 function nextQuestion(e:React.MouseEvent){e.stopPropagation();if(refreshCount>=2||isRefreshingQuestion)return;if(refreshCount===1){setShowRefreshConfirm(true);return}void consumeRefresh()}
 function confirmExtraRefresh(){setShowRefreshConfirm(false);void consumeRefresh()}
 function prepareDirectionOptions(entry:"auto"|"manual"=directionEntry){const optionCount=entry==="manual"?4:3;if(entry==="auto"&&directionPromptCount===0){setDirectionOptions(directionLibrary.slice(0,optionCount));return}const eligible=directionLibrary.filter(item=>!selectedDirections.includes(item.id)).sort(()=>Math.random()-.5);setDirectionOptions((eligible.length>=optionCount?eligible:directionLibrary).slice(0,optionCount))}
 function refreshDirectionOptions(){if(pickedDirection!==null)return;const optionCount=directionEntry==="manual"?4:3,shown=new Set(directionOptions.map(item=>item.id)),eligible=directionLibrary.filter(item=>!shown.has(item.id)&&!selectedDirections.includes(item.id)).sort(()=>Math.random()-.5);setDirectionOptions((eligible.length>=optionCount?eligible:directionLibrary.filter(item=>!shown.has(item.id)).sort(()=>Math.random()-.5)).slice(0,optionCount))}
 function openDirectionPicker(entry:"auto"|"manual"){setDirectionEntry(entry);setPickedDirection(null);prepareDirectionOptions(entry);setPhase("direction")}
 function closeDirectionPicker(){if(pickedDirection!==null)return;if(directionEntry==="auto")chooseDirection(null);else{setPickedDirection(null);setPhase("ready")}}
 function chooseDirection(direction:string|null){
  if(pickedDirection!==null)return;setPickedDirection(direction??"keep");
  window.setTimeout(()=>{if(directionEntry==="auto")setDirectionPromptCount(current=>current+1);setRoundsSinceDirection(0);refreshesSinceDirection.current=0;refreshedRoundIds.current.clear();
   if(!direction){setPhase("ready");setPickedDirection(null);return}
   const version=++bankVersion.current;replenishingVersion.current=null;proactiveTopUps.current=0;setActiveDirection(direction);setSelectedDirections(current=>current.includes(direction)?current:[...current,direction]);setQuestionBank([]);setIsDirectionLoading(true);
   requestQuestionBank(usedQuestionTexts.current,direction).then(data=>{if(version!==bankVersion.current)return;const nextBank=uniqueQuestions(data.questions),fallback=uniqueQuestions(createFallbackQuestions(visiblePlayers,warmth,new Set(usedQuestionTexts.current.map(questionFingerprint))));setQuestionBank(nextBank.length?nextBank:fallback);setQuestionSource(data.source)}).catch(()=>{if(version===bankVersion.current){setQuestionBank(uniqueQuestions(createFallbackQuestions(visiblePlayers,warmth,new Set(usedQuestionTexts.current.map(questionFingerprint)))));setQuestionSource("fallback")}}).finally(()=>{if(version===bankVersion.current){setIsDirectionLoading(false);setPhase("ready");setPickedDirection(null);window.setTimeout(()=>replenish(),350)}})
  },260)
 }
 function nextRound(){if(isRefreshingQuestion)return;const nextTotal=totalRounds+1,nextSince=roundsSinceDirection+1,roundThreshold=Math.max(6,count*2),refreshTrigger=refreshesSinceDirection.current>=6&&refreshedRoundIds.current.size>=3,roundTrigger=nextSince>=roundThreshold,shouldPrompt=directionPromptCount<2&&(refreshTrigger||roundTrigger);setTotalRounds(nextTotal);setRoundsSinceDirection(nextSince);setActive(null);setSelected(null);setMode(null);setCurrentQuestion(null);setRefreshCount(0);setRefreshMessage(null);setShowRefreshConfirm(false);setSpinProgress(null);if(shouldPrompt)openDirectionPicker("auto");else setPhase("ready")}
 const upperCount=Math.ceil(visiblePlayers.length/2),upperPlayers=visiblePlayers.slice(0,upperCount),lowerPlayers=visiblePlayers.slice(upperCount);
 function renderPlayerCard(p:Player){const isActive=active===p.id,isSelected=selected===p.id;return <article key={p.id} className={`split-player-card ${isActive?"halo-active":""} ${isSelected?"winner":""}`} aria-label={`${p.name}${isSelected?"，本轮选中":""}`}><div className={`avatar-art avatar-${p.avatar}`} role="img" aria-label={`${p.name}的头像`}/><strong>{p.name}</strong></article>}
 const editingPlayer=players.find(player=>player.id===editingAvatarPlayerId);
 return <main className="app-shell"><section className={`phone-stage ${phase!=="setup"?"has-back":""}`}>{phase!=="setup"&&phase!=="direction"&&<button className="back-button" type="button" aria-label={phase==="avatar"?"返回玩家设置":phase==="question"?"返回跳灯选人":phase==="choice"?"返回跳灯结果":"返回玩家设置"} onClick={goBack}><ArrowIcon/></button>}{phase==="setup"&&onExit&&<button className="game-home-button" type="button" aria-label="返回游戏选择" onClick={onExit}><ArrowIcon/></button>}
 {phase==="setup"?<div className="setup-view page-enter"><header className="shared-setup-header"><h1>人数选择</h1><p>选择人数，完善玩家信息</p></header>
 <section className="paper-panel"><div className="section-heading"><span>1</span><div><b>选择人数</b><small>所有玩家都会留在同一屏</small></div></div><div className="count-row">{[2,3,4,5,6].map(n=><button key={n} aria-pressed={count===n} className={count===n?"active":""} onClick={()=>updateCount(n)}>{n}</button>)}</div></section>
 <section className="paper-panel players-editor"><div className="section-heading"><span>2</span><div><b>玩家昵称</b><small>短一点，隔着桌子也能看清</small></div></div><div className="editor-grid">{visiblePlayers.map((p,i)=><div className="player-input" key={p.id}><button type="button" className={`avatar-picker-button mini-avatar avatar-${p.avatar}`} aria-label={`为${p.name}选择头像`} onClick={()=>openAvatarPicker(p.id)}/><label><span>玩家 {i+1}</span><input value={p.name} maxLength={6} onChange={e=>updatePlayer(p.id,"name",e.target.value)}/></label><div className="gender-toggle" aria-label={`${p.name}的性别`}>{(["男","女"] as Gender[]).map(g=><button type="button" key={g} aria-pressed={p.gender===g} onClick={()=>updatePlayer(p.id,"gender",g)}>{g}</button>)}</div></div>)}</div></section>
 <section className="paper-panel warmth-panel"><div className="section-heading"><span>3</span><div><b>{count===2?"你们有多靠近？":"这桌人有多熟？"}</b><small>只影响题目的深入程度</small></div></div><h2>关系温度</h2><div className="warmth-label"><span>慢慢认识</span><strong>{warmth<32?"初见":warmth<68?"渐暖":"很靠近"}</strong><span>无话不谈</span></div><input className="warmth-range" aria-label="关系温度" type="range" min="0" max="100" value={warmth} onChange={e=>setWarmth(Number(e.target.value))}/></section><section className="setup-table-card" aria-label={`本桌玩家，共${count}人`}><header><h2>本桌玩家</h2><span>{count}人</span></header><div className={`setup-table-players count-${count}`}>{visiblePlayers.map(player=><div className="setup-table-player" key={player.id}><span className={`avatar-art avatar-${player.avatar}`} aria-hidden="true"/><b>{player.name||`玩家${player.id}`}</b></div>)}</div></section><button className="primary-button" onClick={startGame}>开始</button></div>:
 phase==="avatar"?<div className="avatar-picker-screen page-enter"><header><span>选择头像</span><h1>{editingPlayer?.name}</h1><p>已根据“{editingPlayer?.gender}”筛选</p></header><div className="avatar-option-grid">{editingPlayer&&avatarOptions[editingPlayer.gender].map(avatar=><button type="button" key={avatar} className={`avatar-option ${editingPlayer.avatar===avatar?"selected":""}`} aria-label={`选择头像 ${avatar+1}`} aria-pressed={editingPlayer.avatar===avatar} onClick={()=>chooseAvatar(avatar)}><span className={`avatar-art avatar-${avatar}`} aria-hidden="true"/></button>)}</div></div>:
 phase==="gameLoading"?<div className="question-prep-screen page-enter" role="status" aria-live="polite"><div className="generated-loading-art"><Image src="/game-assets/loading/truth-dare-loading-v1.png" alt="" width={1536} height={1536} priority/></div><span>正在根据本桌玩家准备</span><h1>生成今晚的题目</h1><div className="loading-dots" aria-hidden="true"><i/><i/><i/></div></div>:
 phase==="direction"?isDirectionLoading?<div className="direction-loading page-enter" role="status" aria-live="polite"><span className="direction-loading-mark" aria-hidden="true"/><h1>正在调整题目方向</h1><p>马上开始下一轮</p></div>:<div className={`direction-screen page-enter ${directionEntry} ${pickedDirection?"is-leaving":""}`}><div className="direction-toolbar"><button type="button" aria-label="返回游戏" onClick={closeDirectionPicker} disabled={pickedDirection!==null}><ArrowIcon/></button></div><header className="direction-header"><h1>接下来，想聊点什么？</h1></header><div className="direction-grid">{directionOptions.map((item,index)=><button type="button" key={item.id} style={{"--card-index":index} as React.CSSProperties} className={pickedDirection===item.id?"is-picked":""} aria-pressed={pickedDirection===item.id} onClick={()=>chooseDirection(item.id)}><span>0{index+1}</span><strong>{item.label}</strong></button>)}{directionEntry==="auto"&&<button type="button" style={{"--card-index":3} as React.CSSProperties} className={`keep-direction ${pickedDirection==="keep"?"is-picked":""}`} aria-pressed={pickedDirection==="keep"} onClick={()=>chooseDirection(null)}><span>04</span><strong>保持现在</strong></button>}</div><button type="button" className="direction-refresh-button" onClick={refreshDirectionOptions} disabled={pickedDirection!==null}><RefreshIcon/><span>换一批方向</span></button></div>:
 phase==="choice"?<div className="choice-screen page-enter"><button className="mode-art-button" aria-label="真心话" onClick={()=>void chooseMode("truth")}><Image src="/mode-cards/truth-landscape.png" alt="" width={1536} height={1024} unoptimized priority/></button><div className="selected-id-card"><div className={`avatar-art avatar-${selectedPlayer?.avatar??0}`}/><strong>{selectedPlayer?.name}</strong></div><button className="mode-art-button" aria-label="大冒险" onClick={()=>void chooseMode("dare")}><Image src="/mode-cards/dare-landscape.png" alt="" width={1536} height={1024} unoptimized priority/></button></div>:
 phase==="question"?<div className="question-screen page-enter"><div className={`question-card ${mode}`} role="button" tabIndex={0} onClick={nextRound} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();nextRound()}}} aria-label={`${question}。点击卡片进入下一轮`}><span className="question-mark" aria-hidden="true">{mode==="truth"?"?":"!"}</span><strong>{renderHighlightedQuestion()}</strong><button className="refresh-button" type="button" aria-label={isRefreshingQuestion?"正在换题":refreshCount>=2?"本轮换题机会已用完":"换一题"} onClick={nextQuestion} disabled={refreshCount>=2||isRefreshingQuestion}>{isRefreshingQuestion?"正在换题…":"换一题"}</button>{refreshMessage&&<span className="refresh-limit" role="status">{refreshMessage}</span>}{refreshCount>=2&&<span className="refresh-limit" role="status">本轮换题机会用完了</span>}<span className="card-hint">点击卡片，进入下一轮</span></div>{showRefreshConfirm&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>setShowRefreshConfirm(false)}><section className="refresh-dialog" role="dialog" aria-modal="true" aria-labelledby="refresh-dialog-title" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape")setShowRefreshConfirm(false)}}><span className="dialog-mark" aria-hidden="true">↻</span><h2 id="refresh-dialog-title">再换一题，就要干一杯</h2><p>这是本轮最后一次换题机会。</p><div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={()=>setShowRefreshConfirm(false)}>就做这题</button><button ref={confirmButtonRef} type="button" className="dialog-primary" onClick={confirmExtraRefresh}>干杯，换题</button></div></section></div>}</div>:
 <div className={`game-view phase-${phase}`}><div className={`split-game players-${visiblePlayers.length}`}><div className={`arena-half upper count-${upperPlayers.length}`}>{upperPlayers.map(renderPlayerCard)}</div><div className="game-controls"><button className={`start-bar ${phase==="spinning"?"running":""}`} onClick={spin} disabled={phase==="spinning"} aria-label={phase==="ready"?"开始游戏":"正在随机选择玩家"}><span>{phase==="ready"?"开始游戏":""}</span></button><button type="button" className="direction-entry-button" aria-label="选择题目方向" onClick={()=>openDirectionPicker("manual")} disabled={phase==="spinning"}><ForkIcon/><span>方向</span></button></div><div className={`arena-half lower count-${lowerPlayers.length}`}>{lowerPlayers.map(renderPlayerCard)}</div></div></div>}</section></main>}
