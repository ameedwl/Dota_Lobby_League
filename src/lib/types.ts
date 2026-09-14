export type Team = "radiant" | "dire";
export interface Player { id:string; name:string; nickname:string; steamId?:string; avatarUrl?:string; createdAt:string }
export interface MatchPlayer { playerId:string; team:Team; heroId?:number; kills?:number; deaths?:number; assists?:number }
export interface LobbyMatch { id:string; playedAt:string; winner:Team; radiantScore?:number; direScore?:number; durationMinutes?:number; mvpPlayerId?:string; dotaMatchId?:string; participants:MatchPlayer[] }
export interface PlayerStats { player:Player; games:number; wins:number; losses:number; winRate:number; currentStreak:number; streakType:"W"|"L"|null; bestWinStreak:number; mvps:number; recentForm:("W"|"L")[] }
