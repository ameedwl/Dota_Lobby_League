/* eslint-disable @typescript-eslint/no-require-imports -- In-process component and provider integration. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Event'])global[key]=dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const source=path.resolve(__dirname,'../src'),load=Module._load;
let admin=true,fail=false,rolls=0,configs=0,rollFinish,rerolls=0,resets=0,grants=0;
const audit=[];
const rawPlayer=i=>({id:'p'+i,name:'Player '+i,nickname:'P'+i,created_at:'2026-10-04T00:00:00Z',steam_id:null,avatar_url:null});
const base={revision:0,reroll_count:0,source_type:'STREAK_MILESTONE',streak_milestone:3,id:'r1',player_id:'p0',qualifying_match_id:'m',qualifying_match_snapshot:'m',reward_key:null,status:'available',target_player_id:null,secondary_target_player_id:null,target_role:null,target_hero_id:null,earned_at:'2026-10-04T00:00:00Z',rolled_at:null,activated_at:null,used_at:null,used_match_id:null,used_match_snapshot:null,cancelled_at:null,cancel_reason:null};
let snapshot={players:Array.from({length:10},(_,i)=>rawPlayer(i)),matches:[],settings:{name:'Lobby Legends',season:'I'},rewards:[base],reward_system_settings:{baseline_match_id:"m",baseline_match_snapshot:"m",baseline_played_at:"2026-10-04T00:00:00Z"},reward_streaks:[{player_id:"p0",current_streak:5}],reward_catalog:[]};
const client={from(){return {select(){return this;},eq(){return this;},async order(){return {data:audit,error:null};}};},async rpc(name,args){
 if(name==='league_snapshot')return {data:structuredClone(snapshot),error:null};
 if(name==='roll_reward'){
  rolls++;await new Promise(resolve=>{rollFinish=resolve});
  snapshot.rewards=snapshot.rewards.map(r=>r.id===args.p_reward_id?{...r,revision:r.revision+1,reward_key:'role_commander',status:'pending_configuration',rolled_at:'2026-10-04T01:00:00Z'}:r);
  return {data:structuredClone(snapshot.rewards[0]),error:null};
 }
 if(name==='configure_reward'){
  configs++;if(fail)return {error:{message:'Network save failed'}};
  snapshot.rewards=snapshot.rewards.map(r=>r.id===args.p_reward_id?{...r,...args.p_selection,revision:r.revision+1,status:'active',activated_at:'2026-10-04T01:01:00Z'}:r);
  return {data:structuredClone(snapshot.rewards[0]),error:null};
 }
 if(name==='cancel_reward'){snapshot.rewards=snapshot.rewards.map(r=>r.id===args.p_reward_id?{...r,status:'cancelled',cancel_reason:args.p_reason}:r);return {data:structuredClone(snapshot.rewards[0]),error:null};}

 if(name==='reroll_reward'||name==='reset_reward_configuration'){
  if(name==='reroll_reward')rerolls++;else resets++;
  const r=snapshot.rewards.find(r=>r.id===args.p_reward_id);assert.equal(args.p_expected_revision,r.revision);assert.ok(args.p_request_id);
  const key=name==='reroll_reward'?(r.reward_key==='role_commander'?'hero_protection':'self_silence'):r.reward_key;
  const next={...r,reward_key:key,revision:r.revision+1,reroll_count:r.reroll_count+(name==='reroll_reward'?1:0),target_player_id:null,secondary_target_player_id:null,target_hero_id:null,target_role:null,status:key==='self_silence'?'active':'pending_configuration'};
  audit.push({id:'a'+audit.length,action:name==='reroll_reward'?'reroll':'reset_configuration',previous_result:r,new_result:next,created_at:'2026-10-10T12:00:00Z'});
  snapshot.rewards=snapshot.rewards.map(x=>x.id===r.id?next:x);return {data:structuredClone(next),error:null};
 }
 if(name==='grant_reward_roll'){
  grants++;assert.ok(args.p_request_id);const r={...base,id:'manual'+grants,player_id:args.p_player_id,source_type:'ADMIN_GRANT',streak_milestone:null,qualifying_match_id:null,qualifying_match_snapshot:null,grant_reason:args.p_reason};snapshot.rewards.push(r);return {data:r,error:null};
 }
 throw new Error('Unexpected RPC: '+name);
}};
const intervals=new Map();let timer=0;
global.setInterval=(fn,ms)=>{intervals.set(++timer,{fn,ms});return timer;};global.clearInterval=id=>intervals.delete(id);
Module._load=function(id,parent,main){
 if(id==='next/link')return {__esModule:true,default:({children,...props})=>h('a',props,children)};
 if(id==='./auth'||id==='@/lib/auth')return {useAuth:()=>({isAdmin:admin,ready:true,error:''})};
 if(id==='./supabase'||id==='@/lib/supabase')return {getSupabase:()=>client,backendError:e=>e.message};
 if(id==='./screenshots')return {cleanupScreenshotFiles:async()=>{}};
 if(id.startsWith('@/'))id=path.join(source,id.slice(2));
 return load.call(this,id,parent,main);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {LeagueProvider}=require('../src/lib/store'),Page=require('../src/app/rewards/page').default,{ActiveRewardsBanner}=require('../src/components/rewards'),{rewardCatalog}=require('../src/lib/rewards');
snapshot.reward_catalog=rewardCatalog.map(r=>({key:r.key,configuration:r.configuration,enabled:true}));
const root=createRoot(document.getElementById('root')),errors=[],log=console.error;console.error=(...x)=>errors.push(x);
const settle=fn=>act(async()=>{fn?.();await new Promise(r=>setTimeout(r,10));});
const render=()=>root.render(h(LeagueProvider,null,h(Page),h(ActiveRewardsBanner)));
const poll=()=>settle(()=>{for(const {fn,ms} of intervals.values())if(ms===15000)fn();});
const press=text=>settle(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);assert.ok(b,text);b.click();});
const fill=(id,value)=>settle(()=>{const el=document.getElementById(id);assert.ok(el,id);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
(async()=>{
 await settle(render);assert.match(document.body.textContent,/11 rewards/);assert.match(document.body.textContent,/9.09%/);
 await press('Roll one');assert.equal(rolls,1);assert.ok(!document.querySelector('.reward-reveal'));await poll();assert.equal(rolls,1);
 await settle(()=>rollFinish());await settle();assert.ok(document.querySelector('.reward-reveal'));assert.match(document.body.textContent,/Role Commander/);await press('Continue');
 console.log('PASS Rewards: server result arrives before reveal; reduced motion reveals immediately; refresh never rolls.');
 await fill('r1target_player_id','p1');await fill('r1role','5');
 await poll();await settle(()=>window.dispatchEvent(new Event('focus')));
 assert.equal(document.getElementById('r1target_player_id').value,'p1');assert.equal(document.getElementById('r1role').value,'5');
 fail=true;await settle(()=>document.querySelector('.reward-config').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(configs,1);assert.match(document.body.textContent,/Network save failed/);assert.equal(document.getElementById('r1role').value,'5');
 snapshot.players=snapshot.players.filter(p=>p.id!=='p1');await poll();assert.equal(document.getElementById('r1target_player_id').value,'');assert.equal(document.getElementById('r1role').value,'5');
 snapshot.players.push(rawPlayer(1));await poll();await fill('r1target_player_id','p2');fail=false;
 await settle(()=>document.querySelector('.reward-config').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(configs,2);assert.ok(!document.querySelector('.reward-config'));assert.match(document.querySelector('.reward-banner').textContent,/P2 must play Position 5/);
 console.log('PASS Rewards: configuration survives polling/focus and failed saves; deleted target clears alone; activation and Add Match reminder update.');

 assert.match(document.body.textContent,/Next milestone: 6/);assert.match(document.body.textContent,/1 more win/);
 window.confirm=()=>false;await press('Reroll reward');assert.equal(rerolls,0);
 window.confirm=()=>true;await press('Reroll reward');await settle();assert.equal(rerolls,1);assert.ok(document.querySelector('.reward-reveal'));await press('Continue');
 assert.equal(snapshot.rewards[0].target_player_id,null);assert.equal(document.getElementById('r1hero').value,'');
 await fill('r1hero','97');await poll();assert.equal(document.getElementById('r1hero').value,'97');
 await settle(()=>document.querySelector('.reward-config').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 window.confirm=()=>false;await press('Reset configuration');assert.equal(resets,0);
 window.confirm=()=>true;await press('Reset configuration');assert.equal(resets,1);assert.equal(document.getElementById('r1hero').value,'');
 await fill('r1hero','98');await settle(()=>document.querySelector('.reward-config').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await press('Reroll reward');await settle();assert.equal(rerolls,2);assert.match(document.querySelector('.reward-reveal').textContent,/Self Silence/);await press('Continue');await press('Load audit');assert.match(document.body.textContent,/Reroll #1/);
 console.log('PASS Rewards V2: reroll/reset confirmations, repeated authoritative reveals, cleared configuration and audit display.');
 await fill('grant-player','p4');await fill('grant-reason','Try the new tools');await press('Grant reward roll');assert.equal(grants,1);assert.match(document.body.textContent,/Admin grant/);assert.match(document.body.textContent,/Reward streak unchanged/);
 snapshot.rewards.push({...base,id:'extra1',player_id:'p4',streak_milestone:6},{...base,id:'extra2',player_id:'p4',streak_milestone:9});await poll();assert.match(document.body.textContent,/3 reward rolls available/);
 console.log('PASS Rewards V2: manual grant labels and multiple available rolls stay separate; next milestone progress is accurate.');
 snapshot.rewards.push({...base,id:'r2'},{...base,id:'r3',reward_key:'random_hero_curse',status:'pending_configuration'});
 admin=false;await settle(render);await poll();assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Roll one'));assert.ok(!document.querySelector('.reward-config'));assert.ok(!document.querySelector('.reward-correction'));assert.ok(![...document.querySelectorAll('button')].some(b=>/Reroll|Reset configuration|Grant reward/.test(b.textContent)));
 assert.match(document.body.textContent,/league administrator/);console.log('PASS Rewards: viewers see rules, pool, history and active rewards without mutation controls.');
 admin=true;await settle(render);window.confirm=()=>false;await fill('reason-r1','Recorded in error');await press('Void reward');assert.equal(snapshot.rewards[0].status,'active');
 window.confirm=()=>true;await press('Void reward');assert.equal(snapshot.rewards[0].status,'cancelled');assert.ok(!document.querySelector('.reward-banner'));
 console.log('PASS Rewards: correction requires reason and confirmation, preserves history and removes active reminder.');
 await settle(()=>root.unmount());assert.equal(intervals.size,0);assert.deepEqual(errors,[]);
 console.log('PASS Rewards: no React warnings; timers clean up on unmount.');
})().catch(e=>{log(e);process.exitCode=1;}).finally(()=>{console.error=log;dom.window.close();});
