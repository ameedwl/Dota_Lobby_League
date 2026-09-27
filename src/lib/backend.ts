import { LobbyMatch, Player, Team } from "./types";
import { sortMatches } from "./stats";
import { validateLeague } from "./league";
export type LeagueSettings={name:string;season:string};
type DbPlayer={id:string;name:string;nickname:string;steam_id:string|null;dota_account_id?:number|string|null;avatar_url:string|null;created_at:string};
type DbParticipant={player_id:string;team:Team;hero_id:number|null;kills:number|null;deaths:number|null;assists:number|null};
type DbMatch={id:string;played_at:string;winner_team:Team;radiant_score:number|null;dire_score:number|null;duration_minutes:number|null;mvp_player_id:string|null;runner_up_mvp_player_id?:string|null;dota_match_id:string|null;updated_at:string;bans?:{team:Team;hero_id:number}[];participants:DbParticipant[]};
export type Snapshot={players:Player[];matches:LobbyMatch[];settings:LeagueSettings};
export function decodeSnapshot(raw:unknown):Snapshot{
 const value=raw as {players:DbPlayer[];matches:DbMatch[];settings:LeagueSettings|null};
 if(!value||!Array.isArray(value.players)||!Array.isArray(value.matches))throw new Error("The league response is incomplete.");
 const players=value.players.map(p=>({id:p.id,name:p.name,nickname:p.nickname,steamId:p.steam_id??undefined,dotaAccountId:p.dota_account_id==null?undefined:String(p.dota_account_id),avatarUrl:p.avatar_url??undefined,createdAt:p.created_at}));
 const matches=value.matches.map(m=>({id:m.id,playedAt:m.played_at,winner:m.winner_team,radiantScore:m.radiant_score??undefined,direScore:m.dire_score??undefined,durationMinutes:m.duration_minutes??undefined,mvpPlayerId:m.mvp_player_id??undefined,runnerUpMvpPlayerId:m.runner_up_mvp_player_id??undefined,dotaMatchId:m.dota_match_id??undefined,updatedAt:m.updated_at,bans:(m.bans??[]).map(b=>({team:b.team,heroId:b.hero_id})),
  participants:m.participants.map(p=>({playerId:p.player_id,team:p.team,heroId:p.hero_id??undefined,kills:p.kills??undefined,deaths:p.deaths??undefined,assists:p.assists??undefined}))}));
 const issue=validateLeague({players,matches}, {allowHistoricalMvp:true});if(issue)throw new Error("Invalid league response: "+issue);
 return {players,matches:sortMatches(matches),settings:value.settings??{name:"Lobby Legends",season:"Season I"}};
}
export function encodePlayer(p:Player){return {id:p.id,name:p.name,nickname:p.nickname,steam_id:p.steamId??null,dota_account_id:p.dotaAccountId??null,avatar_url:p.avatarUrl??null};}
export function encodeMatch(m:LobbyMatch){return {
 ...(m.bans!==undefined?{bans:m.bans.map(b=>({team:b.team,hero_id:b.heroId}))}:{}),id:m.id,played_at:m.playedAt,winner_team:m.winner,radiant_score:m.radiantScore??null,dire_score:m.direScore??null,duration_minutes:m.durationMinutes??null,mvp_player_id:m.mvpPlayerId??null,runner_up_mvp_player_id:m.runnerUpMvpPlayerId??null,dota_match_id:m.dotaMatchId??null,
 participants:m.participants.map(p=>({player_id:p.playerId,team:p.team,...(p.heroId!==undefined?{hero_id:p.heroId}:{}),kills:p.kills??null,deaths:p.deaths??null,assists:p.assists??null}))};}

