"use client";
import {useRef,useState} from "react";
import {useAuth} from "@/lib/auth";
import {useLeague} from "@/lib/store";
import {rewardDefinition,type Reward,type RewardAudit} from "@/lib/rewards";

export function RewardAdminActions({reward,onRolled,history}:{reward:Reward;onRolled?:(r:Reward)=>void;history:boolean}) {
  const {rerollReward,resetRewardConfiguration,cancelReward,rewardAudit,rewardsV2Ready}=useLeague();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[reason,setReason]=useState(""),[audit,setAudit]=useState<RewardAudit[]>([]),[loaded,setLoaded]=useState(false);
  const requests=useRef<Record<string,string>>({});
  const unused=reward.status!=="used"&&reward.status!=="cancelled"&&!reward.used_at;
  const rolled=["active","pending_configuration"].includes(reward.status);
  const def=rewardDefinition(reward.reward_key);
  async function correct(kind:"reroll"|"reset") {
    const message=kind==="reroll"?`Reroll ${def?.name}? Replace it with a different enabled reward at equal odds and clear its configuration. The original entitlement and milestone are kept.`:"Reset configuration? This reward will stop being active until configured again. Random hero/role assignments will be drawn again after choosing a target.";
    if(busy||!window.confirm(message))return;
    setBusy(true);setError("");
    const key=kind+":"+(reward.revision??0);
    const requestId=requests.current[key]??=crypto.randomUUID();
    try {
      const action=kind==="reroll"?rerollReward:resetRewardConfiguration;
      const result=await action(reward.id,reward.revision??0,requestId);
      if(result.error)setError(result.error);
      else if(result.reward){setLoaded(false);if(kind==="reroll")onRolled?.(result.reward);}
    }catch{setError("Could not confirm the change. Retry safely with the same request.");}finally{setBusy(false);}
  }
  return <details className="reward-correction"><summary>{unused?"Admin correction":"Admin audit"}{reward.reroll_count?` · ${reward.reroll_count} rerolls`:""}</summary>
    {unused&&<>
      {rewardsV2Ready&&rolled&&<button className="button secondary" disabled={busy} onClick={()=>void correct("reroll")}>Reroll reward</button>}
      {rewardsV2Ready&&reward.status==="active"&&def?.configuration!=="none"&&<button className="button secondary" disabled={busy} onClick={()=>void correct("reset")}>Reset configuration</button>}
      <label htmlFor={"reason-"+(history?"history-":"")+reward.id}>Reason for voiding</label><input id={"reason-"+(history?"history-":"")+reward.id} value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Explain the recording mistake"/>
      <button className="button secondary" disabled={busy||reason.trim().length<3} onClick={async()=>{
        if(!window.confirm("Void this unused reward? Its milestone and result stay in history."))return;
        setBusy(true);setError("");try{const r=await cancelReward(reward.id,reason);setError(r.error??"");}catch{setError("Could not confirm cancellation. Retry safely.");}finally{setBusy(false);}
      }}>Void reward</button>
    </>}
    {rewardsV2Ready&&<button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);const r=await rewardAudit(reward.id);setError(r.error??"");setAudit(r.audit);setLoaded(true);setBusy(false);}}>Load audit</button>}
    {loaded&&<div className="reward-history-links">{audit.length?audit.map(a=><p key={a.id}>{new Date(a.created_at).toLocaleString()} · {a.action==="reroll"?`Reroll #${a.new_result.reroll_count}: ${rewardDefinition(a.previous_result.reward_key)?.name} → ${rewardDefinition(a.new_result.reward_key)?.name}`:"Configuration reset"}</p>):<p>No rerolls or configuration resets.</p>}</div>}
    {error&&<p className="alert" role="alert">{error}</p>}
  </details>;
}

export function GrantRewardTool() {
  const auth=useAuth(),{players,grantReward,rewardsV2Ready}=useLeague();
  const [player,setPlayer]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const request=useRef<string|null>(null);
  if(!auth.ready||!auth.isAdmin||auth.error||!rewardsV2Ready)return null;
  return <details className="panel reward-correction"><summary>Admin testing · Grant reward roll</summary><form onSubmit={async e=>{
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");request.current??=crypto.randomUUID();
    try{const r=await grantReward(player,reason,request.current);setMessage(r.error??"One available roll granted. Reward streak unchanged.");if(!r.error){setReason("");request.current=null;}}
    catch{setMessage("Could not confirm the grant. Retry safely.");}finally{setBusy(false);}
  }}><fieldset disabled={busy} className="reward-admin-fields"><div className="field"><label htmlFor="grant-player">Player</label><select id="grant-player" required value={player} onChange={e=>{setPlayer(e.target.value);request.current=null;}}><option value="">Choose player…</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}</select></div><div className="field"><label htmlFor="grant-reason">Reason (optional)</label><input id="grant-reason" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);request.current=null;}}/></div><button className="button" disabled={busy}>{busy?"Granting…":"Grant reward roll"}</button></fieldset>{message&&<p role="status">{message}</p>}</form></details>;
}
