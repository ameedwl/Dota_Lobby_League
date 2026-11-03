"use client";

import {createContext, useCallback, useContext, useEffect, useRef, useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useBirthdayEvent} from "./birthday-event";
import {TributeForest} from "./tribute-forest";
import {PlayerProfileLink} from "@/components/ui";
import {isGlobalTributeActive, tributeCountdown, tributeForMatch, tributeForPath, tributeSeenKey, type MatchTribute} from "@/lib/match-tributes";

type AudioStatus = "checking" | "ready" | "unavailable";
type TributeContext = {
  tribute?: MatchTribute; globalActive: boolean; specialMatch: boolean; intro: boolean;
  playing: boolean; muted: boolean; audioStatus: AudioStatus; audioBlocked: boolean;
  play: () => void; pause: () => void; stop: () => void; toggleMute: () => void;
  replay: () => void; retry: () => void;
};
const noop = () => {};
const Context = createContext<TributeContext>({globalActive:false, specialMatch:false, intro:false, playing:false, muted:false, audioStatus:"checking", audioBlocked:false, play:noop, pause:noop, stop:noop, toggleMute:noop, replay:noop, retry:noop});
export const useMatchTribute = () => useContext(Context);

function Inscription({tribute}: {tribute: MatchTribute}) {
  return <div className="tribute-inscription"><span>{tribute.inscription.winner}</span><strong>{tribute.inscription.radiant}<i>—</i>{tribute.inscription.dire}</strong><small>{tribute.inscription.duration} <b>·</b> {tribute.inscription.mode}</small></div>;
}

function AnthemControls() {
  const e = useMatchTribute();
  return <div className="tribute-audio-controls" aria-label="Match anthem controls">
    <button className="tribute-control tribute-play" disabled={e.audioStatus !== "ready"} onClick={e.playing ? e.pause : e.play}>{e.playing ? "Pause" : "PLAY MATCH ANTHEM"}</button>
    <button className="tribute-control" aria-pressed={e.muted} onClick={e.toggleMute}>{e.muted ? "Unmute" : "Mute"}</button>
    <button className="tribute-control" onClick={e.stop}>Stop</button>
    {e.audioStatus === "checking" && <small role="status">Checking anthem…</small>}
    {e.audioStatus === "unavailable" && <><small role="status">Anthem unavailable · the legend continues in silence.</small><button className="tribute-control" onClick={e.retry}>Check anthem again</button></>}
    {e.audioBlocked && e.audioStatus === "ready" && <small role="status">Playback was blocked. Press PLAY MATCH ANTHEM to try again.</small>}
  </div>;
}

