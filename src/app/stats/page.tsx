"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useLeague } from "@/lib/store";
import { calculatePlayerStats, leagueRecords, MIN_GAMES_FOR_RATE } from "@/lib/stats";
import { Crown, Flame, Medal, Star, Swords } from "@/components/icons";
const icons = [Crown, Medal, Flame, Star, Swords, Medal];
export default function Page() {
  const {players,matches}=useLeague(), records=leagueRecords(calculatePlayerStats(players,matches));
  const durations=matches.flatMap(m=>m.durationMinutes===undefined?[]:[m.durationMinutes]);
  return <><PageHeader eyebrow="Hall of conquest" title="Lobby Records" description={`The marks to beat. Win-rate records require at least ${MIN_GAMES_FOR_RATE} games. Tied record holders share the honor.`}/>
    <div className="grid records">{records.map((r,i)=>{const Icon=icons[i];return <article className={`panel record ${i===0?"record-featured":""}`} key={r.key}><Icon color={r.key==="runnerUpMvpCount"?"#afb7c2":"#d5644f"}/><p className="muted">{r.label}</p><h2 style={{fontSize:32,margin:"5px 0"}}>{r.value===null?"—":r.key==="winRate"?r.value.toFixed(1)+"%":r.key==="bestWinStreak"?r.value+"W":r.value}</h2>{r.holders.length?<><Link className="record-holder" href={"/players/"+r.holders[0].player.id}>{r.holders[0].player.nickname}<span className="muted profile-real-name">{r.holders[0].player.name}</span></Link>{r.holders.length>1&&<details style={{marginTop:12}}><summary className="muted">Shared with {r.holders.length-1} {r.holders.length===2?"player":"players"}</summary>{r.holders.slice(1).map(s=><Link key={s.player.id} className="record-holder" href={"/players/"+s.player.id}>{s.player.nickname}</Link>)}</details>}</>:<span className="muted">No qualifying player</span>}</article>})}</div>
    <div className="section-row"><h2 className="section-title">League Pulse</h2></div><div className="grid stats-grid">
      <article className="stat-card"><span>Matches recorded</span><strong>{matches.length}</strong></article>
      <article className="stat-card"><span>Average recorded duration</span><strong>{durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)+"m":"—"}</strong><small className="muted">{durations.length} matches with duration</small></article>
      <article className="stat-card radiant-stat"><span>Radiant wins</span><strong>{matches.filter(m=>m.winner==="radiant").length}</strong></article>
      <article className="stat-card dire-stat"><span>Dire wins</span><strong>{matches.filter(m=>m.winner==="dire").length}</strong></article>
    </div></>;
}

