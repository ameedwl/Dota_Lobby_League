import Link from "next/link";import {LobbyMatch,Player,PlayerStats} from "@/lib/types";import {CalendarDays,Clock,Crown,Star} from "./icons";
export function Avatar({player,large=false}:{player:Player;large?:boolean}){return <span className={`avatar ${large?"lg":""}`}>{player.nickname.slice(0,2)}</span>}
export function PageHeader({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="page-head"><div className="eyebrow">{eyebrow}</div><div className="section-row" style={{margin:"8px 0"}}><h1>{title}</h1>{action}</div><p>{description}</p></div>}
export function StatCard({label,value}:{label:string;value:React.ReactNode}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>}
export function FormDots({form}:{form:("W"|"L")[]}){return <div className="form" aria-label={`Recent form: ${form.join(", ") || "No matches"}`}>{form.map((x,i)=><i title={x==="W"?"Win":"Loss"} className={x==="W"?"win":"loss"} key={i}>{x}</i>)}</div>}
export function PlayerCard({stat,rank}:{stat:PlayerStats;rank:number}){return <Link href={`/players/${stat.player.id}`} className={`player-card rank-${rank}`}><span className="rank-label">0{rank}</span>{rank===1&&<div className="champion-label"><Crown size={16}/> Reigning champion</div>}<div className="inline-player"><Avatar player={stat.player}/><span><span className="player-name">{stat.player.name}</span><span className="nickname" style={{display:"block"}}>{stat.player.nickname}</span></span></div><div className="mini-stats"><span><strong>{stat.wins}</strong>Wins</span><span><strong>{stat.losses}</strong>Losses</span><span><strong>{stat.winRate.toFixed(1)}%</strong>Win rate</span></div></Link>}
export function MatchCard({match,players}:{match:LobbyMatch;players:Player[]}){const roster=(team:"radiant"|"dire")=>match.participants.filter(x=>x.team===team).map(x=>players.find(p=>p.id===x.playerId)?.nickname).join(" · ");return <Link href={`/matches/${match.id}`} className="match-card"><div className="match-meta"><span><CalendarDays size={12} style={{display:"inline",marginRight:6}}/>{new Date(match.playedAt).toLocaleDateString("en",{month:"short",day:"numeric",year:"numeric"})}</span><span>{match.durationMinutes&&<><Clock size={12} style={{display:"inline",marginRight:5}}/>{match.durationMinutes} min</>}</span></div><div className="match-main"><div className={`team ${match.winner==="radiant"?"winner":""}`}><div className="team-name">RADIANT {match.winner==="radiant"&&"— VICTORY"}</div><div className="roster">{roster("radiant")}</div></div><div className="score">{match.radiantScore??"—"} <span className="muted">:</span> {match.direScore??"—"}</div><div className={`team dire ${match.winner==="dire"?"winner":""}`}><div className="team-name">DIRE {match.winner==="dire"&&"— VICTORY"}</div><div className="roster">{roster("dire")}</div></div></div><MatchAwards match={match} players={players}/></Link>}

export function MatchAwards({match,players,detail=false}:{match:LobbyMatch;players:Player[];detail?:boolean}) {
  if(!detail&&!match.mvpPlayerId&&!match.runnerUpMvpPlayerId)return null;
  return <div className="match-awards">{([
    ["MVP",match.mvpPlayerId,false],["Runner-up MVP",match.runnerUpMvpPlayerId,true],
  ] as const).map(([label,id,runnerUp])=>{
    const player=players.find(p=>p.id===id);
    if(!player&&!detail)return null;
    const team=match.participants.find(p=>p.playerId===id)?.team;
    const outcome=team===match.winner?"Winning team":"Losing team";
    return <div key={label} className="match-award">
      <span className={runnerUp?"badge runner-up-award":"badge"}><Star size={runnerUp?10:12}/>{detail?label:runnerUp?"Runner-up":label} · {player?.nickname??"Not awarded"}</span>
      {detail&&player&&<small className="muted">{team} · {outcome}{!runnerUp&&team!==match.winner?" · Historical award":""}</small>}
    </div>;
  })}</div>;
}