export function MatchTributeProvider({children}: {children: React.ReactNode}) {
  const pathname = usePathname() ?? "/";
  const birthday = useBirthdayEvent();
  const [now, setNow] = useState<number | null>(null);
  const [intro, setIntro] = useState(false), [entered, setEntered] = useState(false), [panel, setPanel] = useState(false);
  const [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false);
  const [audioSession, setAudioSession] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("checking"), [audioBlocked, setAudioBlocked] = useState(false), [retryCount, setRetryCount] = useState(0);
  const [reduced, setReduced] = useState(false);
  const audio = useRef<HTMLAudioElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0);
  const playbackWanted = useRef(false);
  const attempted = useRef(new Set<string>()), previousPath = useRef(pathname);
  const tribute = now === null ? undefined : tributeForPath(pathname, now);
  const globalActive = !!tribute && now !== null && isGlobalTributeActive(now, tribute);
  const specialMatch = !!tribute && pathname === `/matches/${tribute.matchId}`;
  const scope = globalActive ? "global" : "archive";
  const seenKey = tribute ? tributeSeenKey(tribute, scope) : "";

  const clearFinish = useCallback(() => { if (finish.current) clearTimeout(finish.current); finish.current = null; }, []);
  const stop = useCallback(() => {
    generation.current++;
    playbackWanted.current = false;
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    setPlaying(false);
    setAudioSession(false);
    setAudioBlocked(false);
  }, []);
  const remember = useCallback(() => {
    if (!tribute) return;
    attempted.current.add(seenKey);
    try {
      localStorage.setItem(seenKey, "1");
      if (specialMatch) localStorage.setItem(tributeSeenKey(tribute, "archive"), "1");
    } catch { /* Private/storage-restricted sessions still keep in-memory seen state. */ }
  }, [seenKey, specialMatch, tribute]);
  const dismiss = useCallback(() => { remember(); clearFinish(); stop(); setIntro(false); setEntered(false); }, [remember, clearFinish, stop]);
  const play = useCallback(async () => {
    setAudioSession(true);
    const element = audio.current;
    if (!element || audioStatus !== "ready") return;
    const token = ++generation.current;
    playbackWanted.current = true;
    setAudioBlocked(false);
    try {
      // Called directly by a click, before any await: works with browser gesture policies.
      await element.play();
      if (token !== generation.current) { if (!playbackWanted.current) element.pause(); return; }
      setPlaying(true);
    } catch {
      if (token === generation.current) { playbackWanted.current = false; setPlaying(false); setAudioBlocked(true); }
    }
  }, [audioStatus]);
  const pause = useCallback(() => { generation.current++; playbackWanted.current = false; audio.current?.pause(); setPlaying(false); }, []);
  const replay = useCallback(() => { if (!tribute || birthday.intro) return; clearFinish(); stop(); setPanel(false); setEntered(false); setIntro(true); }, [tribute, birthday.intro, clearFinish, stop]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    motion(); media.addEventListener("change", motion);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); media.removeEventListener("change", motion); };
  }, []);

  useEffect(() => {
    if (!tribute || birthday.intro) return;
    setAudioStatus("checking");
    setAudioBlocked(false);
    const controller = new AbortController();
    void fetch(tribute.anthem, {method:"HEAD", signal:controller.signal}).then(response => {
      if (!controller.signal.aborted) setAudioStatus(response.ok && (response.headers.get("content-type") ?? "").startsWith("audio/") ? "ready" : "unavailable");
    }).catch(() => { if (!controller.signal.aborted) setAudioStatus("unavailable"); });
    return () => controller.abort();
  }, [tribute, retryCount, birthday.intro]);

  useEffect(() => {
    if (!tribute) { clearFinish(); stop(); setIntro(false); setEntered(false); setPanel(false); return; }
    if (birthday.intro) { clearFinish(); stop(); setIntro(false); return; }
    if (attempted.current.has(seenKey)) return;
    attempted.current.add(seenKey);
    let seen = false;
    try { seen = localStorage.getItem(seenKey) === "1"; } catch { /* See remember(). */ }
    if (!seen) { setEntered(false); setIntro(true); }
  }, [tribute, seenKey, birthday.intro, clearFinish, stop]);

  useEffect(() => {
    if (!tribute || !globalActive || !specialMatch) return;
    // Viewing the archive during the global celebration counts as an archive visit.
    // Crossing the deadline on this page must not open another entrance over a song.
    const key = tributeSeenKey(tribute, "archive");
    attempted.current.add(key);
    try { localStorage.setItem(key, "1"); } catch { /* In-memory guard remains. */ }
  }, [tribute, globalActive, specialMatch]);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      // User navigation never launches a second entrance or an invisible pending play.
      if (intro) dismiss();
    }
  }, [pathname, intro, dismiss]);

  useEffect(() => {
    if (!intro || !tribute) return;
    const element = dialog.current;
    if (!element) return;
    const focus = document.activeElement as HTMLElement | null;
    try { element.showModal(); } catch { setIntro(false); return; }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus(); };
  }, [intro, tribute]);

  useEffect(() => {
    const element = audio.current;
    const invalidate = () => { generation.current++; playbackWanted.current = false; };
    return () => { invalidate(); clearFinish(); element?.pause(); };
  }, [tribute, clearFinish]);

  function begin() {
    if (entered) return;
    remember(); setEntered(true);
    void play();
    finish.current = setTimeout(() => { finish.current = null; setIntro(false); setEntered(false); }, reduced ? 200 : 2400);
  }

  const context: TributeContext = {tribute, globalActive, specialMatch, intro: intro && !!tribute, playing, muted, audioStatus, audioBlocked,
    play: () => { void play(); }, pause, stop, toggleMute: () => setMuted(value => !value), replay, retry: () => setRetryCount(value => value + 1)};

  return <Context.Provider value={context}><div className={`tribute-shell${tribute ? " tribute-theme" : ""}`} data-tribute={tribute?.theme}>
    {tribute && <>
      <div className="tribute-environment" hidden={intro} aria-hidden="true">
        <TributeForest scene={specialMatch ? "archive" : "global"}/>
      </div>
      <audio ref={audio} src={audioStatus === "ready" ? tribute.anthem : undefined} preload="none" muted={muted} onEnded={() => setPlaying(false)} onError={() => { stop(); setAudioStatus("unavailable"); }} />
      {globalActive && <div className="tribute-banner"><button onClick={() => setPanel(value => !value)} aria-expanded={panel} aria-controls="tribute-event-panel"><span>◆ {tribute.title}</span><small>MATCH TRIBUTE <i>·</i> {tributeCountdown(now!, tribute)} REMAINING</small></button><Link href={`/matches/${tribute.matchId}`}>Visit the match <span aria-hidden="true">↗</span></Link></div>}
      {globalActive && panel && <section id="tribute-event-panel" className="tribute-event-panel" aria-label="Match tribute event"><div><span className="tribute-kicker">A match becomes a legend</span><h2>{tribute.title}</h2><p>{tribute.inscription.winner} · {tribute.inscription.radiant} — {tribute.inscription.dire} · {tribute.inscription.duration} · {tribute.inscription.mode}</p></div><AnthemControls/><button className="tribute-control" onClick={replay}>Replay Tribute</button></section>}
      {(audioSession || audioBlocked) && !intro && !panel && <aside className="tribute-audio-dock" aria-label="Match anthem player"><span>◆ MATCH ANTHEM</span><AnthemControls/></aside>}
      {intro && <dialog ref={dialog} className={`tribute-intro${entered ? " tribute-entered" : ""}${reduced ? " tribute-reduced" : ""}`} aria-labelledby="tribute-intro-title" aria-describedby="tribute-intro-subtitle" onCancel={event => { event.preventDefault(); dismiss(); }}>
        <TributeForest scene="intro"/>
        <button className="tribute-control tribute-skip" onClick={dismiss}>Skip intro</button>
        <div className="tribute-stage"><p className="tribute-kicker tribute-studio">LOBBY LEGENDS <span>presents</span></p><Inscription tribute={tribute}/><div className="tribute-title"><p className="tribute-kicker">ETCHED INTO OUR HISTORY</p><h1 id="tribute-intro-title">{tribute.titleLines[0]}<span>{tribute.titleLines[1]}</span></h1><p id="tribute-intro-subtitle">{tribute.subtitle}</p></div><div className="tribute-entrance-controls"><button autoFocus className="tribute-enter" disabled={entered} onClick={begin}>{entered ? "THE LEGEND LIVES ON" : "ENTER THE DARK"}<span aria-hidden="true"> ↗</span></button><p>Enter to start the optional anthem. Skip to explore in silence.</p><AnthemControls/></div></div>
      </dialog>}
    </>}
    {children}
  </div></Context.Provider>;
}

