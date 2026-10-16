import type {Player} from "./types";
export const birthdayEvent = {
 id:"lung-birthday-2026", type:"birthday", title:"LUNG", subtitle:"MONSIEUR LE PRÉSIDENT",
 start:"2026-10-16T17:17:40Z", end:"2026-10-19T17:17:40Z",
 // Set only to an existing player UUID if identity resolution is ambiguous.
 playerId:"", audio:"/events/lung-birthday/lung-birthday.mp3", introEnabled:true,
} as const;
export type RerollCredit={id:string;player_id:string;source_key:string;label:string;remaining_uses:number;used_at:string|null;used_reward_id:string|null};
export function eventActive(now:number,event:{start:string;end:string}=birthdayEvent){return now>=Date.parse(event.start)&&now<Date.parse(event.end);}
export function eventPlayer(players:Player[],configuredId:string=birthdayEvent.playerId){
 if(configuredId)return players.find(p=>p.id===configuredId);
 const found=players.filter(p=>[p.name,p.nickname].some(n=>["lung","hermes"].includes(n.trim().toLowerCase())));
 return found.length===1?found[0]:undefined;
}
export function countdown(now:number){const minutes=Math.max(0,Math.ceil((Date.parse(birthdayEvent.end)-now)/60000));return Math.floor(minutes/1440)+"D "+Math.floor(minutes%1440/60)+"H "+minutes%60+"M";}
export function birthdayChance(active:boolean,previous:boolean,random:number){return active&&!previous&&random<0.09;}
