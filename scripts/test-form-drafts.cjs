/* eslint-disable @typescript-eslint/no-require-imports -- In-process React regression runner. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const {JSDOM}=require("jsdom");
const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost",pretendToBeVisual:true});
for(const key of ["window","document","HTMLElement","HTMLInputElement","HTMLSelectElement","FormData","Event"])global[key]=dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT=true;
global.requestAnimationFrame=fn=>fn();
const React=require("react"),{act}=React,{createRoot}=require("react-dom/client");
const rootPath=path.resolve(__dirname,"../src"),originalLoad=Module._load;
let snapshot={players:Array.from({length:10},(_,i)=>({id:"p"+i,name:"Player "+i,nickname:"P"+i,createdAt:"2026-01-01"})),matches:[],settings:{name:"League",season:"I"}};
let routeId="m1";
let authEvent,authFailure=false,readFailure=false,saveFailure=false,saved,pushed;
const client={auth:{onAuthStateChange(fn){authEvent=fn;fn("INITIAL_SESSION");return {data:{subscription:{unsubscribe(){}}}};},async getUser(){return {data:{user:{id:"admin"}},error:authFailure?{message:"offline"}:null};}},
from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role:"admin"},error:null};}}},
async rpc(name,args){if(name==="league_snapshot")return {data:structuredClone(snapshot),error:readFailure?{message:"offline"}:null};saved=args;return {error:saveFailure?{message:"save failed"}:null};}};
const timers=new Map();let timerId=0;
global.setInterval=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};
global.clearInterval=id=>timers.delete(id);
Module._load=function(id,parent,isMain){
 if(id==="next/navigation")return {useRouter:()=>({push:p=>pushed=p}),usePathname:()=>"/matches/new",useParams:()=>({id:routeId})};
 if(id==="next/link")return {__esModule:true,default:({children,...props})=>React.createElement("a",props,children)};
 if(id==="./supabase")return {getSupabase:()=>client,backendError:e=>e.message};
 if(id==="./backend")return {decodeSnapshot:s=>s,encodeMatch:m=>m,encodePlayer:p=>p};
 if(id.startsWith("@/"))id=path.join(rootPath,id.slice(2));
 return originalLoad.call(this,id,parent,isMain);
};
for(const ext of [".ts",".tsx"])require.extensions[ext]=(mod,file)=>{
 const result=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file});
 mod._compile(result.outputText,file);
};
const {AuthProvider}=require("../src/lib/auth"),{LeagueProvider}=require("../src/lib/store");
const {LeagueStatus}=require("../src/components/league-status"),{AdminGate}=require("../src/components/admin-gate"),{MatchForm}=require("../src/components/match-form");
const h=React.createElement;
const root=createRoot(document.getElementById("root"));
const wrap=child=>h(AuthProvider,null,h(LeagueProvider,null,h(LeagueStatus,null,h(AdminGate,null,child))));
async function settle(fn=()=>{}){await act(async()=>{await fn();await new Promise(r=>setTimeout(r,10));});}
async function fill(id,value){await settle(()=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?"change":"input",{bubbles:true}));});}
const values=()=>Object.fromEntries([...document.querySelectorAll("input,select")].map(el=>[el.id,el.value]));
async function poll(){await settle(()=>{for(const t of timers.values())if(t.ms===15000)t.fn();});}
async function focus(){await settle(()=>window.dispatchEvent(new Event("focus")));}
async function submit(){await settle(()=>document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
(async()=>{
 await settle(()=>root.render(wrap(h(MatchForm))));
 for(let i=0;i<5;i++){await fill("radiant"+i,"p"+i);await fill("dire"+i,"p"+(i+5));}
 for(const [id,value] of Object.entries({winner:"dire",mvp:"p7","runner-up-mvp":"p2","radiant-score":"25","dire-score":"42",duration:"38.5","dota-id":"123456789","played-at":"2026-09-18T13:45"}))await fill(id,value);
 const draft=values();assert.equal(draft.duration,"38.5");assert.equal(draft.dire4,"p9");assert.equal(draft["runner-up-mvp"],"p2");
 assert.equal(document.querySelectorAll("#mvp option").length,6);assert.equal(document.querySelectorAll("#runner-up-mvp option").length,6);
 assert.deepEqual([...document.querySelectorAll("#mvp option")].map(x=>x.value),["","p5","p6","p7","p8","p9"]);
 assert.deepEqual([...document.querySelectorAll("#runner-up-mvp option")].map(x=>x.value),["","p0","p1","p2","p3","p4"]);
 // Two 15-second polling callbacks represent 30 seconds of shared refreshes.
 await poll();await poll();assert.deepEqual(values(),draft);
 await focus();await settle(()=>authEvent("TOKEN_REFRESHED"));assert.deepEqual(values(),draft);
 readFailure=true;await poll();assert.deepEqual(values(),draft);readFailure=false;await poll();assert.deepEqual(values(),draft);
 authFailure=true;await focus();assert.deepEqual(values(),draft);await submit();assert.equal(saved,undefined);authFailure=false;await focus();
 saveFailure=true;await submit();assert.deepEqual(values(),draft);saveFailure=false;
 await submit();assert.equal(saved.p_match.participants.length,10);assert.equal(saved.p_match.durationMinutes,38.5);assert.equal(saved.p_match.runnerUpMvpPlayerId,"p2");assert.ok(pushed);assert.ok(Object.values(values()).every(v=>v===""));
 console.log("PASS Add Match: all fields survive polling, focus, token refresh, errors; failed save preserves and successful save clears.");
 await settle(()=>root.render(wrap(h(MatchForm,{key:"new-draft"}))));
 await fill("radiant0","p0");await fill("dire0","p5");await fill("winner","radiant");await fill("mvp","p0");await fill("runner-up-mvp","p5");await fill("duration","21");
 snapshot.players=snapshot.players.filter(p=>p.id!=="p0");await poll();
 assert.equal(values().radiant0,"");assert.equal(values().mvp,"");assert.equal(values().dire0,"p5");assert.equal(values().duration,"21");assert.equal(values().winner,"radiant");assert.equal(values()["runner-up-mvp"],"p5");
 snapshot.players=snapshot.players.filter(p=>p.id!=="p5");await poll();assert.equal(values()["runner-up-mvp"],"");assert.equal(values().duration,"21");
 await settle(()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Clear form").click());assert.ok(Object.values(values()).every(v=>v===""));
 console.log("PASS Deleted player: only invalid slot/MVP removed; explicit Clear clears draft.");
 snapshot.players.unshift({id:"p0",name:"Player 0",nickname:"P0"},{id:"p5",name:"Player 5",nickname:"P5"});
 const match={...saved.p_match,id:"m1",updatedAt:"original-version"};snapshot.matches=[match];await poll();
 const EditPage=require("../src/app/matches/[id]/edit/page").default;
 await settle(()=>root.render(wrap(h(EditPage))));await fill("duration","77");await fill("radiant-score","99");const initialEdit=values();
 await fill("winner","radiant");
 assert.deepEqual(values(),{...initialEdit,winner:"radiant",mvp:"","runner-up-mvp":""});
 await fill("mvp","p0");await fill("runner-up-mvp","p7");
 const validAwards=values();await fill("winner","radiant");assert.deepEqual(values(),validAwards);
 // Replacing one awarded player clears just that award.
 await fill("dire2","");assert.equal(values()["runner-up-mvp"],"");assert.equal(values().mvp,"p0");assert.equal(values().duration,"77");
 await fill("dire2","p7");await fill("runner-up-mvp","p7");
 const editDraft=values();
 snapshot.matches=[{...match,durationMinutes:100,updatedAt:"new-version"}];await poll();await focus();assert.deepEqual(values(),editDraft);
 saveFailure=true;await submit();assert.equal(saved.p_expected_updated_at,"original-version");assert.equal(saved.p_match.durationMinutes,77);assert.deepEqual(values(),editDraft);
 snapshot.matches=[];await poll();assert.deepEqual(values(),editDraft);
 console.log("PASS Edit Match: winner/team changes prune only invalid awards; refresh preserves both awards and conflict version.");
 snapshot.matches=[{...match,mvpPlayerId:"p7",runnerUpMvpPlayerId:"p2"}];await poll();routeId="p2";
 const ProfilePage=require("../src/app/players/[id]/page").default;
 await settle(()=>root.render(wrap(h(ProfilePage))));
 const awardCard=[...document.querySelectorAll(".stat-card")].find(el=>el.textContent.includes("Runner-up MVP awards"));
 assert.equal(awardCard.querySelector("strong").textContent,"1");
 assert.ok(document.querySelector(".runner-up-award").textContent.includes("P2"));
 routeId="m1";const DetailPage=require("../src/app/matches/[id]/page").default;
 await settle(()=>root.render(wrap(h(DetailPage))));
 assert.ok(document.querySelector(".match-awards").textContent.includes("Winning team"));
 assert.ok(document.querySelector(".match-awards").textContent.includes("Losing team"));
 const RecordsPage=require("../src/app/stats/page").default;
 await settle(()=>root.render(wrap(h(RecordsPage))));
 const record=[...document.querySelectorAll(".record")].find(el=>el.textContent.includes("Most Runner-up MVP Awards"));
 assert.equal(record.querySelector("h2").textContent,"1");assert.ok(record.textContent.includes("P2"));
 console.log("PASS Profile, match details/history and Lobby Records display the derived Runner-up award.");

 const LeaderboardPage=require("../src/app/leaderboard/page").default;
 await settle(()=>root.render(wrap(h(LeaderboardPage))));
 const headers=[...document.querySelectorAll("thead th")];
 const awardHeader=headers.findIndex(th=>th.textContent==="R-UP MVPS");
 assert.equal(headers[awardHeader-1].textContent,"MVPs");
 assert.equal(headers[awardHeader+1].textContent,"Current / Form");
 assert.equal(headers[awardHeader].querySelector("button"),null);
 const expected=require("../src/lib/stats").calculatePlayerStats(snapshot.players,snapshot.matches);
 const tableRows=()=>[...document.querySelectorAll("tbody tr")];
 assert.deepEqual(tableRows().map(tr=>tr.querySelector("a").getAttribute("href")),expected.map(s=>"/players/"+s.player.id));
 for(const row of tableRows()){
  const stat=expected.find(s=>"/players/"+s.player.id===row.querySelector("a").getAttribute("href"));
  assert.equal(row.children[awardHeader].textContent,String(stat.runnerUpMvpCount));
 }
 assert.ok(document.querySelector(".table-wrap table"));
 assert.ok(document.querySelector(".champion-row .rank.gold"));
 assert.equal(document.querySelectorAll("tbody .form").length,expected.length);
 await settle(()=>[...document.querySelectorAll("thead button")].find(b=>b.textContent==="Losses").click());
 assert.deepEqual(tableRows().map(tr=>tr.querySelector("a").getAttribute("href")),[...expected].sort((a,b)=>b.losses-a.losses||a.rank-b.rank).map(s=>"/players/"+s.player.id));
 console.log("PASS Leaderboard: adjacent derived Runner-up counts, existing sorting, champion and form indicators preserved.");
 const AdminPage=require("../src/app/admin/page").default;
 await settle(()=>root.render(wrap(h(AdminPage))));
 await fill("league-name","Unsaved league");await fill("season","Unsaved season");const settingsDraft=values();
 await poll();await focus();assert.deepEqual(values(),settingsDraft);
 const PlayersPage=require("../src/app/players/page").default;
 await settle(()=>root.render(wrap(h(PlayersPage))));
 await settle(()=>[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Add player")).click());
 const inputs=[...document.querySelectorAll("form input")];inputs.forEach((el,i)=>el.id="player-field-"+i);
 await fill("player-field-0","Unsaved name");await fill("player-field-1","Unsaved alias");await fill("player-field-2","12345");
 const playerDraft=values();await poll();await focus();assert.deepEqual(values(),playerDraft);
 console.log("PASS Player and league settings forms: unsaved values survive polling and focus.");
 await settle(()=>root.unmount());
})().catch(e=>{console.error(e);process.exitCode=1;});

