"use client";
import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { RewardCard, RewardReveal, RewardWarnings } from "@/components/rewards";
import { useLeague } from "@/lib/store";
import { calculatePlayerStats } from "@/lib/stats";
import { rewardCatalog, statusLabel, type Reward } from "@/lib/rewards";

export default function RewardsPage() {
  const {players,matches,rewards=[],rewardCatalog:enabled=[],rewardsReady}=useLeague();
  const [reveal,setReveal]=useState<Reward|null>(null),[player,setPlayer]=useState(""),[status,setStatus]=useState(""),[kind,setKind]=useState("");
  const stats=calculatePlayerStats(players,matches).sort((a,b)=>b.currentWinStreak-a.currentWinStreak||a.rank-b.rank);
  const pool=rewardCatalog.filter(d=>enabled.some(r=>r.key===d.key&&r.enabled));
  const available=rewards.filter(r=>r.status==="available"), active=rewards.filter(r=>["pending_configuration","active"].includes(r.status));
  const history=rewards.filter(r=>(!player||r.player_id===player)&&(!status||r.status===status)&&(!kind||r.reward_key===kind)).sort((a,b)=>Date.parse(b.earned_at)-Date.parse(a.earned_at)||a.id.localeCompare(b.id));
  return <><PageHeader eyebrow="Fortune favors a streak" title="Rewards" description="Three consecutive wins unlock one roll. Every enabled reward has the same chance. Some gifts come with a price."/>
    <section className="panel reward-rules"><div><span className="eyebrow">The pact</span><h2>3 WINS → 1 REWARD ROLL</h2></div><p>One roll per uninterrupted streak. Wins 4, 5 and 6 do not grant more. After a loss, a new three-win streak can qualify. Rolls are final; house rules apply to the next newly recorded game with the owner and all required targets.</p></section>
    {!rewardsReady&&<p className="alert" role="status">Rewards are not installed in this league yet. The administrator must review and manually apply migration <code>202610040001_reward_system.sql</code>. No historical rolls will be backfilled.</p>}
    {reveal&&<RewardReveal key={reveal.id} reward={reveal} onClose={()=>setReveal(null)}/>}
    <div className="section-row"><h2 className="section-title">Available Rolls</h2><span className="badge">{available.length} unlocked</span></div>
    <div className="reward-grid">{available.map(r=><RewardCard key={r.id} reward={r} onRolled={setReveal}/>)}</div>{!available.length&&<p className="empty">No unused rolls. Win three in a row to break the seal.</p>}
    <div className="section-row"><h2 className="section-title">Active Rewards</h2></div><RewardWarnings/>
    <div className="reward-grid">{active.map(r=><RewardCard key={r.id} reward={r}/>)}</div>{!active.length&&<p className="empty">No active or pending rewards.</p>}
    <div className="section-row"><h2 className="section-title">Current Streaks</h2></div>
    <div className="reward-streaks">{stats.map(s=><Link key={s.player.id} href={"/players/"+s.player.id} className={"panel "+(s.currentWinStreak===2?"reward-near":"")}><strong>{s.player.nickname}</strong><b>{s.currentWinStreak}W</b><small>{s.currentWinStreak===2?"One more win for a Reward Roll":s.currentWinStreak>=3?"Streak continues · no repeat roll":"Consecutive wins"}</small></Link>)}</div>
    <div className="section-row"><h2 className="section-title">Reward Pool</h2><span className="badge">{pool.length} rewards · Equal odds</span></div>
    <p className="muted">Every enabled reward has the same chance{pool.length?`: 1 / ${pool.length} (${(100/pool.length).toFixed(2)}%).`:"."}</p>
    <div className="reward-grid">{pool.map(d=><article className="panel reward-pool-card" key={d.key}><span className="reward-icon" aria-hidden="true">{d.icon}</span><h3>{d.name}</h3><p>{d.description}</p></article>)}</div>
    <div className="section-row"><h2 className="section-title">Reward History</h2><span className="muted">Newest first · {history.length} records</span></div>
    <div className="filters reward-filters"><label>Owner<select value={player} onChange={e=>setPlayer(e.target.value)}><option value="">All players</option>{players.map(p=><option key={p.id} value={p.id}>{p.nickname}</option>)}</select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(statusLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Reward<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">All rewards</option>{rewardCatalog.map(d=><option key={d.key} value={d.key}>{d.name}</option>)}</select></label></div>
    <div className="reward-grid">{history.map(r=><RewardCard key={r.id} reward={r} history/>)}</div>{!history.length&&<p className="empty">No reward history matches these filters.</p>}
  </>;
}
