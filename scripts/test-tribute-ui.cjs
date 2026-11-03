/* eslint-disable @typescript-eslint/no-require-imports -- In-process React lifecycle regressions without a browser dependency. */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const { JSDOM } = require("jsdom");
const dom = new JSDOM('<button id="outside">Return focus here</button><div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "Event", "localStorage"]) global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
let route = "/", now = 0, reduced = false, available = true, rejectAudio = false, holdAudio = false, holdHead = false, showTributeCard = true;
let plays = 0, pauses = 0, activeWraiths = 0;
const pendingPlayback = [], pendingHeads = [], mediaListeners = new Set();
global.matchMedia = window.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) });
// JSDOM has no native dialog layout/focus algorithm. Closed dialogs are display:none
// in browsers, so React autoFocus cannot steal focus before showModal captures it.
const nativeFocus = window.HTMLElement.prototype.focus;
window.HTMLElement.prototype.focus = function (...args) { if (this.closest("dialog:not([open])")) return; nativeFocus.apply(this, args); };
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); this.querySelector("[autofocus]")?.focus(); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
window.HTMLMediaElement.prototype.play = function () {
  plays++;
  if (rejectAudio) return Promise.reject(Error("Playback blocked"));
  if (holdAudio) return new Promise(resolve => pendingPlayback.push(resolve));
  return Promise.resolve();
};
window.HTMLMediaElement.prototype.pause = function () { pauses++; };
const headResponse = () => ({ ok: available, headers: { get: () => available ? "audio/mpeg" : "text/html" } });
global.fetch = () => holdHead ? new Promise(resolve => pendingHeads.push(() => resolve(headResponse()))) : Promise.resolve(headResponse());
const realTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
const timers = new Map(), intervals = new Map(); let nextTimer = 0;
global.setTimeout = (fn, delay, ...args) => {
  if (![2400, 200].includes(delay)) return realTimeout(fn, delay, ...args);
  const id = ++nextTimer; timers.set(id, { fn, delay }); return id;
};
global.clearTimeout = id => { if (!timers.delete(id)) realClearTimeout(id); };
global.setInterval = (fn, delay) => { const id = ++nextTimer; intervals.set(id, { fn, delay }); return id; };
global.clearInterval = id => intervals.delete(id);
Date.now = () => now;
const React = require("react"), { act } = React, { createRoot } = require("react-dom/client"), { renderToString } = require("react-dom/server"), h = React.createElement;
const source = path.resolve(__dirname, "../src"), originalLoad = Module._load;
const league = { players: [], matches: [], rerollCredits: [] };
Module._load = function (id, parent, main) {
  if (id === "next/navigation") return { usePathname: () => route, useParams: () => ({ id: route.split("/")[2] }), useRouter: () => ({ push: value => { route = value; } }) };
  if (id === "next/link") return { __esModule: true, default: ({ children, ...props }) => h("a", props, children) };
  if (id === "@/lib/store") return { useLeague: () => league };
  if (id === "@/lib/auth") return { useAuth: () => ({ isAdmin: false }) };
  if (id === "@/lib/wraith-controller") return { startWraith: () => { activeWraiths++; return () => activeWraiths--; } };
  if (id.startsWith("@/")) id = path.join(source, id.slice(2));
  return originalLoad.call(this, id, parent, main);
};
for (const ext of [".ts", ".tsx"]) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
const { fortyMinutesTribute: tribute, tributeSeenKey } = require("../src/lib/match-tributes");
const { MatchTributeProvider, MatchTributeCard } = require("../src/components/events/match-tribute");
const { LobbyWraithEffect } = require("../src/components/lobby-wraith-effect");
const { MatchCard } = require("../src/components/ui");
const { default: PlayerProfile } = require("../src/app/players/[id]/page");
const { default: PlayersPage } = require("../src/app/players/page");
const start = Date.parse(tribute.globalStart), end = Date.parse(tribute.globalEnd), archiveRoute = "/matches/" + tribute.matchId;
const creator = { id: "f3e6f11d-2ae4-4669-881e-4d4ac535f45b", nickname: "TYSIOTE", name: "Martinus", createdAt: "2026-01-01T00:00:00Z" };
const other = { ...creator, id: "another-player", name: "Another player" };
const creatorRoute = "/players/" + creator.id;
const special = { id: tribute.matchId, playedAt: "2026-11-01T00:00:00Z", winner: "radiant", radiantScore: 53, direScore: 36, durationMinutes: 51 + 50 / 60, participants: [] };
league.matches = [special];
league.players = [creator, other];
let root = createRoot(document.getElementById("root"));
const tree = () => h(MatchTributeProvider, null,
  h("a", { href: "/stats", id: "normal" }, "Normal league content"),
  h("input", { id: "draft", defaultValue: "Unsaved form value" }),
  showTributeCard && h(MatchTributeCard, route === archiveRoute ? { matchId: tribute.matchId } : {}),
  route === "/players" && h(PlayersPage),
  route.startsWith("/players/") && h(PlayerProfile),
  h(MatchCard, { match: special, players: [] }),
  h(MatchCard, { match: { ...special, id: "newer-match" }, players: [] }),
  h(LobbyWraithEffect));
