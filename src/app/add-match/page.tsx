"use client";
import {AdminGate} from "@/components/admin-gate";
import { MatchForm } from "@/components/match-form";
import { PageHeader } from "@/components/ui";
export default function Page() {
  return <AdminGate><><PageHeader eyebrow="Record a battle" title="Add Match" description="Assemble two complete squads, declare the victor, and commit the battle to league history."/><MatchForm/></></AdminGate>;
}

