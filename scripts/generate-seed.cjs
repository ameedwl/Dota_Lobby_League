/* eslint-disable @typescript-eslint/no-require-imports -- Node seed generator. */
const fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const root=path.resolve(__dirname,"..");
const mod={exports:{}};
const js=ts.transpileModule(fs.readFileSync(path.join(root,"src/lib/fixtures.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function("exports","module",js)(mod.exports,mod);
const imported=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],"utf8")):null;
const players=imported?imported.players:mod.exports.seedPlayers,matches=imported?imported.matches:mod.exports.seedMatches;
require.extensions[".ts"]=(module,filename)=>{if(!filename.startsWith(path.join(root,"src/lib")+path.sep))throw new Error("Unexpected module");module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);};
const issue=require("../src/lib/league.ts").validateLeague({players,matches});if(issue)throw new Error(issue);
const quote=value=>value===undefined||value===null?"null":"'"+String(value).replaceAll("'","''")+"'";
const uuid=(prefix,index)=>prefix+"0000000-0000-4000-8000-"+String(index+1).padStart(12,"0");
const ids=new Map(players.map((p,i)=>[p.id,uuid("1",i)]));
let sql="-- Development seed generated from fixtures (or an explicitly supplied legacy snapshot).\n-- Run only against a fresh development league, after the schema migration.\nbegin;\n";
for(const p of players) sql+="insert into public.players(id,name,nickname,steam_id,avatar_url,created_at) values("+[ids.get(p.id),p.name,p.nickname,p.steamId,p.avatarUrl,p.createdAt].map(quote).join(",")+");\n";
matches.forEach((m,i)=>{
 const id=uuid("2",i);
 sql+="insert into public.matches(id,played_at,winner_team,radiant_score,dire_score,duration_minutes,mvp_player_id,dota_match_id) values("+[id,m.playedAt,m.winner,m.radiantScore,m.direScore,m.durationMinutes,m.mvpPlayerId?ids.get(m.mvpPlayerId):null,m.dotaMatchId].map(quote).join(",")+");\n";
 for(const p of m.participants){
  if(!ids.has(p.playerId))throw new Error("Unknown player in match "+m.id);
  sql+="insert into public.match_players(match_id,player_id,team,hero_id,kills,deaths,assists) values("+[id,ids.get(p.playerId),p.team,p.heroId,p.kills,p.deaths,p.assists].map(quote).join(",")+");\n";
 }
});
sql+="commit;\n";
const output=process.argv[3]??path.join(root,"supabase/seed.sql");
fs.writeFileSync(output,sql);
console.log("Wrote "+output+" ("+players.length+" players, "+matches.length+" matches).");

