import {test} from "vitest";
import assert from "node:assert/strict";
import {milestoneProgress,groupAvailableRewards,rewardSourceLabel,rewardCatalog,rewardConflicts,rewardInstruction,type Reward} from "./rewards";
import type {Player} from "./types";
const players:Player[]=["A","B","C"].map(id=>({id,name:id,nickname:id,createdAt:"2026-01-01"}));
const base:Reward={id:"r",player_id:"A",qualifying_match_id:"m",qualifying_match_snapshot:"m",reward_key:"self_silence",status:"active",target_player_id:null,secondary_target_player_id:null,target_role:null,target_hero_id:null,earned_at:"2026-10-04",rolled_at:"2026-10-04",activated_at:"2026-10-04",used_at:null,used_match_id:null,used_match_snapshot:null,cancelled_at:null,cancel_reason:null};
test("reward catalog has eleven stable unique definitions with no rarity or weights",()=>{
  assert.equal(rewardCatalog.length,11);assert.equal(new Set(rewardCatalog.map(r=>r.key)).size,11);
  for(const r of rewardCatalog){assert.ok(r.description&&r.icon&&r.configuration);assert.ok(!("weight" in r));assert.ok(!("rarity" in r));}
});
test("reward instructions identify owner, targets, roles and protected random heroes",()=>{
  assert.match(rewardInstruction(base,players),/A.*ENTIRE game/);
  assert.match(rewardInstruction({...base,reward_key:"silence_someone",target_player_id:"B"},players),/B.*ENTIRE game.*A/);
  assert.match(rewardInstruction({...base,reward_key:"random_hero_curse",target_player_id:"B",target_hero_id:97},players),/B.*Magnus.*cannot be banned.*owner: A/);
  assert.match(rewardInstruction({...base,reward_key:"role_roulette",target_player_id:"B",target_role:5},players),/B.*Position 5.*Lobby Legends.*A/);
  assert.match(rewardInstruction({...base,reward_key:"team_swap",target_player_id:"B",secondary_target_player_id:"C"},players),/B and C.*swap teams.*A/);
});
test("house rule conflict warnings handle reversed pairs and ignore used rewards",()=>{
  const a={...base,reward_key:"my_teammate" as const,target_player_id:"B"};
  const b={...base,id:"other",reward_key:"not_with_me" as const,player_id:"B",target_player_id:"A"};
  assert.equal(rewardConflicts([a,b]).length,1);
  assert.equal(rewardConflicts([a,{...b,status:"used"}]).length,0);
  assert.equal(rewardConflicts([{...base,reward_key:"role_priority",target_role:3},{...base,id:"role",reward_key:"role_commander",player_id:"B",target_player_id:"A",target_role:4}]).length,1);
  assert.equal(rewardConflicts([{...base,reward_key:"random_hero_curse",target_player_id:"B",target_hero_id:1},{...base,id:"curse",reward_key:"random_hero_curse",target_player_id:"B",target_hero_id:2}]).length,1);
});


test("next reward milestone advances after every positive multiple of three",()=>{
 for(let n=0;n<=18;n++){
  const p=milestoneProgress(n);assert.equal(p.nextMilestone,(Math.floor(n/3)+1)*3);assert.equal(p.winsNeeded,p.nextMilestone-n);assert.equal(p.reached,n>0&&n%3===0);
 }
 assert.deepEqual(milestoneProgress(5),{nextMilestone:6,winsNeeded:1,reached:false});
 assert.deepEqual(milestoneProgress(6),{nextMilestone:9,winsNeeded:3,reached:true});
});
test("available rolls group independently by owner and preserve milestone/source labels",()=>{
 const records:Reward[]=[{...base,id:"6",status:"available",streak_milestone:6},{...base,id:"3",status:"available",streak_milestone:3},{...base,id:"used",status:"used"},{...base,id:"grant",player_id:"B",source_type:"ADMIN_GRANT",streak_milestone:null,qualifying_match_snapshot:null,status:"available"}];
 const groups=groupAvailableRewards(records);assert.equal(groups.length,2);assert.equal(groups[0].length,2);assert.equal(groups[0][0].id,"3");
 assert.equal(rewardSourceLabel(groups[0][1]),"6-win streak");assert.equal(rewardSourceLabel(groups[1][0]),"Admin grant");
 assert.match(rewardInstruction(groups[1][0],players),/does not change your reward streak/);
});
