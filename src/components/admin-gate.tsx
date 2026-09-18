"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
export function AdminGate({children}:{children:React.ReactNode}){
 const {ready,isAdmin,user,configured,error}=useAuth();
 if(!configured)return <div className="empty">Supabase setup is required before signing in.</div>;
 if(!ready)return <div className="empty" role="status">Checking permissions…</div>;
 if(!isAdmin)return <div className="empty"><h1>Administrator access required</h1><p>{user?"Your account has read-only access.":"Sign in with the league administrator account to manage the league."}</p><Link className="button secondary" href={user?"/":"/login"}>{user?"View league":"Login"}</Link></div>;
 return <>{error&&<div className="alert" role="alert">{error}</div>}{children}</>;
}

