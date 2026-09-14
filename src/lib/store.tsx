"use client";
import { createContext,useContext,useEffect,useState } from "react";
import { seedMatches,seedPlayers } from "./fixtures";
import { LobbyMatch,Player } from "./types";
type Store={players:Player[];matches:LobbyMatch[];ready:boolean;addMatch:(m:LobbyMatch)=>void;addPlayer:(p:Player)=>void;updatePlayer:(p:Player)=>void;deletePlayer:(id:string)=>boolean};
const C=createContext<Store|null>(null);
export function LeagueProvider({children}:{children:React.ReactNode}){const [players,setPlayers]=useState(seedPlayers),[matches,setMatches]=useState(seedMatches),[ready,setReady]=useState(false);
 useEffect(()=>{try{const p=localStorage.getItem("ll-players"),m=localStorage.getItem("ll-matches");if(p)setPlayers(JSON.parse(p));if(m)setMatches(JSON.parse(m));}finally{setReady(true)}},[]);
 useEffect(()=>{if(ready){localStorage.setItem("ll-players",JSON.stringify(players));localStorage.setItem("ll-matches",JSON.stringify(matches))}},[players,matches,ready]);
 return <C.Provider value={{players,matches,ready,addMatch:m=>setMatches(x=>[m,...x]),addPlayer:p=>setPlayers(x=>[...x,p]),updatePlayer:p=>setPlayers(x=>x.map(y=>y.id===p.id?p:y)),deletePlayer:id=>{if(matches.some(m=>m.participants.some(p=>p.playerId===id)))return false;setPlayers(x=>x.filter(p=>p.id!==id));return true}}}>{children}</C.Provider>}
export function useLeague(){const c=useContext(C);if(!c)throw new Error("LeagueProvider missing");return c}
