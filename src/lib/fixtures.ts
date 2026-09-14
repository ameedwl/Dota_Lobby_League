import { LobbyMatch, Player } from "./types";
const names = [["Kael Voss","EMBER"],["Mira Vale","HEX"],["Orin Black","RELIC"],["Nyx Arden","NIGHTFALL"],["Rook Sable","WARDEN"],["Lyra Ash","ECHO"],["Talon Rime","FROST"],["Vex Rowan","RAVEN"],["Iris Thorn","ORACLE"],["Cinder Knox","FORGE"]];
export const seedPlayers:Player[]=names.map(([name,nickname],i)=>({id:`p${i+1}`,name,nickname,createdAt:"2026-01-01T00:00:00Z"}));
const lineups=[
 [[1,2,3,4,5],[6,7,8,9,10],"radiant",42,31,1],[[1,3,6,8,10],[2,4,5,7,9],"dire",28,39,7],
 [[2,3,5,7,10],[1,4,6,8,9],"radiant",51,44,3],[[1,2,6,7,9],[3,4,5,8,10],"dire",33,45,8],
 [[1,4,5,7,8],[2,3,6,9,10],"radiant",37,22,4],[[2,4,6,8,10],[1,3,5,7,9],"dire",30,36,5],
 [[1,2,5,9,10],[3,4,6,7,8],"radiant",48,40,9],[[3,4,5,6,9],[1,2,7,8,10],"dire",25,41,2],
 [[1,3,4,7,10],[2,5,6,8,9],"radiant",43,38,10],[[2,3,5,8,9],[1,4,6,7,10],"dire",32,47,6]
] as const;
export const seedMatches:LobbyMatch[]=lineups.map((x,i)=>({id:`LL-${String(1042+i).padStart(4,"0")}`,playedAt:new Date(Date.UTC(2026,8,12-i*3,19,30)).toISOString(),winner:x[2],radiantScore:x[3],direScore:x[4],durationMinutes:37+i,mvpPlayerId:`p${x[5]}`,dotaMatchId:`84920${120+i}`,participants:[...x[0].map(playerId=>({playerId:`p${playerId}`,team:"radiant" as const})),...x[1].map(playerId=>({playerId:`p${playerId}`,team:"dire" as const}))]}));
