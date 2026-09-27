"use client";
import { createContext,useCallback,useContext,useEffect,useRef,useState } from "react";
import { cleanupScreenshotFiles } from "./screenshots";
import { LobbyMatch,Player } from "./types";
import { LeagueData } from "./league";
import { existingDotaMatch, validDotaAccountId } from "./opendota";
import { validateMatch } from "./stats";
import { useAuth } from "./auth";
import { backendError,getSupabase } from "./supabase";
import { decodeSnapshot,encodeMatch,encodePlayer,LeagueSettings } from "./backend";
type Store=LeagueData&{ready:boolean;hasSnapshot:boolean;error:string;settings:LeagueSettings;refresh:()=>Promise<boolean>;
 addMatch:(m:LobbyMatch)=>Promise<string|null>;updateMatch:(m:LobbyMatch)=>Promise<string|null>;deleteMatch:(id:string)=>Promise<string|null>;
 addPlayer:(p:Player)=>Promise<string|null>;updatePlayer:(p:Player)=>Promise<string|null>;deletePlayer:(id:string)=>Promise<string|null>;
 updateSettings:(s:LeagueSettings)=>Promise<string|null>};
const C=createContext<Store|null>(null);
export function LeagueProvider({children}:{children:React.ReactNode}){
 const auth=useAuth(),client=getSupabase();
 const [data,setData]=useState<LeagueData>({players:[],matches:[]}),[settings,setSettings]=useState<LeagueSettings>({name:"Lobby Legends",season:"Season I"});
 const [hasSnapshot,setHasSnapshot]=useState(false);
 const [ready,setReady]=useState(false),[error,setError]=useState("");
 const request=useRef(0),busy=useRef(false);
 const refresh=useCallback(async()=>{
  if(!client){setReady(true);setError("Shared league is not configured yet. Complete the Supabase setup in README.");return false;}
  const version=++request.current;
  try{
   const result=await client.rpc("league_snapshot");
   if(result.error)throw result.error;
   const next=decodeSnapshot(result.data);
   if(version===request.current){setHasSnapshot(true);setData(next);setSettings(next.settings);setReady(true);setError("");}
   return true;
  }catch(e){
   if(version===request.current){setReady(true);setError(backendError(e as {message:string;code?:string}));}
   return false;
  }
 },[client]);
 useEffect(()=>{
  void refresh();
  const focus=()=>void refresh();
  window.addEventListener("focus",focus);
  // Read-only polling shares changes across browsers without requiring Realtime setup.
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);
  return ()=>{window.removeEventListener("focus",focus);clearInterval(interval);};
 },[refresh]);
 // Retry queued object deletion even after navigating away from a deleted match.
 useEffect(()=>{
  if(!client||!auth.ready||!auth.isAdmin||auth.error)return;
  const cleanup=()=>{void cleanupScreenshotFiles(client).catch(()=>{/* Durable queue retries on the next admin sync. */});};
  cleanup();const interval=setInterval(()=>{if(document.visibilityState==="visible")cleanup();},15000);
  window.addEventListener("focus",cleanup);
  return()=>{clearInterval(interval);window.removeEventListener("focus",cleanup);};
 },[client,auth.ready,auth.isAdmin,auth.error]);
 async function write(operation:()=>PromiseLike<{error:{message:string;code?:string}|null;data?:unknown}>,expectRow=false){
  if(!client||!auth.ready||!auth.isAdmin)return "Only the league administrator can make changes.";
  if(auth.error)return auth.error;
  if(busy.current)return "Another change is being saved. Please wait.";
  busy.current=true;
  try{
   const result=await operation();
   if(result.error)return backendError(result.error);
   if(expectRow&&(!Array.isArray(result.data)||result.data.length===0))return "The record changed or you no longer have permission. Refresh before trying again.";
   const refreshed=await refresh();
   if(!refreshed)setError("Saved to Supabase, but the refreshed league could not be loaded. Refresh the page to view current statistics.");
   return null;
  }catch(e){return backendError(e as {message:string;code?:string});}finally{busy.current=false;}
 }
 const saveMatch=(m:LobbyMatch,create:boolean)=>{
  if(existingDotaMatch(data.matches,m.dotaMatchId??"",m.id))return Promise.resolve("This Dota match has already been imported.");
  const issue=validateMatch(m,data.players);
  if(issue)return Promise.resolve(issue);
  return write(()=>client!.rpc("save_match",{p_match:encodeMatch(m),p_create:create,p_expected_updated_at:m.updatedAt??null}));
 };
 const savePlayer=(p:Player,create:boolean)=>{
  if(p.dotaAccountId!==undefined&&!validDotaAccountId(p.dotaAccountId))return Promise.resolve("Enter a valid Dota Account ID (Steam32).");
  if(p.dotaAccountId&&data.players.some(other=>other.id!==p.id&&other.dotaAccountId===p.dotaAccountId))return Promise.resolve("This Dota Account ID is already assigned to another player.");
  return write(()=>create?client!.from("players").insert(encodePlayer(p)).select("id"):client!.from("players").update(encodePlayer(p)).eq("id",p.id).select("id"),true);
 };
 return <C.Provider value={{...data,settings,ready,hasSnapshot,error,refresh,
  addMatch:m=>saveMatch(m,true),updateMatch:m=>saveMatch(m,false),
  deleteMatch:async id=>{const issue=await write(()=>client!.from("matches").delete().eq("id",id).select("id"),true);if(!issue&&client)void cleanupScreenshotFiles(client).catch(()=>{});return issue;},
  addPlayer:p=>savePlayer(p,true),
  updatePlayer:p=>savePlayer(p,false),
  deletePlayer:id=>write(()=>client!.from("players").delete().eq("id",id).select("id"),true),
  updateSettings:s=>write(()=>client!.from("league_settings").update(s).eq("id",true).select("id"),true)
 }}>{children}</C.Provider>;
}
export function useLeague(){const c=useContext(C);if(!c)throw new Error("LeagueProvider missing");return c;}


