"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";
import {AdminGate} from "@/components/admin-gate";
import {PageHeader} from "@/components/ui";
import {useLeague} from "@/lib/store";
function Admin(){
 const {players,matches,settings,updateSettings}=useLeague();
 const [name,setName]=useState(settings.name),[season,setSeason]=useState(settings.season),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function save(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);const issue=await updateSettings({name:name.trim(),season:season.trim()});setMessage(issue??"League settings saved.");setBusy(false);}
 return <><PageHeader eyebrow="Admin session" title="League Management" description="Manage players, match history and basic league settings."/>
 <div className="grid two-col"><section className="panel"><h2>Players · {players.length}</h2><p className="muted">Add competitors or manage existing profiles. Historical participation is protected.</p><Link className="button secondary" href="/players">Manage players</Link></section>
 <section className="panel"><h2>Matches · {matches.length}</h2><p className="muted">Record battles, edit results or delete a match after confirmation.</p><div className="filters"><Link className="button" href="/add-match">Add Match</Link><Link className="button secondary" href="/matches">Manage matches</Link></div></section></div>
 <form className="panel" onSubmit={save} style={{marginTop:20}}><h2>League settings</h2><div className="grid two-col">
 <div className="field"><label htmlFor="league-name">League name</label><input id="league-name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></div>
 <div className="field"><label htmlFor="season">Season label</label><input id="season" required maxLength={80} value={season} onChange={e=>setSeason(e.target.value)}/></div></div>
 {message&&<p role="status">{message}</p>}<button className="button" disabled={busy}>{busy?"Saving…":"Save settings"}</button></form></>;
}
export default function Page(){return <AdminGate><Admin/></AdminGate>;}
