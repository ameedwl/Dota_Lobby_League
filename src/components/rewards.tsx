"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLeague } from "@/lib/store";
import { rewardSourceLabel, needsPlayer, rewardConflicts, rewardDefinition, rewardInstruction, statusLabel, type Reward, type RewardSelection } from "@/lib/rewards";
import {RewardAdminActions} from "./rewards-admin";
import { HeroSelector } from "./hero-ui";

export function RewardWarnings() {
  const {rewards=[]}=useLeague();
  const warnings=rewardConflicts(rewards);
  return warnings.length ? <aside className="alert" role="status"><strong>HOUSE RULE CONFLICT</strong>{warnings.map(w=><p key={w}>{w}</p>)}</aside> : null;
}
export function ActiveRewardsBanner() {
  const {rewards=[],players}=useLeague(), active=rewards.filter(r=>r.status==="active");
  return active.length ? <aside className="panel reward-banner"><div className="section-row"><h2>Active rewards for upcoming lobby</h2><Link href="/rewards">View rewards →</Link></div><p className="muted">House rules apply when the owner and all configured targets participate. Saving a new applicable match uses the reward.</p><ul>{active.map(r=><li key={r.id}><span aria-hidden="true">{rewardDefinition(r.reward_key)?.icon}</span> {rewardInstruction(r,players)}</li>)}</ul><RewardWarnings/></aside> : null;
}

export function RewardReveal({reward,onClose}:{reward:Reward;onClose:()=>void}) {
  const {players}=useLeague(), def=rewardDefinition(reward.reward_key);
  const [revealed,setRevealed]=useState(false), ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish=()=>setRevealed(true);
    const timer=setTimeout(finish,motion.matches?0:2200);
    const changed=()=>{if(motion.matches)finish();};
    motion.addEventListener("change",changed);
    ref.current?.focus();
    return()=>{clearTimeout(timer);motion.removeEventListener("change",changed);};
  },[]);
  return <div ref={ref} tabIndex={-1} className={"reward-reveal panel "+(revealed?"revealed":"unsealing")} aria-label="Reward reveal">
    <div className="reward-rune" aria-hidden="true"><span>{revealed?def?.icon:"✦"}</span></div>
    <div aria-live="polite" aria-atomic="true">{revealed?<><p className="eyebrow">The pact is sealed · {players.find(p=>p.id===reward.player_id)?.nickname}</p><h2>{def?.name}</h2><p>{def?.description}</p><p className="muted">{statusLabel[reward.status]} · Result saved · only admin can change it before use.</p></>:<><h2>Breaking the seal…</h2><p className="muted">Your result is already saved. Let fate reveal it.</p></>}</div>
    <button className="button secondary" onClick={onClose}>{revealed?"Continue":"Skip reveal"}</button>
  </div>;
}

function RewardConfiguration({reward}:{reward:Reward}) {
  const {players,configureReward}=useLeague();
  // Draft ownership belongs to this keyed component, never a refreshed snapshot.
  const [draft,setDraft]=useState<RewardSelection>({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [draftRevision]=useState(reward.revision??0);
  const config=rewardDefinition(reward.reward_key)?.configuration;
  if(!config)return <p className="alert">Update the app to configure this reward.</p>;
  const set=(key:keyof RewardSelection,value:string|number|undefined)=>setDraft(d=>({...d,[key]:value}));
  const selected=(id?:string)=>players.some(p=>p.id===id)?id:undefined;
  const target=selected(draft.target_player_id), secondary=selected(draft.secondary_target_player_id);
  function playerField(second=false) {
    const key=second?"secondary_target_player_id":"target_player_id", value=second?secondary:target;
    return <div className="field"><label htmlFor={reward.id+key}>{second?"Player B":config==="swap"?"Player A":"Target player"}</label><select id={reward.id+key} value={value??""} required onChange={e=>set(key,e.target.value||undefined)}><option value="">Choose player…</option>{players.filter(p=>(config==="swap"||p.id!==reward.player_id)&&(!second||p.id!==target)).map(p=><option key={p.id} value={p.id}>{p.nickname} · {p.name}</option>)}</select></div>;
  }
  return <form className="reward-config" onSubmit={async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setError("");
    try{const result=await configureReward(reward.id,{...draft,target_player_id:target,secondary_target_player_id:secondary},draftRevision);setError(result.error??"");}
    catch{setError("Could not confirm the result. Your choices are preserved; retry safely.");}finally{setBusy(false);}
  }}>
    <fieldset disabled={busy}>
      {needsPlayer(config)&&playerField()}{config==="swap"&&playerField(true)}
      {(config==="role"||config==="player_role")&&<div className="field"><label htmlFor={reward.id+"role"}>Position</label><select id={reward.id+"role"} value={draft.target_role??""} required onChange={e=>set("target_role",e.target.value?Number(e.target.value):undefined)}><option value="">Choose position…</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>Position {n}</option>)}</select></div>}
      {config==="hero"&&<HeroSelector id={reward.id+"hero"} label="Protected hero" value={draft.target_hero_id} onChange={v=>set("target_hero_id",v)}/>}
      <p className="muted">{config==="random_hero"?"The server will choose and save one hero. It cannot be banned.":config==="random_role"?"The server will choose and save one position with equal 1 in 5 odds.":"Admin can reset these choices before the reward is used."}</p>
      {error&&<p className="alert" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy?"Activating…":"Confirm & activate"}</button>
    </fieldset>
  </form>;
}