const settle = fn => act(async () => { fn?.(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const buttonText = button => { const copy = button.cloneNode(true); copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove()); return copy.textContent.trim(); };
const buttons = label => [...(document.querySelector("dialog[open]") ?? document).querySelectorAll("button")].filter(button => buttonText(button) === label || button.getAttribute("aria-label") === label);
const click = label => settle(() => { const button = buttons(label).find(item => !item.disabled); assert.ok(button, "Enabled button: " + label); button.click(); });
const fire = delay => settle(() => { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } });
const advance = async value => { now = value; await settle(() => { for (const timer of intervals.values()) timer.fn(); window.dispatchEvent(new Event("focus")); }); };
const navigate = async value => { route = value; await settle(() => root.render(tree())); };
const remount = async () => { await settle(() => root.unmount()); root = createRoot(document.getElementById("root")); await settle(() => root.render(tree())); };
const intro = () => document.querySelector("dialog.tribute-intro[open]");
const themed = () => !!document.querySelector(".tribute-theme");
const anthemCredit = () => document.querySelector(".tribute-anthem-credit");
const dismiss = () => settle(() => { const dialog = intro(); assert.ok(dialog); dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });

(async () => {
  now = start - 1;
  assert.ok(!renderToString(tree()).includes("tribute-banner"), "SSR starts neutral on ordinary routes");
  await settle(() => root.render(tree()));
  assert.equal(themed(), false); assert.equal(intro(), null); assert.equal(plays, 0); assert.equal(activeWraiths, 1);
  document.getElementById("outside").focus();
  await advance(start);
  assert.ok(themed()); assert.ok(document.querySelector(".tribute-banner")); assert.ok(intro()); assert.equal(plays, 0); assert.equal(activeWraiths, 0);
  assert.ok(document.querySelector(".tribute-environment"));
  await click("Skip intro");
  assert.equal(intro(), null); assert.equal(plays, 0); assert.equal(activeWraiths, 1); assert.equal(document.body.style.overflow, "");
  assert.equal(document.activeElement.id, "outside");
  assert.equal(localStorage.getItem(tributeSeenKey(tribute, "global")), "1");
  assert.match(anthemCredit().textContent, /Created by TYSIOTE.*Spirit Breaker · 53–36 Match/);
  assert.equal(anthemCredit().querySelector("a").getAttribute("href"), creatorRoute);
  await fire(2400); assert.equal(plays, 0);
  await remount(); assert.equal(intro(), null);
  assert.ok(document.querySelector(".tribute-banner").textContent.includes("72H 00M 00S"));
  await settle(() => document.querySelector(".tribute-banner button").click());
  assert.equal(document.querySelector(".tribute-banner button").getAttribute("aria-expanded"), "true");
  assert.ok(document.querySelector("#tribute-event-panel").textContent.includes("51:50"));
  console.log("PASS Tribute: neutral SSR/before-start state, live activation, first visit, silent Skip, focus/scroll restoration, persistent seen state and wraith suspension.");

  await click("Replay Tribute"); assert.ok(intro());
  assert.equal(document.querySelector("#tribute-event-panel"), null);
  const firstPlays = plays;
  await click("ENTER THE DARK"); assert.equal(plays, firstPlays + 1, "audio starts within the user gesture");
  await click("Mute"); assert.equal(document.querySelector("audio").muted, true);
  await click("Unmute"); assert.equal(document.querySelector("audio").muted, false);
  await fire(2400); assert.equal(intro(), null); assert.equal(activeWraiths, 1);
  await click("Pause"); assert.ok(pauses > 0);
  await click("PLAY MATCH ANTHEM");
  const audio = document.querySelector("audio"), navigationPlays = plays;
  document.getElementById("draft").value = "Draft survives navigation";
  for (const page of ["/leaderboard", "/matches", "/players", "/stats", "/rewards", "/add-match", "/admin"]) {
    await navigate(page); assert.ok(themed(), page); assert.equal(intro(), null); assert.equal(plays, navigationPlays);
    assert.equal(document.querySelector("audio"), audio); assert.equal(document.getElementById("draft").value, "Draft survives navigation");
  }
  showTributeCard = false; await navigate("/stats");
  assert.equal(document.querySelector(".tribute-card"), null);
  await click("Pause");
  assert.ok(document.querySelector(".tribute-audio-dock"), "Pause retains visible controls even on a route without a tribute card");
  assert.ok([...document.querySelector(".tribute-audio-dock").querySelectorAll("button")].some(button => buttonText(button) === "PLAY MATCH ANTHEM" && !button.disabled));
  await click("PLAY MATCH ANTHEM"); assert.ok(buttons("Pause").length > 0);
  showTributeCard = true; await navigate("/admin");
  await click("Stop"); assert.equal(audio.currentTime, 0);
  await click("Replay Tribute"); await click("ENTER THE DARK"); await click("Stop");
  assert.ok(intro(), "stopping the song does not dismiss the entrance");
  await fire(2400); assert.equal(intro(), null, "the entrance still settles after stopping audio");
  assert.equal(buttons("Pause").length, 0);
  console.log("PASS Tribute: gesture playback, mute/unmute, settle, pause/resume/stop and navigation across all main routes preserve a single media session and form values.");

  rejectAudio = true;
  await click("Replay Tribute"); await click("ENTER THE DARK"); await fire(2400);
  assert.ok(document.body.textContent.includes("Playback was blocked"));
  assert.ok(buttons("PLAY MATCH ANTHEM").some(button => !button.disabled), "blocked audio has manual fallback");
  rejectAudio = false; await click("PLAY MATCH ANTHEM"); await click("Stop");
  holdAudio = true;
  await click("Replay Tribute"); await click("ENTER THE DARK");
  assert.equal(pendingPlayback.length, 1);
  await click("Skip intro"); const pausedAfterSkip = pauses;
  await settle(() => { pendingPlayback.splice(0).forEach(resolve => resolve()); });
  holdAudio = false;
  assert.equal(intro(), null); assert.ok(pauses > pausedAfterSkip); assert.equal(buttons("Pause").length, 0);
  await fire(2400); assert.equal(timers.size, 0);
  holdAudio = true;
  await click("Replay Tribute"); await click("ENTER THE DARK"); assert.equal(pendingPlayback.length, 1);
  await click("Skip intro"); holdAudio = false;
  await click("PLAY MATCH ANTHEM"); const pausesForNewPlayback = pauses;
  await settle(() => { pendingPlayback.splice(0).forEach(resolve => resolve()); });
  assert.equal(pauses, pausesForNewPlayback, "a superseded play promise cannot pause newer requested playback");
  assert.ok(buttons("Pause").length > 0);
  await click("Stop");
  await click("Replay Tribute"); await dismiss(); assert.equal(intro(), null); assert.equal(document.body.style.overflow, "");
  console.log("PASS Tribute: rejected playback remains retryable, Skip cancels choreography and invalidates in-flight playback, Escape exits without timer/audio leaks.");

  available = false; await remount();
  assert.ok(document.body.textContent.includes("Anthem unavailable"));
  assert.ok(buttons("PLAY MATCH ANTHEM").every(button => button.disabled));
  await click("Replay Tribute"); const missingPlays = plays; await click("ENTER THE DARK"); await fire(2400);
  assert.equal(plays, missingPlays); assert.equal(intro(), null); assert.ok(document.getElementById("normal"));
  available = true; await click("Check anthem again"); await click("PLAY MATCH ANTHEM");
  await settle(() => document.querySelector("audio").dispatchEvent(new Event("error")));
  assert.ok(document.body.textContent.includes("Anthem unavailable"));
  await click("Check anthem again");
  showTributeCard = false; route = "/stats"; holdHead = true; await remount();
  assert.equal(pendingHeads.length, 1);
  await settle(() => document.querySelector(".tribute-banner button").click());
  await click("Replay Tribute"); const checkingPlays = plays; await click("ENTER THE DARK"); await fire(2400);
  assert.equal(plays, checkingPlays); assert.equal(intro(), null); assert.equal(document.querySelector(".tribute-card"), null);
  assert.ok(document.querySelector(".tribute-audio-dock").textContent.includes("Checking anthem"), "entering before HEAD completes retains a visible pending audio fallback");
  holdHead = false; await settle(() => pendingHeads.splice(0).forEach(resolve => resolve()));
  assert.equal(plays, checkingPlays, "a late availability result never starts invisible audio");
  assert.ok([...document.querySelector(".tribute-audio-dock").querySelectorAll("button")].some(button => buttonText(button) === "PLAY MATCH ANTHEM" && !button.disabled));
  await click("PLAY MATCH ANTHEM"); assert.equal(plays, checkingPlays + 1); await click("Stop");
  showTributeCard = true; await navigate("/stats");
  console.log("PASS Tribute: missing and failed media degrade to a usable silent theme; installing/recovering the anthem can be retried without reloading.");

  await click("PLAY MATCH ANTHEM"); const expiryPauses = pauses;
  await advance(end);
  assert.equal(themed(), false); assert.equal(intro(), null); assert.equal(document.querySelector(".tribute-banner"), null); assert.equal(document.querySelector("audio"), null); assert.ok(pauses > expiryPauses);
  assert.ok(document.getElementById("normal"));
  const cards = [...document.querySelectorAll("a.match-card")];
  assert.ok(cards[0].textContent.includes("MATCH LEGEND") || cards[0].textContent.includes("40 MINUTES IN THE DARK"), "permanent history badge survives expiry");
  assert.ok(!cards[1].textContent.includes("MATCH LEGEND") && !cards[1].textContent.includes("40 MINUTES IN THE DARK"), "newer match never receives badge");
  const beforeArchivePlays = plays;
  await navigate(archiveRoute);
  assert.ok(themed()); assert.ok(intro()); assert.ok(document.querySelector(".tribute-card")); assert.equal(document.querySelector(".tribute-banner"), null);
  assert.equal(plays, beforeArchivePlays, "archive audio requires a gesture");
  await click("Skip intro"); assert.equal(localStorage.getItem(tributeSeenKey(tribute, "archive")), "1");
  await navigate("/matches/newer-match"); assert.equal(themed(), false);
  await navigate(archiveRoute); assert.ok(themed()); assert.equal(intro(), null);
  await click("PLAY MATCH ANTHEM"); const leavePauses = pauses;
  await navigate("/stats"); assert.equal(themed(), false); assert.ok(pauses > leavePauses);
  await navigate(archiveRoute + "/edit"); assert.equal(themed(), false);
  await navigate("/stats"); await advance(start);
  await click("Replay Tribute"); await click("ENTER THE DARK"); assert.ok(intro());
  await advance(end); assert.equal(intro(), null); assert.equal(themed(), false); assert.equal(timers.size, 0); assert.equal(document.body.style.overflow, "");
  await advance(end - 1000);
  localStorage.removeItem(tributeSeenKey(tribute, "archive")); await remount();
  await navigate(archiveRoute); assert.equal(intro(), null);
  assert.equal(localStorage.getItem(tributeSeenKey(tribute, "archive")), "1");
  await click("PLAY MATCH ANTHEM");
  const deadlineAudio = document.querySelector("audio"), deadlinePlays = plays, deadlinePauses = pauses;
  await advance(end);
  assert.ok(themed()); assert.equal(intro(), null); assert.equal(document.querySelector(".tribute-banner"), null);
  assert.equal(document.querySelector("audio"), deadlineAudio); assert.equal(plays, deadlinePlays); assert.equal(pauses, deadlinePauses);
  assert.ok(buttons("Pause").length > 0, "the existing archive song continues uninterrupted across the deadline");
  await navigate("/stats"); assert.equal(themed(), false);
  console.log("PASS Tribute: live expiry restores normal pages, stops audio, retains only the fixed match badge; archive theme, separate first visit, replay and anthem remain permanent.");

  await navigate(archiveRoute);
  assert.match(anthemCredit().textContent, /Created by TYSIOTE.*Spirit Breaker · Dire · 53–36 Match/);
  assert.equal(anthemCredit().querySelector("a").getAttribute("href"), creatorRoute);
  await navigate(creatorRoute);
  assert.equal(themed(), false);
  assert.match(document.querySelector(".profile-head .anthem-creator-badge").textContent, /Match Anthem Creator/);
  const creatorStats = document.querySelector(".stats-grid").textContent;
  await advance(start);
  assert.equal(document.querySelector(".stats-grid").textContent, creatorStats);
  await advance(end);
  assert.match(document.querySelector(".profile-head .anthem-creator-badge").textContent, /Match Anthem Creator/);
  await navigate("/players/" + other.id);
  assert.equal(document.querySelector(".anthem-creator-badge"), null, "a matching nickname cannot earn the badge");
  await navigate("/players");
  const badges = document.querySelectorAll(".anthem-creator-badge");
  assert.equal(badges.length, 1);
  assert.equal(badges[0].closest("a").getAttribute("href"), creatorRoute);
  console.log("PASS Anthem credit: permanent Dire Spirit Breaker credit, verified profile link and badge, and exclusive Players card distinction.");

  localStorage.clear(); reduced = true; route = archiveRoute; const reducedPlays = plays; await remount();
  assert.ok(intro()); assert.equal(plays, reducedPlays);
  await click("ENTER THE DARK"); await fire(200); assert.equal(intro(), null);
  await click("Stop");
  const getItem = dom.window.Storage.prototype.getItem, setItem = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.getItem = () => { throw Error("Storage blocked"); };
  dom.window.Storage.prototype.setItem = () => { throw Error("Storage blocked"); };
  await remount(); assert.ok(intro()); await click("Skip intro"); assert.ok(themed()); assert.ok(document.getElementById("normal"));
  dom.window.Storage.prototype.getItem = getItem; dom.window.Storage.prototype.setItem = setItem;
  await settle(() => root.unmount());
  assert.equal(activeWraiths, 0); assert.equal(timers.size, 0); assert.equal(intervals.size, 0); assert.equal(document.body.style.overflow, "");
  console.log("PASS Tribute: reduced-motion entrance, unavailable storage and complete unmount cleanup preserve access to all content.");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => dom.window.close());
