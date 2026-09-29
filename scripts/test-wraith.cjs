/* eslint-disable @typescript-eslint/no-require-imports -- In-process React hydration regression. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const {JSDOM}=require("jsdom"),React=require("react"),{renderToString}=require("react-dom/server");
const source=path.resolve(__dirname,"../src"),originalLoad=Module._load;
Module._load=function(id,parent,main){return originalLoad.call(this,id.startsWith("@/")?path.join(source,id.slice(2)):id,parent,main);};
for(const ext of [".ts",".tsx"])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {LobbyWraithEffect}=require("../src/components/lobby-wraith-effect"),h=React.createElement;
let clicks=0;
function Shell({page}){return h(React.Fragment,null,h("button",{onClick:()=>clicks++},page),h("input",{defaultValue:"Draft intact"}),h(LobbyWraithEffect));}
// SSR happens before any window/document exists: random choices are effect-only.
const markup=renderToString(h(Shell,{page:"Home"}));
const dom=new JSDOM("<div id='root'>"+markup+"</div>",{url:"http://localhost",pretendToBeVisual:true});
for(const key of ["window","document","HTMLElement","Event"])global[key]=dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT=true;
let next=0;const timers=new Map(),frames=new Map();
window.setTimeout=fn=>{timers.set(++next,fn);return next;};window.clearTimeout=id=>timers.delete(id);
window.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};window.cancelAnimationFrame=id=>frames.delete(id);
const media=Object.assign(new window.EventTarget(),{matches:false});window.matchMedia=()=>media;
window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});
const {hydrateRoot}=require("react-dom/client"),{act}=React;
const errors=[],originalError=console.error;console.error=(...args)=>errors.push(args);
(async()=>{
 let root;
 await act(async()=>{root=hydrateRoot(document.getElementById("root"),h(Shell,{page:"Home"}));});
 assert.equal(document.querySelectorAll("canvas").length,1);assert.equal(timers.size,1);assert.equal(frames.size,0);
 for(const page of ["Leaderboard","Add Match","Players"]){
  await act(async()=>root.render(h(Shell,{page})));
  assert.equal(document.querySelectorAll("canvas").length,1);assert.equal(timers.size,1);
  await act(async()=>document.querySelector("button").click());
  assert.equal(document.querySelector("input").value,"Draft intact");
 }
 assert.equal(clicks,3);assert.equal(document.body.style.overflow,"");
 assert.equal(document.querySelector("canvas").getAttribute("aria-hidden"),"true");assert.equal(document.querySelector("canvas").tabIndex,-1);
 const css=fs.readFileSync(path.join(source,"app/globals.css"),"utf8");assert.match(css,/\.lobby-wraith-effect\{[^}]*pointer-events:none/);
 media.matches=true;await act(async()=>media.dispatchEvent(new Event("change")));assert.equal(timers.size+frames.size,0);
 await act(async()=>root.unmount());assert.equal(timers.size+frames.size,0);assert.deepEqual(errors,[]);
 console.log("PASS Wraith: SSR/hydration without warnings, one canvas across navigation, clickable controls, retained input, unchanged scroll styles, reduced motion and cleanup.");
})().catch(e=>{originalError(e);process.exitCode=1;}).finally(()=>{console.error=originalError;dom.window.close();});
