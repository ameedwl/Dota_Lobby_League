"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Menu,Shield,X} from "./icons";
import {useState} from "react";
import {useAuth} from "@/lib/auth";
import {useLeague} from "@/lib/store";
const links=[["/","Home"],["/leaderboard","Leaderboard"],["/matches","Matches"],["/players","Players"],["/stats","Stats"]];
export function Nav(){
 const path=usePathname(),[open,setOpen]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const {user,isAdmin,signOut}=useAuth(),{settings}=useLeague();
 const shown=isAdmin?[...links,["/add-match","Add Match"],["/admin","Admin"]]:links;
 return <><header className={"nav"+(isAdmin?" nav-admin":"")}><Link href="/" className="brand"><span className="brand-mark"><Shield size={25}/></span><span><b>{settings.name.toUpperCase()}</b><small>PRIVATE DOTA LEAGUE</small></span></Link><button className="menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open?<X/>:<Menu/>}</button><nav className={open?"open":""}>
 {shown.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} className={(href==="/"?path===href:path.startsWith(href))?"active":""}>{label}</Link>)}
 {user?<button className="nav-auth" disabled={busy} onClick={async()=>{setBusy(true);const issue=await signOut();setError(issue??"");setBusy(false);setOpen(false);}}>{busy?"Signing out…":"Logout"}</button>:<Link href="/login" className={path==="/login"?"active":""} onClick={()=>setOpen(false)}>Login</Link>}
 </nav></header>{error&&<p className="alert" role="alert">{error}</p>}</>;
}
