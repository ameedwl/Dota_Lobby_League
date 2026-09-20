export type Team = "radiant" | "dire";
export interface Player { id:string; name:string; nickname:string; steamId?:string; avatarUrl?:string; createdAt:string }
export interface MatchPlayer { playerId:string; team:Team; heroId?:number; kills?:number; deaths?:number; assists?:number }
export interface LobbyMatch { id:string; updatedAt?:string; playedAt:string; winner:Team; radiantScore?:number; direScore?:number; durationMinutes?:number; mvpPlayerId?:string|null; runnerUpMvpPlayerId?:string|null; dotaMatchId?:string; participants:MatchPlayer[] }
export interface PlayerStats { player:Player; rank:number; games:number; wins:number; losses:number; winRate:number; currentWinStreak:number; currentLossStreak:number; currentStreak:number; streakType:"W"|"L"|null; bestWinStreak:number; mvps:number; runnerUpMvpCount:number; recentForm:("W"|"L")[] }

