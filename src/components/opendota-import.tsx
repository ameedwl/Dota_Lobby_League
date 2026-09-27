"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HeroLabel } from "./hero-ui";
import { heroName } from "@/lib/heroes";
import { useAuth } from "@/lib/auth";
import { useLeague } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { existingDotaMatch, ImportedMatch, mapImportedPlayers, normalizeMatchId } from "@/lib/opendota";

export function OpenDotaImport({ onApply, disabled: saving }: { onApply: (match: ImportedMatch, ids: string[]) => void; disabled: boolean }) {
  const { isAdmin, ready, error: authError } = useAuth(), store = useLeague();
  const [id, setId] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportedMatch | null>(null), [ids, setIds] = useState<string[]>([]);
  const disabled = saving || !!authError;
  const request = useRef<AbortController | null>(null), active = useRef(false);
  const duplicate = existingDotaMatch(store.matches, preview?.dotaMatchId ?? id);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (store.hasSnapshot) setIds(previous => previous.map(value => store.players.some(p => p.id === value) ? value : ""));
  }, [store.players, store.hasSnapshot]);
  if (!isAdmin || !ready) return null;
  async function fetchMatch() {
    if (active.current || disabled) return;
    setError("");
    let normalized: string;
    try { normalized = normalizeMatchId(id); } catch (e) { setError((e as Error).message); return; }
    if (existingDotaMatch(store.matches, normalized)) { setError("This Dota match has already been imported."); return; }
    active.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const session = await getSupabase()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in as the league administrator to import a match.");
      const response = await fetch("/api/opendota/match/" + normalized, { headers: { Authorization: "Bearer " + token }, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not retrieve this match from OpenDota.");
      if (!controller.signal.aborted) { setPreview(data); setIds(mapImportedPlayers(data, store.players)); }
    } catch (e) {
      setError(controller.signal.aborted ? "The request timed out or was cancelled. You can still enter the match manually below." : (e as Error).message + " You can still enter it manually below.");
    } finally { clearTimeout(timeout); active.current = false; setBusy(false); }
  }
  function apply() {
    if (!preview || busy || disabled) return;
    if (existingDotaMatch(store.matches, preview.dotaMatchId)) return setError("This Dota match has already been imported.");
    if (ids.length !== 10 || ids.some(value => !store.players.some(p => p.id === value)) || new Set(ids).size !== 10)
      return setError("Assign ten different existing players before using this match data.");
    onApply(preview, ids); setPreview(null); setId(""); setError("");
  }
  return <section className="panel" style={{ marginBottom: 18 }} aria-label="Import Dota match">
    <div className="eyebrow">Import Dota match</div><h2>Fill from OpenDota</h2>
    <p className="muted">Fetch and review a match, or enter it manually below. Nothing is saved until you press Save Match.</p>
    <div className="field"><label htmlFor="import-dota-id">Dota Match ID</label><input id="import-dota-id" inputMode="numeric" value={id} disabled={busy || disabled} onChange={e => { setId(e.target.value); setPreview(null); setError(""); }}/></div>
    <button type="button" className="button secondary" disabled={busy || disabled} onClick={fetchMatch}>{busy ? "Fetching match from OpenDota..." : "Fetch Match"}</button>
    {error && <p className="alert" role="alert">{error}</p>}
    {duplicate && <p className="alert" role="alert">This Dota match has already been imported. <Link href={"/matches/" + duplicate.id}>Open existing match</Link></p>}
    {preview && <div style={{ marginTop: 20 }}>
      <h3>Dota match found · {preview.dotaMatchId}</h3>
      <p>Radiant {preview.radiantScore ?? "—"} — {preview.direScore ?? "—"} Dire · {preview.winner === "radiant" ? "Radiant" : "Dire"} Victory</p>
      <p className="muted">Duration: {preview.durationMinutes ? Math.floor(preview.durationMinutes) + ":" + String(Math.round(preview.durationMinutes * 60) % 60).padStart(2, "0") : "Unavailable"} · Played: {preview.playedAt ? new Date(preview.playedAt).toLocaleString() : "Unavailable"}</p>
      <div className="grid two-col">{(["radiant", "dire"] as const).map(team => <div key={team}><h3 className="eyebrow">{team}</h3>{preview.participants.map((slot, i) => slot.team === team && <div className="field" key={slot.slot}>
        <label htmlFor={"import-slot-" + i}>{ids[i] ? "✓ " + (store.players.find(p => p.id === ids[i])?.nickname ?? "") : slot.accountId ? "Unmapped Dota player" : "Anonymous Dota player"} · {slot.accountId ? "Account ID: " + slot.accountId : "Account ID unavailable"}</label>
        <HeroLabel id={slot.heroId}/>
        <select id={"import-slot-" + i} value={ids[i] ?? ""} disabled={busy || disabled} onChange={e => setIds(previous => previous.map((value, n) => n === i ? e.target.value : value))}>
          <option value="">Select Lobby Legends player…</option>{store.players.map(p => <option key={p.id} value={p.id} disabled={ids.includes(p.id) && ids[i] !== p.id}>{p.nickname} · {p.name}</option>)}
        </select>
      </div>)}</div>)}</div>
      {!!preview.bans?.length && <p className="muted">Bans: {preview.bans.map(b=>b.team+" · "+heroName(b.heroId)).join(", ")}</p>}
      <p className="muted">Use this match data? This replaces both teams, played heroes, bans, winner, scores, duration, date and Dota Match ID in your draft. Both awards will be cleared for you to select manually. Missing optional details stay blank. Assignments here apply to this match only; manage permanent account IDs on the Players page.</p>
      <div className="filters"><button type="button" className="button" disabled={busy || disabled || !!duplicate} onClick={apply}>Use this match data</button><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => { setPreview(null); setError(""); }}>Discard preview</button></div>
    </div>}
  </section>;
}
