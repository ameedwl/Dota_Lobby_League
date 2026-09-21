// The Storage tables here are a minimal test stand-in. No live Storage API or project is contacted.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
export async function testScreenshots({db,role,test,admin,viewer,matchId}) {
 const code=value=>error=>error.code===value;
 const path=id=>`matches/${matchId}/${id}.png`;
 const ids=Array.from({length:6},()=>randomUUID());
 const upload=(who,id)=>role(who,tx=>tx.query("insert into storage.objects(bucket_id,name) values('match-screenshots',$1) returning id",[path(id)]));
 const insert=(who,id,slot)=>role(who,tx=>tx.query("insert into public.match_screenshots(id,match_id,storage_path,sort_order) values($1,$2,$3,$4)",[id,matchId,path(id),slot]));
 await test("screenshot bucket is public with exact MIME and 10 MB restrictions",async()=>{
  const bucket=(await db.query("select * from storage.buckets where id='match-screenshots'")).rows[0];
  assert.equal(bucket.public,true);assert.equal(Number(bucket.file_size_limit),10485760);
  assert.deepEqual(bucket.allowed_mime_types,["image/jpeg","image/png","image/webp"]);
 });
 await test("historical matches start with zero screenshot rows",async()=>{assert.equal((await db.query("select * from public.match_screenshots")).rows.length,0);});
 // Simulate an unrelated permissive policy. Restrictive bucket guards must still hold.
 await db.exec("create policy test_unrelated_storage_policy on storage.objects for all to anon,authenticated using (true) with check (true)");
 for(const who of ["anon",viewer]) {
  await test(who+" cannot upload to screenshot Storage or insert metadata",async()=>{
   await assert.rejects(upload(who,ids[0]),code("42501"));
   await assert.rejects(insert(who,ids[0],1),code("42501"));
  });
  await test(who+" cannot invoke screenshot cleanup RPCs",async()=>{
   await assert.rejects(role(who,tx=>tx.query("select public.prepare_screenshot_upload($1)",[path(ids[0])])),code("42501"));
   await assert.rejects(role(who,tx=>tx.query("select public.discard_screenshot_upload($1)",[path(ids[0])])),code("42501"));
   await assert.rejects(role(who,tx=>tx.query("select public.complete_screenshot_cleanup($1)",[path(ids[0])])),code("42501"));
  });
 }
 await test("admin can upload and attach one, two and three ordered screenshots",async()=>{
  for(let i=0;i<3;i++){
   await role(admin,tx=>tx.query("select public.prepare_screenshot_upload($1)",[path(ids[i])]));
   await upload(admin,ids[i]);await insert(admin,ids[i],i+1);
   assert.equal((await db.query("select * from public.screenshot_cleanup where storage_path=$1",[path(ids[i])])).rows.length,0);
   assert.equal((await db.query("select * from public.match_screenshots where match_id=$1",[matchId])).rows.length,i+1);
  }
  const rows=(await role("anon",tx=>tx.query("select * from public.match_screenshots where match_id=$1 order by sort_order",[matchId]))).rows;
  assert.deepEqual(rows.map(r=>r.id),ids.slice(0,3));assert.ok(rows.every(r=>r.match_id===matchId));
 });
 await test("fourth screenshot is impossible via an extra slot or duplicate slot",async()=>{
  await upload(admin,ids[3]);
  await assert.rejects(insert(admin,ids[3],4),code("23514"));
  await assert.rejects(insert(admin,ids[3],1),code("23505"));
  assert.equal((await db.query("select * from public.match_screenshots where match_id=$1",[matchId])).rows.length,3);
 });
 await test("phantom objects, unsafe paths and unrelated match paths are rejected",async()=>{
  await assert.rejects(insert(admin,ids[4],1),code("23514"));
  await assert.rejects(role(admin,tx=>tx.query("insert into storage.objects(bucket_id,name) values('match-screenshots','../evil.svg')")),code("42501"));
  await assert.rejects(role(admin,tx=>tx.query("insert into storage.objects(bucket_id,name) values('match-screenshots',$1)",[`matches/ffffffff-ffff-4fff-8fff-ffffffffffff/${ids[4]}.png`])),code("42501"));
  await assert.rejects(role(admin,tx=>tx.query("insert into public.match_screenshots(id,match_id,storage_path,sort_order) values($1,$2,$3,1)",[ids[4],matchId,path(ids[3])])),code("23514"));
 });
 await test("public/viewer users can read screenshot metadata and Storage objects",async()=>{
  for(const who of ["anon",viewer]) {
   assert.equal((await role(who,tx=>tx.query("select * from public.match_screenshots where match_id=$1",[matchId]))).rows.length,3);
   assert.ok((await role(who,tx=>tx.query("select * from storage.objects where bucket_id='match-screenshots'"))).rows.length>=3);
  }
 });
 for(const who of ["anon",viewer]) {
  await test(who+" cannot delete/replace files or delete screenshot metadata",async()=>{
   assert.equal((await role(who,tx=>tx.query("delete from storage.objects where bucket_id='match-screenshots' returning id"))).rows.length,0);
   assert.equal((await role(who,tx=>tx.query("update storage.objects set metadata='{}' where bucket_id='match-screenshots' returning id"))).rows.length,0);
   if(who==="anon")await assert.rejects(role(who,tx=>tx.query("delete from public.match_screenshots returning id")),code("42501"));
   else assert.equal((await role(who,tx=>tx.query("delete from public.match_screenshots returning id"))).rows.length,0);
  });
 }
 await test("only admin can replace an object; live attachment cannot be deleted first",async()=>{
  assert.equal((await role(admin,tx=>tx.query("update storage.objects set metadata='{}' where name=$1 returning id",[path(ids[0])]))).rows.length,1);
  assert.equal((await role(admin,tx=>tx.query("delete from storage.objects where name=$1 returning id",[path(ids[0])]))).rows.length,0);
  assert.equal((await role(admin,tx=>tx.query("select public.discard_screenshot_upload($1) as result",[path(ids[0])]))).rows[0].result,false);
 });
 await test("row deletion queues bytes until Storage removal succeeds",async()=>{
  await role(admin,tx=>tx.query("delete from public.match_screenshots where id=$1",[ids[0]]));
  assert.equal((await role(admin,tx=>tx.query("select public.complete_screenshot_cleanup($1) as result",[path(ids[0])]))).rows[0].result,false);
  await assert.rejects(insert(admin,ids[0],1),code("23514"));
  assert.equal((await role(admin,tx=>tx.query("delete from storage.objects where name=$1 returning id",[path(ids[0])]))).rows.length,1);
  assert.equal((await role(admin,tx=>tx.query("select public.complete_screenshot_cleanup($1) as result",[path(ids[0])]))).rows[0].result,true);
  assert.equal((await db.query("select * from public.screenshot_cleanup where storage_path=$1",[path(ids[0])])).rows.length,0);
 });
 await test("abandoned uploads retain delayed cleanup and are protected until the grace period ends",async()=>{
  await role(admin,tx=>tx.query("select public.prepare_screenshot_upload($1)",[path(ids[5])]));
  await upload(admin,ids[5]);
  assert.equal((await role(admin,tx=>tx.query("select public.complete_screenshot_cleanup($1) as result",[path(ids[5])]))).rows[0].result,false);
  assert.equal((await role(admin,tx=>tx.query("delete from storage.objects where name=$1 returning id",[path(ids[5])]))).rows.length,0);
  await db.query("update public.screenshot_cleanup set cleanup_after=now()-interval '1 second' where storage_path=$1",[path(ids[5])]);
  await assert.rejects(insert(admin,ids[5],1),code("23514"));
  assert.equal((await role(admin,tx=>tx.query("delete from storage.objects where name=$1 returning id",[path(ids[5])]))).rows.length,1);
  assert.equal((await role(admin,tx=>tx.query("select public.complete_screenshot_cleanup($1) as result",[path(ids[5])]))).rows[0].result,true);
 });
 await test("failed uploads can queue cleanup, but viewer cannot inspect cleanup paths",async()=>{
  await role(admin,tx=>tx.query("select public.discard_screenshot_upload($1)",[path(ids[3])]));
  assert.equal((await role(viewer,tx=>tx.query("select * from public.screenshot_cleanup"))).rows.length,0);
  await assert.rejects(role("anon",tx=>tx.query("select * from public.screenshot_cleanup")),code("42501"));
  await assert.rejects(role(admin,tx=>tx.query("select public.discard_screenshot_upload('../evil')")),code("23514"));
 });
 await test("match deletion cascades screenshot rows and retains cleanup for every object",async()=>{
  await role(admin,tx=>tx.query("delete from public.matches where id=$1",[matchId]));
  assert.equal((await db.query("select * from public.match_screenshots where match_id=$1",[matchId])).rows.length,0);
  const queue=(await role(admin,tx=>tx.query("select storage_path from public.screenshot_cleanup"))).rows.map(r=>r.storage_path);
  assert.ok(queue.includes(path(ids[1])));assert.ok(queue.includes(path(ids[2])));
  assert.equal((await role(admin,tx=>tx.query("delete from storage.objects where name=$1 returning id",[path(ids[1])]))).rows.length,1);
 });
 await test("screenshot guards do not change unrelated bucket permissions",async()=>{
  await db.exec("insert into storage.buckets(id,name,public) values('other','other',false)");
  await role("anon",tx=>tx.query("insert into storage.objects(bucket_id,name) values('other','test')"));
  assert.equal((await role("anon",tx=>tx.query("delete from storage.objects where bucket_id='other' returning id"))).rows.length,1);
 });
 await db.exec("drop policy test_unrelated_storage_policy on storage.objects");
}
