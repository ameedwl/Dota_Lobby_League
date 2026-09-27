"use client";
import { useState } from "react";
import { heroes, heroName, heroStatistics, isKnownHero, playerHeroStatistics } from "@/lib/heroes";
import type { LobbyMatch } from "@/lib/types";

export function HeroLabel({ id }: { id?: number | null }) {
  return id ? <span className="hero-label">{heroName(id)}</span> : null;
}
export function HeroSelector({ id, value, onChange, label }: { id: string; value?: number; onChange: (value?: number) => void; label: string }) {
  const [search, setSearch] = useState("");
  const results = heroes.filter(h => h.name.toLowerCase().includes(search.toLowerCase().trim()) || h.id === value);
  return <div className="field hero-selector"><label htmlFor={id}>{label}</label>
    <input id={id + "-search"} type="search" aria-label={"Search " + label} placeholder="Search heroes…" value={search} onChange={e => setSearch(e.target.value)}/>
    <select id={id} value={value ?? ""} onChange={e => { onChange(e.target.value ? Number(e.target.value) : undefined); setSearch(""); }}>
      <option value="">Select hero…</option>
      {value && !isKnownHero(value) && <option value={value}>{heroName(value)} · catalog update needed</option>}
      {results.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
    </select>{!results.length && <small className="muted">No matching heroes.</small>}
  </div>;
}
export function MatchBans({ match }: { match: LobbyMatch }) {
  return match.bans?.length ? <section className="panel" style={{ marginTop: 20 }}><h2>Draft / Bans</h2><div className="grid two-col">{(["radiant", "dire"] as const).map(team => <div key={team}><h3 className="eyebrow">{team} bans</h3><div className="filters">{match.bans!.filter(b => b.team === team).map(b => <HeroLabel key={b.heroId} id={b.heroId}/>)}{!match.bans!.some(b => b.team === team) && <span className="muted">None recorded</span>}</div></div>)}</div></section> : null;
}
export function LeagueHeroStats({ matches }: { matches: LobbyMatch[] }) {
  const stats = heroStatistics(matches);
  return <><div className="section-row"><h2 className="section-title">Hero Statistics</h2></div><p className="muted">Hero stats based on {stats.heroMatches} matches with complete hero data. Ban stats based on {stats.banMatches} matches with recorded bans.</p>
    <div className="grid two-col">{(["picks", "bans"] as const).map(kind => <section className="panel" key={kind}><h2>{kind === "picks" ? "Most Picked Heroes" : "Most Banned Heroes"}</h2>{stats[kind].length ? <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Hero</th><th>{kind === "picks" ? "Picks" : "Bans"}</th></tr></thead><tbody>{stats[kind].map((row, i) => <tr key={row.heroId}><td>{i + 1}</td><td><HeroLabel id={row.heroId}/></td><td>{row.count}</td></tr>)}</tbody></table></div> : <p className="muted">No {kind} recorded yet.</p>}</section>)}</div></>;
}
export function PlayerHeroStats({ id, matches }: { id: string; matches: LobbyMatch[] }) {
  const stats = playerHeroStatistics(id, matches);
  return <section className="panel" style={{ marginTop: 20 }}><h2>Hero Stats</h2><p className="muted">Hero data available for {stats.coveredGames} of this player’s {stats.totalGames} matches.</p>{stats.rows.length ? <div className="table-wrap"><table><thead><tr><th>Hero</th><th>Games</th><th>Wins</th><th>Losses</th><th>Win Rate</th></tr></thead><tbody>{stats.rows.map(row => <tr key={row.heroId}><td><HeroLabel id={row.heroId}/></td><td>{row.games}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.winRate.toFixed(1)}%</td></tr>)}</tbody></table></div> : <p className="muted">No complete hero data recorded yet.</p>}</section>;
}
