import { heroName } from "./heroes";
import type { Player } from "./types";

export type RewardConfig = "none" | "hero" | "role" | "player_role" | "player" | "random_hero" | "swap" | "random_role";
// Presentation and configuration metadata live here. The migration mirrors only
// keys/configuration/enabled flags; a database test checks that contract.
export const rewardCatalog = [
  {key:"pick_teams",name:"Pick the Teams",icon:"👑",configuration:"none",description:"Choose how players are divided into Radiant and Dire for the next applicable game."},
  {key:"hero_protection",name:"Hero Protection",icon:"🛡️",configuration:"hero",description:"Choose one hero that cannot be banned in the next applicable game."},
  {key:"role_priority",name:"Role Priority",icon:"🎯",configuration:"role",description:"Choose your own position, from 1 to 5, for the next applicable game."},
  {key:"role_commander",name:"Role Commander",icon:"🎭",configuration:"player_role",description:"Choose another player and assign their position for the next applicable game."},
  {key:"self_silence",name:"Self Silence",icon:"🤐",configuration:"none",description:"You must stay muted in Discord for the ENTIRE next applicable game."},
  {key:"silence_someone",name:"Silence Someone",icon:"🔇",configuration:"player",description:"Choose another player who must stay muted in Discord for the ENTIRE next applicable game."},
  {key:"my_teammate",name:"My Teammate",icon:"🤝",configuration:"player",description:"Choose another player who must be on your team in the next applicable game."},
  {key:"not_with_me",name:"Not With Me",icon:"🚫",configuration:"player",description:"Choose another player who must be on the opposite team in the next applicable game."},
  {key:"random_hero_curse",name:"Random Hero Curse",icon:"🎲",configuration:"random_hero",description:"Choose another player. Lobby Legends assigns a random hero they must play. This assigned hero cannot be banned."},
  {key:"team_swap",name:"The Swap",icon:"🔀",configuration:"swap",description:"Choose two distinct players to swap teams after teams are formed. You may select yourself."},
  {key:"role_roulette",name:"Role Roulette",icon:"☠️",configuration:"random_role",description:"Choose another player. Lobby Legends randomly assigns their position, with equal odds from 1 to 5."},
] as const satisfies readonly {key:string;name:string;icon:string;configuration:RewardConfig;description:string}[];
export type RewardKey = typeof rewardCatalog[number]["key"];
export type RewardStatus = "available" | "pending_configuration" | "active" | "used" | "cancelled";
export type RewardDefinition = {key:RewardKey;configuration:RewardConfig;enabled:boolean};
export type Reward = {
  id:string;player_id:string;qualifying_match_id:string|null;qualifying_match_snapshot:string;
  reward_key:RewardKey|null;status:RewardStatus;target_player_id:string|null;
  secondary_target_player_id:string|null;target_role:number|null;target_hero_id:number|null;
  earned_at:string;rolled_at:string|null;activated_at:string|null;used_at:string|null;
  used_match_id:string|null;used_match_snapshot:string|null;cancelled_at:string|null;cancel_reason:string|null;
};
export type RewardSelection = {target_player_id?:string;secondary_target_player_id?:string;target_role?:number;target_hero_id?:number};
export const rewardDefinition = (key:RewardKey|null) => rewardCatalog.find(r => r.key === key);
export const needsPlayer = (config:RewardConfig) => ["player", "player_role", "random_hero", "random_role", "swap"].includes(config);
export const statusLabel:Record<RewardStatus,string> = {available:"Roll available",pending_configuration:"Needs configuration",active:"Active",used:"Used",cancelled:"Cancelled"};
export function rewardInstruction(reward:Reward, players:Player[]):string {
  const name = (id:string|null) => players.find(p => p.id === id)?.nickname ?? "Unknown player";
  const owner = name(reward.player_id), target = name(reward.target_player_id), role = `Position ${reward.target_role}`;
  if (reward.status === "available") return "Earned by reaching three consecutive wins. The roll is final.";
  if (reward.status === "pending_configuration") return rewardDefinition(reward.reward_key)?.description ?? "Configuration required.";
  switch (reward.reward_key) {
    case "pick_teams": return `${owner} chooses the Radiant and Dire teams.`;
    case "hero_protection": return `${heroName(reward.target_hero_id!)} cannot be banned. Protected by ${owner}.`;
    case "role_priority": return `${owner} plays ${role}.`;
    case "role_commander": return `${target} must play ${role}. Ordered by ${owner}.`;
    case "self_silence": return `${owner} must stay muted in Discord for the ENTIRE game.`;
    case "silence_someone": return `${target} must stay muted in Discord for the ENTIRE game. Chosen by ${owner}.`;
    case "my_teammate": return `${target} must be on ${owner}'s team.`;
    case "not_with_me": return `${target} and ${owner} must be on opposite teams.`;
    case "random_hero_curse": return `${target} must play ${heroName(reward.target_hero_id!)}. This assigned hero cannot be banned. Chosen by Lobby Legends; reward owner: ${owner}.`;
    case "team_swap": return `${target} and ${name(reward.secondary_target_player_id)} must swap teams after teams are formed. Reward owner: ${owner}.`;
    case "role_roulette": return `${target} must play ${role}. Chosen by Lobby Legends; reward owner: ${owner}.`;
    default: return "Reward cancelled before rolling.";
  }
}
// Informational only: house rules never block match recording.
export function rewardConflicts(rewards:Reward[]):string[] {
  const active = rewards.filter(r => r.status === "active"), warnings = new Set<string>();
  for (let i=0;i<active.length;i++) for (const b of active.slice(i+1)) {
    const a=active[i], pair=(r:Reward)=>[r.player_id,r.target_player_id].sort().join(":");
    if (pair(a) === pair(b) && new Set([a.reward_key,b.reward_key]).has("my_teammate") && new Set([a.reward_key,b.reward_key]).has("not_with_me")) warnings.add("Conflicting same-team and opposite-team instructions. Resolve these house rules before playing.");
    const rolePlayer=(r:Reward)=>r.reward_key === "role_priority" ? r.player_id : r.target_player_id;
    if (a.target_role && b.target_role && rolePlayer(a) === rolePlayer(b) && a.target_role !== b.target_role) warnings.add("A player has different assigned positions. Resolve these house rules before playing.");
    if (a.reward_key === "random_hero_curse" && b.reward_key === "random_hero_curse" && a.target_player_id === b.target_player_id && a.target_hero_id !== b.target_hero_id) warnings.add("A player has different assigned heroes. Resolve these house rules before playing.");
  }
  return [...warnings];
}
