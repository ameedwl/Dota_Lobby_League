import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchScreenshot } from "./types";

export const SCREENSHOT_BUCKET = "match-screenshots";
export const MAX_SCREENSHOTS = 3;
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const extensions: Record<string, string> = {"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp"};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateScreenshotFiles(files: Pick<File,"type"|"size">[], existingCount: number): string | null {
  if (!files.length) return "Choose at least one screenshot.";
  if (files.length + existingCount > MAX_SCREENSHOTS) return "Each match supports up to 3 screenshots. Remove one before adding more.";
  for (const file of files) {
    if (!SCREENSHOT_TYPES.some(type => type === file.type)) return "Unsupported file type. Choose JPEG, PNG or WebP images.";
    if (file.size > MAX_SCREENSHOT_BYTES) return "Each screenshot must be 10 MB or smaller.";
    if (file.size <= 0) return "Empty files cannot be uploaded.";
  }
  return null;
}
export function screenshotPath(matchId: string, id: string, mime: string): string {
  if (!uuid.test(matchId) || !uuid.test(id) || !Object.hasOwn(extensions,mime)) throw new Error("Invalid screenshot path or type.");
  return `matches/${matchId}/${id}.${extensions[mime]}`;
}
export function decodeScreenshots(raw: unknown, matchId: string): MatchScreenshot[] {
  if (!Array.isArray(raw)) throw new Error("Screenshot list is unavailable.");
  return raw.map(row => {
    if (!row || row.match_id !== matchId || !uuid.test(row.id) || !Number.isInteger(row.sort_order) || row.sort_order < 1 || row.sort_order > 3 ||
        typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at)) ||
        !Object.keys(extensions).some(type => row.storage_path === screenshotPath(matchId,row.id,type))) throw new Error("Invalid screenshot record.");
    return {id:row.id,matchId:row.match_id,storagePath:row.storage_path,sortOrder:row.sort_order,createdAt:row.created_at};
  }).sort((a,b) => a.sortOrder-b.sortOrder || a.id.localeCompare(b.id));
}
export interface ScreenshotApi {
  list(matchId: string): Promise<MatchScreenshot[]>;
  matchExists(matchId: string): Promise<boolean>;
  prepare(path: string): Promise<void>;
  upload(path: string, file: File): Promise<void>;
  insert(row: Omit<MatchScreenshot,"createdAt">): Promise<MatchScreenshot>;
  find(id: string, matchId: string): Promise<MatchScreenshot | null>;
  deleteRow(id: string, matchId: string): Promise<void>;
  discard(path: string): Promise<boolean>;
  pending(): Promise<string[]>;
  removeObject(path: string): Promise<void>;
  acknowledge(path: string): Promise<boolean>;
  publicUrl(path: string): string;
}
function check(error: {message?:string;code?:string} | null) {
  if (!error) return;
  if (error.code === "23505") throw new Error("Screenshot slots changed in another session. Refresh and try again (maximum 3).");
  if (error.code === "23503") throw new Error("This match no longer exists.");
  if (error.code === "42501") throw new Error("Only the league administrator can manage screenshots.");
  throw new Error(error.message || "Screenshot service is unavailable.");
}
export function screenshotApi(client: SupabaseClient): ScreenshotApi {
  const bucket = client.storage.from(SCREENSHOT_BUCKET);
  const fields = "id,match_id,storage_path,sort_order,created_at";
  return {
    async list(matchId) { const r=await client.from("match_screenshots").select(fields).eq("match_id",matchId).order("sort_order");check(r.error);return decodeScreenshots(r.data,matchId); },
    async matchExists(matchId) { const r=await client.from("matches").select("id").eq("id",matchId).maybeSingle();check(r.error);return !!r.data; },
    async prepare(path) { const r=await client.rpc("prepare_screenshot_upload",{p_path:path});check(r.error); },
    async upload(path,file) { const r=await bucket.upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});check(r.error); },
    async insert(row) { const r=await client.from("match_screenshots").insert({id:row.id,match_id:row.matchId,storage_path:row.storagePath,sort_order:row.sortOrder}).select(fields).single();check(r.error);return decodeScreenshots([r.data],row.matchId)[0]; },
    async find(id,matchId) { const r=await client.from("match_screenshots").select(fields).eq("id",id).eq("match_id",matchId).maybeSingle();check(r.error);return r.data?decodeScreenshots([r.data],matchId)[0]:null; },
    async deleteRow(id,matchId) { const r=await client.from("match_screenshots").delete().eq("id",id).eq("match_id",matchId).select("id");check(r.error);if(!r.data?.length && await this.find(id,matchId))throw new Error("Screenshot could not be removed. Check your administrator session."); },
    async discard(path) { const r=await client.rpc("discard_screenshot_upload",{p_path:path});check(r.error);return r.data===true; },
    async pending() { const r=await client.from("screenshot_cleanup").select("storage_path").lte("cleanup_after",new Date().toISOString()).order("created_at").limit(100);check(r.error);return (r.data??[]).map(r=>r.storage_path as string); },
    async removeObject(path) { const r=await bucket.remove([path]);check(r.error); },
    async acknowledge(path) { const r=await client.rpc("complete_screenshot_cleanup",{p_path:path});check(r.error);return r.data===true; },
    publicUrl(path) { return bucket.getPublicUrl(path).data.publicUrl; },
  };
}
export async function cleanupScreenshots(api: ScreenshotApi): Promise<number> {
  let pending = 0;
  for (const path of await api.pending()) {
    try { await api.removeObject(path); if (!await api.acknowledge(path)) pending++; }
    catch { pending++; }
  }
  return pending;
}
// Coalesce provider and explicit retry requests. Cleanup is idempotent.
const cleanupRequests = new WeakMap<SupabaseClient,Promise<number>>();
export function cleanupScreenshotFiles(client: SupabaseClient): Promise<number> {
  const current=cleanupRequests.get(client);if(current)return current;
  const promise=cleanupScreenshots(screenshotApi(client)).finally(()=>cleanupRequests.delete(client));
  cleanupRequests.set(client,promise);return promise;
}
export async function uploadScreenshots(api: ScreenshotApi, matchId: string, files: File[], onSaved: (row: MatchScreenshot)=>void,
  onProgress: (completed:number,total:number)=>void, canContinue: ()=>boolean = ()=>true): Promise<void> {
  const basic=validateScreenshotFiles(files,0);if(basic)throw new Error(basic);
  if (!await api.matchExists(matchId)) throw new Error("This match no longer exists.");
  const current=await api.list(matchId);
  const issue=validateScreenshotFiles(files,current.length);if(issue)throw new Error(issue);
  const used=new Set(current.map(row=>row.sortOrder));
  for (let i=0;i<files.length;i++) {
    if (!canContinue()) throw new Error("Upload stopped because your administrator session changed.");
    const id=crypto.randomUUID(),storagePath=screenshotPath(matchId,id,files[i].type);
    const sortOrder=[1,2,3].find(slot=>!used.has(slot))!;
    let row: MatchScreenshot;
    onProgress(i,files.length);
    await api.prepare(storagePath);
    try {
      await api.upload(storagePath,files[i]);
      if (!canContinue()) throw new Error("Upload stopped because your administrator session changed.");
      row=await api.insert({id,matchId,storagePath,sortOrder});
    } catch (error) {
      // A lost HTTP response may follow a committed insert. Never delete its image.
      let committed: MatchScreenshot|null=null;
      try { committed=await api.find(id,matchId); } catch { /* Storage policy also protects referenced objects. */ }
      if (committed) row=committed;
      else {
        let cleanupPending=false;
        try { await api.discard(storagePath);cleanupPending=(await cleanupScreenshots(api))>0; } catch { cleanupPending=true; }
        throw new Error(`${error instanceof Error?error.message:"Upload failed."}${cleanupPending?" File cleanup is pending; retry when connected as admin.":""}`);
      }
    }
    used.add(sortOrder);onSaved(row);onProgress(i+1,files.length);
  }
}
export async function deleteScreenshot(api: ScreenshotApi, row: MatchScreenshot): Promise<number> {
  await api.deleteRow(row.id,row.matchId);
  // The DELETE trigger durably queues the file, including a parent-match cascade.
  try { return await cleanupScreenshots(api); } catch { return 1; }
}