export function MatchTributeCard({matchId}: {matchId?: string}) {
  const event = useMatchTribute();
  const tribute = matchId ? tributeForMatch(matchId) : event.globalActive ? event.tribute : undefined;
  if (!tribute) return null;
  const creator = tribute.anthemCreator;
  return <section className={`tribute-card${matchId ? " tribute-archive" : ""}`} aria-label={matchId ? "Match legend archive" : "Featured match tribute"}>
    <div className="tribute-card-heading"><span className="tribute-kicker">◆ {matchId ? "MATCH LEGEND ARCHIVE" : "FOR THREE NIGHTS. REMEMBERED FOREVER."}</span><h2>{tribute.titleLines[0]}<span>{tribute.titleLines[1]}</span></h2><p>{tribute.subtitle}</p><div className="tribute-card-story">The night. The last hope. The final doom.<br/><span>A warrior who lived it. A song that remembers.</span></div></div>
    <div className="tribute-card-record"><Inscription tribute={tribute}/>{!matchId && <Link className="tribute-match-link" href={`/matches/${tribute.matchId}`}>OPEN THE MATCH LEGEND <span aria-hidden="true">↗</span></Link>}<button className="tribute-control" onClick={event.replay}>Replay Tribute</button></div>
    <div className="tribute-card-footer">
      <div className="tribute-anthem-credit">
        <span>ORIGINAL MATCH ANTHEM</span>
        <p>Created by <PlayerProfileLink playerId={creator.playerId}>{creator.displayName}</PlayerProfileLink></p>
        <small>{creator.hero}{matchId && ` · ${creator.team}`} · {tribute.inscription.radiant}–{tribute.inscription.dire} Match</small>
      </div>
      <AnthemControls/>
    </div>
  </section>;
}
