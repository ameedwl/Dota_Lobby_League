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
let routeId="m1",sessionRole="admin";
const screenshotMock=require("./screenshot-test-client.cjs")({getRole:()=>sessionRole,getMatches:()=>snapshot.matches});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
let authEvent,authFailure=false,readFailure=false,saveFailure=false,saved,pushed;
const client={auth:{onAuthStateChange(fn){authEvent=fn;fn("INITIAL_SESSION");return {data:{subscription:{unsubscribe(){}}}};},async getUser(){return {data:{user:sessionRole?{id:"admin"}:null},error:authFailure?{message:"offline"}:null};}},
storage:screenshotMock.storage,
from(table){if(table!=="profiles")return screenshotMock.from(table);return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role:sessionRole},error:null};}}},
async rpc(name,args){if(name==="prepare_screenshot_upload"||name==="discard_screenshot_upload"||name==="complete_screenshot_cleanup")return screenshotMock.rpc(name,args);if(name==="league_snapshot")return {data:structuredClone(snapshot),error:readFailure?{message:"offline"}:null};saved=args;return {error:saveFailure?{message:"save failed"}:null};}};
const timers=new Map();let timerId=0;
global.setInterval=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};
global.clearInterval=id=>timers.delete(id);
Module._load=function(id,parent,isMain){
 if(id==="next/navigation")return {useRouter:()=>({push:p=>pushed=p}),usePathname:()=>"/matches/new",useParams:()=>({id:routeId})};
 if(id==="next/link")return {__esModule:true,default:({children,...props})=>React.createElement("a",props,children)};
 if(id==="./supabase"||id==="@/lib/supabase")return {getSupabase:()=>client,backendError:e=>e.message};
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
 const screenshotMatchId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 snapshot.matches=[{...match,id:screenshotMatchId}];await poll();routeId=screenshotMatchId;
 const publicWrap=child=>h(AuthProvider,null,h(LeagueProvider,null,h(LeagueStatus,null,child)));
 await settle(()=>root.render(publicWrap(h(DetailPage))));
 const screenshotSection=()=>document.querySelector(".match-screenshots");
 const choose=async files=>settle(()=>{const input=document.querySelector("#match-screenshot-files");Object.defineProperty(input,"files",{configurable:true,value:files});input.dispatchEvent(new Event("change",{bubbles:true}));});
 const picture=(type="image/png",size=20)=>({name:"screenshot.png",type,size});
 const click=async text=>settle(()=>[...screenshotSection().querySelectorAll("button")].find(b=>b.textContent===text||b.getAttribute("aria-label")===text).click());
 assert.ok(screenshotSection().textContent.includes("0 / 3 screenshots"));assert.ok(screenshotSection().textContent.includes("No screenshots attached yet."));
 assert.equal(document.querySelector("#match-screenshot-files").multiple,true);
 let browsed=false;const fileInput=document.querySelector("#match-screenshot-files");fileInput.click=()=>{browsed=true;};
 await settle(()=>document.querySelector(".screenshot-browse").click());assert.equal(browsed,true);
 await choose([picture("image/gif")]);assert.ok(screenshotSection().textContent.includes("Unsupported file type"));
 await choose([picture("image/png",10485761)]);assert.ok(screenshotSection().textContent.includes("10 MB or smaller"));
 assert.equal(screenshotMock.state.uploads,0);
 screenshotMock.state.hold=true;
 await choose([picture()]);assert.ok(screenshotSection().textContent.includes("Uploading..."));
 await choose([picture()]);assert.equal(screenshotMock.state.uploads,1);
 screenshotMock.state.hold=false;await settle(()=>screenshotMock.state.release());
 assert.ok(screenshotSection().textContent.includes("Upload complete"));assert.equal(document.querySelectorAll(".screenshot-card").length,1);
 assert.equal(document.querySelector(".screenshot-thumbnail img").getAttribute("loading"),"lazy");
 await settle(()=>{const event=new Event("drop",{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:{files:[picture("image/jpeg"),picture("image/webp")]}});document.querySelector(".screenshot-dropzone").dispatchEvent(event);});
 assert.equal(document.querySelectorAll(".screenshot-card").length,3);assert.ok(screenshotSection().textContent.includes("3 / 3 screenshots"));
 await choose([picture()]);assert.ok(screenshotSection().textContent.includes("up to 3"));assert.equal(screenshotMock.state.uploads,3);
 let restoredScroll;window.scrollTo=(x,y)=>{restoredScroll=[x,y];};
 Object.defineProperty(window,"scrollY",{configurable:true,value:240});
 document.body.style.overflow="auto";document.documentElement.style.overflow="scroll";
 await settle(()=>document.querySelector('[aria-label="Open screenshot 1"]').click());assert.ok(document.querySelector("dialog[open]"));
 assert.equal(document.body.style.position,"fixed");assert.equal(document.body.style.top,"-240px");assert.equal(document.documentElement.style.overflow,"hidden");
 await settle(()=>document.querySelector("dialog img").click());assert.ok(document.querySelector("dialog[open]"));
 const key=async value=>settle(()=>document.querySelector("dialog").dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:value,bubbles:true,cancelable:true})));
 await key("ArrowLeft");assert.ok(document.querySelector("dialog h2").textContent.includes("3 / 3"));
 await key("ArrowRight");assert.ok(document.querySelector("dialog h2").textContent.includes("1 / 3"));

 await click("Next screenshot");assert.ok(document.querySelector("dialog h2").textContent.includes("2 / 3"));
 await click("Previous screenshot");await click("Close preview");assert.equal(document.querySelector("dialog"),null);
 assert.equal(document.body.style.overflow,"auto");assert.equal(document.body.style.position,"");assert.equal(document.documentElement.style.overflow,"scroll");assert.deepEqual(restoredScroll,[0,240]);
 await settle(()=>document.querySelector('[aria-label="Open screenshot 1"]').click());await key("Escape");assert.equal(document.querySelector("dialog"),null);
 await settle(()=>document.querySelector('[aria-label="Open screenshot 1"]').click());await settle(()=>document.querySelector("dialog").click());assert.equal(document.querySelector("dialog"),null);assert.equal(document.body.style.position,"");

 await settle(()=>document.querySelector(".screenshot-thumbnail img").dispatchEvent(new Event("error")));assert.ok(screenshotSection().textContent.includes("Image unavailable"));
 await click("Remove screenshot 1");await click("Cancel removal");assert.equal(document.querySelectorAll(".screenshot-card").length,3);
 await click("Remove screenshot 1");await click("Confirm removal");assert.equal(document.querySelectorAll(".screenshot-card").length,2);assert.equal(screenshotMock.state.objects.size,2);
 screenshotMock.state.failUpload=true;await choose([picture()]);assert.ok(screenshotSection().textContent.includes("Upload failed"));assert.equal(document.querySelectorAll(".screenshot-card").length,2);screenshotMock.state.failUpload=false;
 screenshotMock.state.failInsert=true;await choose([picture()]);assert.equal(screenshotMock.state.objects.size,2);assert.equal(screenshotMock.state.rows.length,2);screenshotMock.state.failInsert=false;
 screenshotMock.state.failRemove=true;await click("Remove screenshot 1");await click("Confirm removal");assert.ok(screenshotSection().textContent.includes("cleanup is queued"));assert.equal(document.querySelectorAll(".screenshot-card").length,1);
 screenshotMock.state.failRemove=false;await poll();assert.equal(screenshotMock.state.pending.size,0);
 sessionRole="viewer";await focus();assert.equal(document.querySelector(".screenshot-dropzone"),null);assert.ok(![...screenshotSection().querySelectorAll("button")].some(b=>b.textContent.startsWith("Remove screenshot")));
 await settle(()=>document.querySelector('[aria-label="Open screenshot 1"]').click());assert.ok(document.querySelector("dialog[open]"));
 await settle(()=>document.querySelector("dialog").dispatchEvent(new Event("cancel",{cancelable:true})));assert.equal(document.querySelector("dialog"),null);
 sessionRole=null;await settle(()=>authEvent("SIGNED_OUT"));assert.equal(document.querySelector(".screenshot-dropzone"),null);assert.equal(document.querySelectorAll(".screenshot-card").length,1);
 console.log("PASS Screenshots: public gallery/lightbox, admin controls, multi-file browse/drop, validation, duplicate guard, upload/removal states and cleanup retry.");
 await settle(()=>document.querySelector('[aria-label="Open screenshot 1"]').click());
 await settle(()=>root.unmount());
 assert.equal(document.body.style.overflow,"auto");assert.equal(document.body.style.position,"");assert.equal(document.documentElement.style.overflow,"scroll");
 console.log("PASS Fullscreen lightbox: arrow wrapping, Escape, backdrop/image clicks, scroll locking and restoration on close/unmount.");
})().catch(e=>{console.error(e);process.exitCode=1;});
