"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLeague } from "@/lib/store";
import { LobbyMatch, MatchBan, Team } from "@/lib/types";
import { validateMatch } from "@/lib/stats";
import { OpenDotaImport } from "./opendota-import";
import { existingDotaMatch } from "@/lib/opendota";
import { HeroSelector } from "./hero-ui";
import { Shield } from "./icons";

function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function MatchForm({ match: initialMatch }: { match?: LobbyMatch }) {
  // Keep the edit version with the draft so concurrent edits still fail safely.
  const [match] = useState(initialMatch);
  const store = useLeague(), router = useRouter();
  const [radiant, setRadiant] = useState(match?.participants.filter(p => p.team === "radiant").map(p => p.playerId) ?? Array<string>(5).fill(""));
  const [dire, setDire] = useState(match?.participants.filter(p => p.team === "dire").map(p => p.playerId) ?? Array<string>(5).fill(""));
  const [recordHeroes, setRecordHeroes] = useState(!!match?.participants.some(p => p.heroId != null));
  const [heroSlots, setHeroSlots] = useState<Record<Team, (number | undefined)[]>>(() => ({
    radiant: match?.participants.filter(p => p.team === "radiant").map(p => p.heroId ?? undefined) ?? Array(5).fill(undefined),
    dire: match?.participants.filter(p => p.team === "dire").map(p => p.heroId ?? undefined) ?? Array(5).fill(undefined),
  }));
  const [bans, setBans] = useState<MatchBan[]>(match?.bans ?? []);
  const [winner, setWinner] = useState<Team | "">(match?.winner ?? "");
  const [mvp, setMvp] = useState(match?.mvpPlayerId ?? "");
  const [runnerUpMvp, setRunnerUpMvp] = useState(match?.runnerUpMvpPlayerId ?? "");
  const [rs, setRs] = useState(match?.radiantScore?.toString() ?? "");
  const [ds, setDs] = useState(match?.direScore?.toString() ?? "");
  const [duration, setDuration] = useState(match?.durationMinutes?.toString() ?? "");
  const [dotaId, setDotaId] = useState(match?.dotaMatchId ?? "");
  const [importedDate, setImportedDate] = useState<string>();
  const [importKey, setImportKey] = useState(0);
  const [date, setDate] = useState(match ? localDate(match.playedAt) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false), errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!store.hasSnapshot) return;
    const ids = new Set(store.players.map(p => p.id));
    const prune = (list: string[]) => list.some(id => id && !ids.has(id))
      ? list.map(id => ids.has(id) ? id : "") : list;
    setRadiant(prune); setDire(prune);
    setMvp(id => ids.has(id) ? id : "");
    setRunnerUpMvp(id => ids.has(id) ? id : "");
  }, [store.players, store.hasSnapshot]);
  function clearDraft() {
    setRecordHeroes(false); setHeroSlots({radiant:Array(5).fill(undefined),dire:Array(5).fill(undefined)}); setBans([]);
    setRadiant(Array<string>(5).fill("")); setDire(Array<string>(5).fill(""));
    setWinner(""); setMvp(""); setRunnerUpMvp(""); setRs(""); setDs(""); setDuration("");
    setDotaId(""); setDate(""); setImportedDate(undefined); setImportKey(key => key + 1); setError("");
  }
  const selected = [...radiant, ...dire].filter(Boolean);
  const winningIds = winner ? (winner === "radiant" ? radiant : dire) : [];
  const losingIds = winner ? (winner === "radiant" ? dire : radiant) : [];
  function changeWinner(next: Team | "") {
    setWinner(next);
    const winners = next ? (next === "radiant" ? radiant : dire) : [];
    const losers = next ? (next === "radiant" ? dire : radiant) : [];
    setMvp(id => winners.includes(id) ? id : "");
    setRunnerUpMvp(id => losers.includes(id) ? id : "");
  }
  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  function setSlot(team: Team, index: number, value: string) {
    const old = (team === "radiant" ? radiant : dire)[index];
    (team === "radiant" ? setRadiant : setDire)(list => list.map((id, i) => i === index ? value : id));
    if (mvp === old && old !== value) setMvp("");
    if (runnerUpMvp === old && old !== value) setRunnerUpMvp("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    if (Array.from(e.currentTarget.elements).some(el => el instanceof HTMLInputElement && el.validity.badInput)) return fail("Complete the invalid number or date field, or clear it if optional.");
    const submittedDate = String(new FormData(e.currentTarget).get("playedAt") ?? "");
    if (!winner) return fail("Choose Radiant or Dire as the winner.");
    if (submittedDate && !Number.isFinite(new Date(submittedDate).getTime())) return fail("Enter a valid played date and time.");
    if (existingDotaMatch(store.matches, dotaId, match?.id)) return fail("This Dota match has already been imported.");
    if (recordHeroes && [...heroSlots.radiant, ...heroSlots.dire].some(id => id === undefined)) return fail("Record all ten participant heroes, or turn off Record Heroes.");
    const id = match?.id ?? crypto.randomUUID();
    const data: LobbyMatch = {
      ...match, id,
      playedAt: importedDate && submittedDate === localDate(importedDate) ? importedDate : match && submittedDate === localDate(match.playedAt) ? match.playedAt : submittedDate ? new Date(submittedDate).toISOString() : match?.playedAt ?? new Date().toISOString(),
      winner, bans,
      participants: (["radiant", "dire"] as const).flatMap(team =>
        (team === "radiant" ? radiant : dire).map((playerId, i) => ({
          ...match?.participants.find(p => p.playerId === playerId), playerId, team, heroId: recordHeroes ? heroSlots[team][i] : null,
        }))),
      radiantScore: rs.trim() ? Number(rs) : undefined,
      direScore: ds.trim() ? Number(ds) : undefined,
      durationMinutes: duration.trim() ? Number(duration) : undefined,
      mvpPlayerId: mvp || undefined,
      runnerUpMvpPlayerId: runnerUpMvp || undefined,
      dotaMatchId: dotaId.trim() || undefined,
    };
    const issue = validateMatch(data, store.players);
    if (issue) return fail(issue);
    submitting.current = true; setSaving(true);
    const result = await (match ? store.updateMatch(data) : store.addMatch(data));
    if (result) {
      submitting.current = false; setSaving(false); return fail(result);
    }
    clearDraft();
    router.push("/matches/" + id);
  }
  return <>
    {!match && <OpenDotaImport key={importKey} disabled={saving} onApply={(data, ids) => {
      setRecordHeroes(data.participants.some(p => p.heroId != null));
      setHeroSlots({radiant:data.participants.slice(0,5).map(p=>p.heroId),dire:data.participants.slice(5).map(p=>p.heroId)});
      setBans(data.bans ?? []);
      setRadiant(ids.slice(0, 5)); setDire(ids.slice(5)); setWinner(data.winner);
      setRs(data.radiantScore?.toString() ?? ""); setDs(data.direScore?.toString() ?? "");
      setDuration(data.durationMinutes?.toString() ?? ""); setDate(data.playedAt ? localDate(data.playedAt) : "");
      setImportedDate(data.playedAt); setDotaId(data.dotaMatchId); setMvp(""); setRunnerUpMvp(""); setError("");
    }}/>}
    <form onSubmit={submit} noValidate>
    {store.players.length < 10 && <div className="alert">Add at least ten players before recording a match. <Link href="/players">Manage players</Link></div>}
    <section className="panel" style={{marginBottom:18}}><label className="hero-toggle"><input id="record-heroes" type="checkbox" checked={recordHeroes} onChange={e=>setRecordHeroes(e.target.checked)}/> Record Heroes</label><p className="muted">Optional. When enabled, select ten different heroes. Turning this off removes played heroes from the saved match; bans remain separate.</p></section>
    <div className="grid two-col">{(["radiant", "dire"] as const).map(team =>
      <section key={team} className={"panel team-panel " + (team === "dire" ? "dire-panel" : "")}>
        <div className="inline-player"><Shield color={team === "radiant" ? "#65a18d" : "#c95255"}/><div><div className="eyebrow">{team}</div><h2 style={{margin:0}}>Select five · {(team === "radiant" ? radiant : dire).filter(Boolean).length}/5</h2></div></div>
        <div className="select-list" style={{marginTop:20}}>{(team === "radiant" ? radiant : dire).map((v, i) =>
          <div className="field" key={i}><label htmlFor={team + i}>{team} slot {i + 1}</label>
            <select id={team + i} value={v} onChange={e => setSlot(team, i, e.target.value)}>
              <option value="">Choose player…</option>{store.players.map(p =>
                <option key={p.id} value={p.id} disabled={selected.includes(p.id) && v !== p.id}>{p.nickname} · {p.name}</option>)}
            </select>
            {recordHeroes && <HeroSelector id={team+"-hero-"+i} label={team+" slot "+(i+1)+" hero"} value={heroSlots[team][i]} onChange={value=>setHeroSlots(previous=>({...previous,[team]:previous[team].map((h,n)=>n===i?value:h)}))}/>}
          </div>)}</div>
      </section>)}</div>
    <section className="panel" style={{marginTop:18}}><h2>Draft / Bans (optional)</h2><div className="grid two-col">{(["radiant","dire"] as const).map(team=><div key={team}><h3 className="eyebrow">{team} bans</h3>{bans.map((ban,i)=>ban.team===team&&<div key={i} className="ban-row"><HeroSelector id={"ban-"+i} label={team+" ban "+(i+1)} value={ban.heroId||undefined} onChange={value=>setBans(previous=>previous.map((b,n)=>n===i?{...b,heroId:value??0}:b))}/><button type="button" className="filter" aria-label={"Remove ban "+(i+1)} onClick={()=>setBans(previous=>previous.filter((_,n)=>n!==i))}>Remove</button></div>)}<button type="button" className="button secondary" onClick={()=>setBans(previous=>[...previous,{team,heroId:0}])}>Add {team} ban</button></div>)}</div></section>
    <section className="panel" style={{marginTop:18}}><h2>Battle details</h2><div className="grid two-col">
      <div className="field"><label htmlFor="winner">Winner *</label><select id="winner" value={winner} onChange={e => changeWinner(e.target.value as Team | "")}><option value="">Choose the winner…</option><option value="radiant">Radiant</option><option value="dire">Dire</option></select></div>
      <div className="field"><label htmlFor="mvp">MVP (optional)</label><select id="mvp" disabled={!winner} value={mvp} onChange={e => setMvp(e.target.value)}><option value="">No MVP selected</option>{mvp && !winningIds.includes(mvp) && <option value={mvp} disabled>Previous MVP · choose a winning player or clear</option>}{store.players.filter(p => winningIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.nickname} · {p.name}</option>)}</select></div>
      <div className="field"><label htmlFor="runner-up-mvp">Runner-up MVP (optional)</label><select id="runner-up-mvp" disabled={!winner} value={runnerUpMvp} onChange={e => setRunnerUpMvp(e.target.value)}><option value="">No Runner-up MVP selected</option>{store.players.filter(p => losingIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.nickname} · {p.name}</option>)}</select><small className="muted">{winner ? "MVP recognizes the winner; Runner-up MVP recognizes the losing team." : "Choose the winner to select awards."}</small></div>
      <div className="field"><label htmlFor="radiant-score">Radiant score (optional)</label><input id="radiant-score" type="number" min="0" step="1" value={rs} onChange={e => setRs(e.target.value)}/></div>
      <div className="field"><label htmlFor="dire-score">Dire score (optional)</label><input id="dire-score" type="number" min="0" step="1" value={ds} onChange={e => setDs(e.target.value)}/></div>
      <div className="field"><label htmlFor="duration">Duration in minutes (optional)</label><input id="duration" type="number" min="0.01" step="any" value={duration} onChange={e => setDuration(e.target.value)}/></div>
      <div className="field"><label htmlFor="dota-id">Dota Match ID (optional)</label><input id="dota-id" inputMode="numeric" value={dotaId} onChange={e => setDotaId(e.target.value)}/></div>
      <div className="field"><label htmlFor="played-at">Played date/time (optional, local time)</label><input id="played-at" name="playedAt" type="datetime-local" value={date} onChange={e => setDate(e.target.value)}/><small className="muted">{match ? "Leave blank to keep the original date." : "Leave blank to use the time you save this match."}</small></div>
    </div>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="alert">{error}</div>}
    <div className="filters"><button className="button" disabled={saving || store.players.length < 10}>{saving ? "Saving…" : match ? "Save changes" : "Save Match"}</button><button type="button" className="button secondary" disabled={saving} onClick={clearDraft}>Clear form</button><Link className="button secondary" href={match ? "/matches/" + match.id : "/matches"}>Cancel</Link></div>
    <p className="muted" style={{fontSize:12}}>Statistics are recalculated from match history after every change.</p>
    </section>
  </form></>;
}



