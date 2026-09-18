"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
type Auth = {user:User|null;isAdmin:boolean;ready:boolean;configured:boolean;error:string;signOut:()=>Promise<string|null>};
const Context=createContext<Auth|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}) {
 const [user,setUser]=useState<User|null>(null),[isAdmin,setAdmin]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState("");
 const client=getSupabase();
 useEffect(()=>{
  if(!client){setReady(true);return;}
  let live=true,version=0,verifiedUserId:string|null=null;
  async function refresh(){
   const request=++version;
   try {
    // Verify identity with Auth; never trust a client-supplied role or user metadata.
    const {data,error:authError}=await client!.auth.getUser();
    if(!live||request!==version)return;
    if(authError)throw authError;
    if(!data.user){verifiedUserId=null;setUser(null);setAdmin(false);setError("");setReady(true);return;}
    if(verifiedUserId&&verifiedUserId!==data.user.id){setUser(null);setAdmin(false);verifiedUserId=null;}
    const result=await client!.from("profiles").select("role").eq("id",data.user.id).maybeSingle();
    if(!live||request!==version)return;
    if(result.error)throw result.error;
    verifiedUserId=data.user.id;
    setUser(data.user);
    setAdmin(result.data?.role==="admin");
    setError("");
    setReady(true);
   } catch {
    if(live&&request===version){setReady(true);setError("Could not verify permissions. Your draft is preserved; reconnect before saving.");}
   }
  }
  // Do not await another Auth call while inside the auth-state callback.
  const {data:{subscription}}=client.auth.onAuthStateChange((event)=>{
   if(event==="SIGNED_OUT"){verifiedUserId=null;version++;setUser(null);setAdmin(false);setReady(true);setError("");}
   else {setTimeout(()=>{if(live)void refresh();},0);}
  });
  const focus=()=>void refresh();
  window.addEventListener("focus",focus);
  const interval=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},60000);
  return ()=>{live=false;subscription.unsubscribe();window.removeEventListener("focus",focus);clearInterval(interval);};
 },[client]);
 async function signOut(){
  if(!client)return null;
  const {error}=await client.auth.signOut({scope:"local"});
  if(error)return "Could not sign out. Please try again.";
  setUser(null);setAdmin(false);return null;
 }
 return <Context.Provider value={{user,isAdmin,ready,configured:!!client,error,signOut}}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("AuthProvider missing");return value;}


