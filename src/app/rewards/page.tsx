"use client";
import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { RewardCard, RewardReveal, RewardWarnings } from "@/components/rewards";
import { useLeague } from "@/lib/store";
import {GrantRewardTool} from "@/components/rewards-admin";
import { groupAvailableRewards, milestoneProgress, rewardCatalog, statusLabel, type Reward } from "@/lib/rewards";

export default function RewardsPage() {
  const {rerollCredits=[],players,rewards=[],rewardCatalog:enabled=[],rewardsReady,rewardBaseline,rewardStreaks=[],rewardsV2Ready}=useLeague();
  const [reveal,setReveal]=useState<Reward|null>(null),[player,setPlayer]=useState(""),[status,setStatus]=useState(""),[kind,setKind]=useState("");
  const stats=rewardStreaks.map(s=>({...s,player:players.find(p=>p.id===s.player_id)})).filter(s=>s.player).sort((a,b)=>b.current_streak-a.current_streak||a.player_id.localeCompare(b.player_id));
  const pool=rewardCatalog.filter(d=>enabled.some(r=>r.key===d.key&&r.enabled));
  const available=rewards.filter(r=>r.status==="available"), active=rewards.filter(r=>["pending_configuration","active"].includes(r.status));
  const history=rewards.filter(r=>(!player||r.player_id===player)&&(!status||r.status===status)&&(!kind||r.reward_key===kind)).sort((a,b)=>Date.parse(b.earned_at)-Date.parse(a.earned_at)||a.id.localeCompare(b.id));
  return <><PageHeader eyebrow="Fortune favors a streak" title="Rewards" description="Every three consecutive wins unlock another roll. Every enabled reward has the same chance. Some gifts come with a price."/>
    <section className="panel reward-rules"><div><span className="eyebrow">The pact</span><h2>3 / 6 / 9 / 12… WINS → REWARDS</h2></div><p>Earn a roll at every positive multiple of three wins in one uninterrupted streak. A loss resets reward progress to zero, but you keep your earned rolls. Only matches from the included reward baseline count. Overall league statistics are unchanged. House rules apply to the next newly recorded game with the owner and all required targets.</p></section>
    {!rewardsReady&&<p className="alert" role="status">Rewards are not installed in this league yet. The administrator must review and manually apply migration <code>202610040001_reward_system.sql</code>. No historical rolls will be backfilled.</p>}
    {rewardsReady&&!rewardsV2Ready&&<p className="alert">Reward V2 requires migration 202610100001_reward_milestones_rerolls.sql.</p>}
    {rewardsV2Ready&&<p className="muted">{rewardBaseline?.baseline_match_snapshot?<>Reward era starts with {rewardBaseline.baseline_match_id?<Link href={"/matches/"+rewardBaseline.baseline_match_id}>this included baseline match</Link>:"the stored baseline match (now deleted)"}. Older matches still count for overall statistics.</>:"Reward baseline not set. New milestone grants are paused until the administrator manually runs the reset-to-latest-match script."}</p>}
    <GrantRewardTool/>
    {rerollCredits.map(c=><div className="panel birthday-gift" key={c.id}><strong>{players.find(p=>p.id===c.player_id)?.nickname??"Player"} · {c.label}</strong><p>{c.remaining_uses?"1 AVAILABLE · Admin can use this gift on an unused rolled reward below. This gift does not expire.":"USED · Birthday reroll recorded in reward history."}</p></div>)}
    {reveal&&<RewardReveal key={reveal.id+":"+(reveal.revision??reveal.reroll_count??0)} reward={reveal} onClose={()=>setReveal(null)}/>}
    <div className="section-row"><h2 className="section-title">Available Rolls</h2><span className="badge">{available.length} unlocked</span></div>
    <div className="reward-grid">{groupAvailableRewards(available).map(group=><RewardCard key={group[0].id} reward={group[0]} availableCount={group.length} onRolled={setReveal}/>)}</div>{!available.length&&<p className="empty">No unused rolls. Win three in a row to break the seal.</p>}
    <div className="section-row"><h2 className="section-title">Active Rewards</h2></div><RewardWarnings/>
    <div className="reward-grid">{active.map(r=><RewardCard key={r.id} reward={r} onRolled={setReveal}/>)}</div>{!active.length&&<p className="empty">No active or pending rewards.</p>}
    <div className="section-row"><h2 className="section-title">Current Reward Streaks</h2></div>
    <div className="reward-streaks">{stats.map(s=>{const progress=milestoneProgress(s.current_streak);return <Link key={s.player_id} href={"/players/"+s.player_id} className={"panel "+(progress.winsNeeded===1?"reward-near":"")}><strong>{s.player!.nickname}</strong><b>{s.current_streak}W</b><small>{progress.reached&&<>Milestone reached: {s.current_streak} wins · </>}Next milestone: {progress.nextMilestone}<br/>{progress.winsNeeded} more {progress.winsNeeded===1?"win":"wins"} until next reward</small></Link>;})}</div>
    <div className="section-row"><h2 className="section-title">Reward Pool</h2><span className="badge">{pool.length} rewards · Equal odds</span></div>
    <p className="muted">Every enabled reward has the same chance{pool.length?`: 1 / ${pool.length} (${(100/pool.length).toFixed(2)}%).`:"."}</p>
    <div className="reward-grid">{pool.map(d=><article className="panel reward-pool-card" key={d.key}><span className="reward-icon" aria-hidden="true">{d.icon}</span><h3>{d.name}</h3><p>{d.description}</p></article>)}</div>
    <div className="section-row"><h2 className="section-title">Reward History</h2><span className="muted">Newest first · {history.length} records</span></div>
    <div className="filters reward-filters"><label>Owner<select value={player} onChange={e=>setPlayer(e.target.value)}><option value="">All players</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}</select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(statusLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Reward<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">All rewards</option>{rewardCatalog.map(d=><option key={d.key} value={d.key}>{d.name}</option>)}</select></label></div>
    <div className="reward-grid">{history.map(r=><RewardCard key={r.id} reward={r} history onRolled={setReveal}/>)}</div>{!history.length&&<p className="empty">No reward history matches these filters.</p>}
  </>;
}
