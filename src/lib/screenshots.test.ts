import {describe,it} from "vitest";
import assert from "node:assert/strict";
import {cleanupScreenshots,decodeScreenshots,deleteScreenshot,MAX_SCREENSHOT_BYTES,screenshotPath,uploadScreenshots,validateScreenshotFiles} from "./screenshots";
import type {ScreenshotApi} from "./screenshots";
import type {MatchScreenshot} from "./types";
const matchId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",otherMatch="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const file=(type="image/png",size=30)=>({name:"../../untrusted.png",type,size} as File);
function fixture(slot=1):MatchScreenshot {
 const id=`cccccccc-cccc-4ccc-8ccc-ccccccccccc${slot}`;
 return {id,matchId,storagePath:screenshotPath(matchId,id,"image/png"),sortOrder:slot,createdAt:"2026-09-21T10:00:00Z"};
}
function mock(initial:MatchScreenshot[]=[]) {
 const rows=[...initial],objects=new Set(rows.map(r=>r.storagePath)),pending=new Set<string>();
 let failUpload=false,failInsert=false,failRemove=false,failDelete=false,committedResponseLost=false,exists=true;
 const api:ScreenshotApi={
  async list(id){return rows.filter(r=>r.matchId===id);},async matchExists(){return exists;},
  async prepare(){},
  async upload(path){if(failUpload)throw new Error("Storage upload failed");objects.add(path);},
  async insert(row){if(failInsert)throw new Error("Insert failed");if(rows.some(r=>r.matchId===row.matchId&&r.sortOrder===row.sortOrder))throw new Error("Slot already used");const result={...row,createdAt:"2026-09-21T10:00:00Z"};rows.push(result);if(committedResponseLost)throw new Error("Response lost");return result;},
  async find(id){return rows.find(r=>r.id===id)??null;},
  async deleteRow(id){if(failDelete)throw new Error("Delete denied");const i=rows.findIndex(r=>r.id===id);if(i>=0){pending.add(rows[i].storagePath);rows.splice(i,1);}},
  async discard(path){if(rows.some(r=>r.storagePath===path))return false;pending.add(path);return true;},
  async pending(){return [...pending];},async removeObject(path){if(failRemove)throw new Error("Remove failed");assert.ok(!rows.some(r=>r.storagePath===path));objects.delete(path);},
  async acknowledge(path){if(objects.has(path))return false;pending.delete(path);return true;},publicUrl:path=>"https://example.invalid/"+path,
 };
 return {api,rows,objects,pending,setUploadFailure:()=>failUpload=true,setInsertFailure:()=>failInsert=true,setRemoveFailure:(value:boolean)=>failRemove=value,setDeleteFailure:()=>failDelete=true,setLostResponse:()=>committedResponseLost=true,removeMatch:()=>exists=false};
}
describe("match screenshots",()=>{
 it("validates zero through three slots, MIME type and file size",()=>{
  assert.match(validateScreenshotFiles([],0)!,/Choose/);
  for(let count=0;count<3;count++)assert.equal(validateScreenshotFiles([file()],count),null);
  assert.equal(validateScreenshotFiles([file(),file(),file()],0),null);
  assert.match(validateScreenshotFiles([file()],3)!,/up to 3/);
  for(const type of ["image/gif","image/svg+xml","text/html",""])assert.match(validateScreenshotFiles([file(type)],0)!,/Unsupported/);
  for(const type of ["image/png","image/jpeg","image/webp"])assert.equal(validateScreenshotFiles([file(type,MAX_SCREENSHOT_BYTES)],0),null);
  assert.match(validateScreenshotFiles([file("image/png",MAX_SCREENSHOT_BYTES+1)],0)!,/10 MB/);
  assert.match(validateScreenshotFiles([file("image/png",0)],0)!,/Empty/);
 });
 it("uses safe paths and maps only the correct match in stable slot order",()=>{
  assert.match(screenshotPath(matchId,fixture().id,"image/jpeg"),/\.jpg$/);
  assert.throws(()=>screenshotPath("../escape",fixture().id,"image/png"));
  assert.throws(()=>screenshotPath(matchId,fixture().id,"constructor"));
  const raw=[fixture(3),fixture(1),fixture(2)].map(r=>({id:r.id,match_id:r.matchId,storage_path:r.storagePath,sort_order:r.sortOrder,created_at:r.createdAt}));
  assert.deepEqual(decodeScreenshots([],matchId),[]);
  assert.deepEqual(decodeScreenshots(raw,matchId).map(r=>r.sortOrder),[1,2,3]);
  assert.throws(()=>decodeScreenshots(raw,otherMatch));
  assert.throws(()=>decodeScreenshots([{...raw[0],storage_path:"https://evil.invalid/file"}],matchId));
 });
 it("uploads one, two and three files, then rejects a fourth without uploading",async()=>{
  for(const count of [1,2,3]){
   const m=mock(),saved:MatchScreenshot[]=[],progress:number[]=[];
   await uploadScreenshots(m.api,matchId,Array.from({length:count},()=>file()),r=>saved.push(r),n=>progress.push(n));
   assert.equal(m.rows.length,count);assert.equal(m.objects.size,count);assert.equal(saved.length,count);assert.equal(progress.at(-1),count);
   assert.deepEqual(m.rows.map(r=>r.sortOrder),Array.from({length:count},(_,i)=>i+1));
  }
  const m=mock([fixture(1),fixture(2),fixture(3)]);
  await assert.rejects(uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),/up to 3/);assert.equal(m.objects.size,3);
 });
 it("refuses a missing match and invalid batch before any storage mutation",async()=>{
  const m=mock();m.removeMatch();await assert.rejects(uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),/no longer/);
  assert.equal(m.objects.size,0);await assert.rejects(uploadScreenshots(m.api,matchId,[file(),file("image/gif")],()=>{},()=>{}),/Unsupported/);
 });
 it("creates no database row after upload failure",async()=>{
  const m=mock();m.setUploadFailure();await assert.rejects(uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),/upload failed/);assert.equal(m.rows.length,0);assert.equal(m.objects.size,0);
 });
 it("cleans uploaded objects after insertion failure and retries cleanup failures",async()=>{
  const m=mock();m.setInsertFailure();m.setRemoveFailure(true);
  await assert.rejects(uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),/cleanup is pending/);
  assert.equal(m.rows.length,0);assert.equal(m.objects.size,1);assert.equal(m.pending.size,1);
  m.setRemoveFailure(false);assert.equal(await cleanupScreenshots(m.api),0);assert.equal(m.objects.size,0);assert.equal(m.pending.size,0);
 });
 it("does not delete a successfully committed upload when its response is lost",async()=>{
  const m=mock();m.setLostResponse();await uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{});
  assert.equal(m.rows.length,1);assert.equal(m.objects.size,1);assert.equal(m.pending.size,0);
 });
 it("keeps stable ordering after deletion and fills the first free slot",async()=>{
  const m=mock([fixture(1),fixture(2),fixture(3)]);await deleteScreenshot(m.api,m.rows[1]);
  assert.deepEqual(m.rows.map(r=>r.sortOrder),[1,3]);assert.equal(m.objects.size,2);
  await uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{});assert.equal(m.rows.at(-1)!.sortOrder,2);
 });
 it("never removes an object before a successful row deletion",async()=>{
  const m=mock([fixture()]);m.setDeleteFailure();await assert.rejects(deleteScreenshot(m.api,m.rows[0]),/denied/);assert.equal(m.objects.size,1);assert.equal(m.rows.length,1);
 });
 it("retains durable cleanup after deletion failure and safely retries",async()=>{
  const m=mock([fixture()]);m.setRemoveFailure(true);assert.equal(await deleteScreenshot(m.api,m.rows[0]),1);
  assert.equal(m.rows.length,0);assert.equal(m.objects.size,1);assert.equal(m.pending.size,1);
  m.setRemoveFailure(false);assert.equal(await cleanupScreenshots(m.api),0);assert.equal(m.objects.size,0);
 });
 it("retains earlier successful files if a later upload fails or admin session changes",async()=>{
  const m=mock();await assert.rejects(uploadScreenshots(m.api,matchId,[file(),file()],()=>m.setUploadFailure(),()=>{}),/failed/);
  assert.equal(m.rows.length,1);assert.equal(m.objects.size,1);
  const n=mock();let allowed=true;
  await assert.rejects(uploadScreenshots(n.api,matchId,[file(),file()],()=>{allowed=false;},()=>{},()=>allowed),/session changed/);
  assert.equal(n.rows.length,1);
 });
});

describe("screenshot upload coordination",()=>{
 it("does not send bytes if durable cleanup registration fails",async()=>{
  const m=mock();m.api.prepare=async()=>{throw new Error("Offline");};
  await assert.rejects(uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),/Offline/);
  assert.equal(m.objects.size,0);assert.equal(m.rows.length,0);
 });
 it("concurrent uploaders cannot exceed three slots and the loser cleans its file",async()=>{
  const m=mock([fixture(1),fixture(2)]);
  const results=await Promise.allSettled([uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{}),uploadScreenshots(m.api,matchId,[file()],()=>{},()=>{})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(m.rows.length,3);assert.equal(m.objects.size,3);assert.equal(m.pending.size,0);
 });
});
