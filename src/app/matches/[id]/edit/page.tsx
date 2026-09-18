"use client";
import {useState} from "react";
import {AdminGate} from "@/components/admin-gate";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLeague } from "@/lib/store";
import { MatchForm } from "@/components/match-form";
import { PageHeader } from "@/components/ui";
function EditMatchDraft({id}:{id:string}) {
  const { matches } = useLeague();
  const [match] = useState(() => matches.find(m => m.id === id));
  if (!match) return <div className="empty">Match not found. <Link href="/matches">Back to history</Link></div>;
  return <><PageHeader eyebrow={"Battle record · " + id} title="Edit Match" description="Changes to this battle will recalculate standings, streaks, records and player histories."/><MatchForm key={match.id} match={match}/></>;
}


export default function Page(){const {id}=useParams<{id:string}>();return <AdminGate><EditMatchDraft key={id} id={id}/></AdminGate>;}