export function RewardCard({reward,onRolled,history=false,availableCount}:{reward:Reward;onRolled?:(r:Reward)=>void;history?:boolean;availableCount?:number}) {
  const {players,rollReward}=useLeague(),auth=useAuth(),admin=auth.ready&&auth.isAdmin&&!auth.error;
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const def=rewardDefinition(reward.reward_key), owner=players.find(p=>p.id===reward.player_id);
  return <article className={"panel reward-card reward-"+reward.status}>
    <div className="reward-card-top"><span className="reward-icon" aria-hidden="true">{def?.icon??"✦"}</span><span className="badge">{statusLabel[reward.status]}</span></div>
    <p className="eyebrow">Reward owner · <Link href={"/players/"+reward.player_id}>{owner?.nickname??"Player"}</Link></p>
    <h3>{def?.name??(availableCount?availableCount+" reward "+(availableCount===1?"roll":"rolls")+" available":rewardSourceLabel(reward))}</h3><p>{rewardInstruction(reward,players)}</p>
    <p className="muted">Earned {new Date(reward.earned_at).toLocaleDateString()} · {rewardSourceLabel(reward)}</p>{reward.grant_reason&&<p className="muted">Grant reason: {reward.grant_reason}</p>}
    {history&&<div className="reward-history-links"><span>Qualified: {reward.qualifying_match_id?<Link href={"/matches/"+reward.qualifying_match_id}>View match</Link>:<span>{reward.qualifying_match_snapshot?"Deleted match · "+reward.qualifying_match_snapshot.slice(0,8):"Admin grant · no qualifying match"}</span>}</span>{reward.used_match_snapshot&&<span>Used: {reward.used_match_id?<Link href={"/matches/"+reward.used_match_id}>View match</Link>:<span>Deleted match · {reward.used_match_snapshot.slice(0,8)}</span>}</span>}{reward.cancel_reason&&<span>Correction: {reward.cancel_reason}</span>}</div>}
    {admin&&!history&&reward.status==="available"&&<button className="button" disabled={busy} onClick={async()=>{
      if(busy)return;setBusy(true);setError("");
      try{const result=await rollReward(reward.id);if(result.error)setError(result.error);else if(result.reward)onRolled?.(result.reward);}
      catch{setError("Could not confirm the roll. Retry safely; a saved result will not change.");}finally{setBusy(false);}
    }}>{busy?"Sealing result…":(availableCount?"Roll one":"Roll reward")}</button>}
    {admin&&!history&&reward.status==="pending_configuration"&&<RewardConfiguration key={reward.id+":"+(reward.revision??0)} reward={reward}/>}
    {!admin&&!history&&["available","pending_configuration"].includes(reward.status)&&<p className="muted">The league administrator handles rolling and configuration.</p>}
    {error&&<p className="alert" role="alert">{error}</p>}
    {admin&&<RewardAdminActions reward={reward} onRolled={onRolled} history={history}/>}
  </article>;
}
