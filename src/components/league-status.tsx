"use client";
import {useLeague} from "@/lib/store";
import {usePathname} from "next/navigation";
export function LeagueStatus({children}:{children:React.ReactNode}){
 const {ready,hasSnapshot,error,refresh}=useLeague(),path=usePathname();
 if(path==="/login")return <>{children}</>;
 if(!ready)return <div className="empty" role="status">Loading league history…</div>;
 if(error&&!hasSnapshot)return <div className="empty"><p role="alert">{error}</p><button className="button secondary" onClick={()=>void refresh()}>Retry</button></div>;
 return <>{error&&<div className="alert" role="alert">{error} <button type="button" className="button secondary" onClick={()=>void refresh()}>Retry</button></div>}{children}</>;
}

