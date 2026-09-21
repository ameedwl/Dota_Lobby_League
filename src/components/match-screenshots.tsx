"use client";
/* eslint-disable @next/next/no-img-element -- Public Storage originals are lazy-loaded; no image proxy or paid transformations required. */
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useAuth} from "@/lib/auth";
import {getSupabase} from "@/lib/supabase";
import {cleanupScreenshotFiles,deleteScreenshot,screenshotApi,SCREENSHOT_TYPES,uploadScreenshots,validateScreenshotFiles} from "@/lib/screenshots";
import type {MatchScreenshot} from "@/lib/types";

function ScreenshotImage({url,alt,preview=false}:{url:string;alt:string;preview?:boolean}) {
 const [failed,setFailed]=useState(false);
 if(failed)return <span className="screenshot-unavailable" role="status">Image unavailable. Try reopening it later.</span>;
 return <img src={url} alt={alt} loading={preview?"eager":"lazy"} decoding="async" onError={()=>setFailed(true)}/>;
}
function ScreenshotPreview({rows,index,url,onIndex,onClose}:{rows:MatchScreenshot[];index:number;url:(path:string)=>string;onIndex:(index:number)=>void;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const el=dialog.current,body=document.body,html=document.documentElement;
  const x=window.scrollX,y=window.scrollY;
  const previous={overflow:body.style.overflow,position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width};
  const rootOverflow=html.style.overflow;
  html.style.overflow="hidden";
  Object.assign(body.style,{overflow:"hidden",position:"fixed",top:"-"+y+"px",left:"-"+x+"px",width:"100%"});
  el?.showModal();
  return()=>{
   el?.close();Object.assign(body.style,previous);html.style.overflow=rootOverflow;
   const behavior=html.style.scrollBehavior;html.style.scrollBehavior="auto";window.scrollTo(x,y);html.style.scrollBehavior=behavior;
  };
 },[]);
 const row=rows[index];
 const move=(step:number)=>onIndex((index+rows.length+step)%rows.length);
 return <dialog ref={dialog} className="screenshot-lightbox" aria-label="Screenshot preview" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>{
  if(e.key==="Escape"){e.preventDefault();onClose();}
  else if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();move(e.key==="ArrowLeft"?-1:1);}
 }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <h2 className="screenshot-counter" aria-live="polite">Screenshot {index+1} / {rows.length}</h2>
  <button type="button" autoFocus className="button secondary screenshot-close" onClick={onClose}>Close preview</button>
  <div className="screenshot-preview-content">
   <ScreenshotImage key={row.id} url={url(row.storagePath)} alt={"Match screenshot "+(index+1)+", enlarged"} preview/>
  </div>
  {rows.length>1&&<>
   <button type="button" className="button secondary screenshot-previous" aria-label="Previous screenshot" title="Previous screenshot" onClick={()=>move(-1)}><span aria-hidden="true">‹</span></button>
   <button type="button" className="button secondary screenshot-next" aria-label="Next screenshot" title="Next screenshot" onClick={()=>move(1)}><span aria-hidden="true">›</span></button>
  </>}
 </dialog>;
}

export function MatchScreenshots({matchId}:{matchId:string}) {
 const {isAdmin,ready,error:authError}=useAuth(),client=getSupabase();
 const api=useMemo(()=>client?screenshotApi(client):null,[client]);
 const [rows,setRows]=useState<MatchScreenshot[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState("");
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false),[dragging,setDragging]=useState(false);
 const [selected,setSelected]=useState<string|null>(null),[confirmId,setConfirmId]=useState<string|null>(null);
 const input=useRef<HTMLInputElement>(null),working=useRef(false),request=useRef(0),live=useRef(true);
 const allowed=ready&&isAdmin&&!authError;
 const canManage=useRef(allowed);canManage.current=allowed;
 const refresh=useCallback(async()=>{
  if(!api||working.current)return;
  const version=++request.current;
  try {
   const list=await api.list(matchId);
   if(live.current&&version===request.current){setRows(list);setLoaded(true);setError("");}
  }catch(e){if(live.current&&version===request.current){setLoaded(true);setError(e instanceof Error?e.message:"Could not load screenshots.");}}
 },[api,matchId]);
 useEffect(()=>{
  live.current=true;void refresh();
  const focus=()=>void refresh(),timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);
  window.addEventListener("focus",focus);
  return()=>{live.current=false;clearInterval(timer);window.removeEventListener("focus",focus);};
 },[refresh]);
 async function upload(files:File[]) {
  if(!api||!canManage.current||working.current)return;
  const issue=validateScreenshotFiles(files,rows.length);if(issue){setError(issue);return;}
  working.current=true;request.current++;setBusy(true);setError("");setStatus("Uploading...");
  let completed=0;
  try {
   await uploadScreenshots(api,matchId,files,row=>{
    if(live.current)setRows(previous=>[...previous.filter(p=>p.id!==row.id),row].sort((a,b)=>a.sortOrder-b.sortOrder));
   },(count,total)=>{completed=count;if(live.current)setStatus(`Uploading... ${count} / ${total} complete`);},()=>live.current&&canManage.current);
   if(live.current)setStatus("Upload complete");
  }catch(e){if(live.current){setStatus(`Upload failed${completed?` after ${completed} completed`:""}`);setError(e instanceof Error?e.message:"Upload failed. Please try again.");}}
  finally{working.current=false;if(live.current){setBusy(false);if(input.current)input.current.value="";}}
 }
 async function remove(row:MatchScreenshot) {
  if(!api||!canManage.current||working.current)return;
  working.current=true;request.current++;setBusy(true);setError("");setStatus("Removing screenshot...");
  try {
   const pending=await deleteScreenshot(api,row);
   if(live.current){setRows(list=>list.filter(p=>p.id!==row.id));setConfirmId(null);setStatus(pending?"Screenshot removed. File cleanup is queued and will retry while an admin is connected.":"Screenshot removed.");}
  }catch(e){if(live.current){setStatus("Removal failed");setError(e instanceof Error?e.message:"Could not remove screenshot.");}}
  finally{working.current=false;if(live.current)setBusy(false);}
 }
 const selectedIndex=rows.findIndex(row=>row.id===selected);
 return <section className="panel match-screenshots" aria-labelledby="screenshots-heading">
  <div className="section-row"><h2 id="screenshots-heading" className="section-title">MATCH SCREENSHOTS</h2><span className="muted">{rows.length} / 3 screenshots</span></div>
  {isAdmin&&<div className={`screenshot-dropzone ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();if(allowed&&!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void upload(Array.from(e.dataTransfer.files));}}>
   <input ref={input} id="match-screenshot-files" type="file" accept={SCREENSHOT_TYPES.join(",")} multiple disabled={!allowed||busy||!loaded} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value="";if(files.length)void upload(files);}}/>
   <button type="button" className="screenshot-browse" disabled={!allowed||busy||!loaded} onClick={()=>input.current?.click()}><strong>Drag &amp; drop match screenshots here</strong><span>or click to browse</span></button>
   <p className="muted">JPEG, PNG or WebP · up to 10 MB each · maximum 3</p>
   {authError&&<p role="alert">{authError}</p>}
  </div>}
  {status&&<p role="status" aria-live="polite">{status}</p>}
  {error&&<div role="alert" className="alert">{error} <button type="button" className="filter" disabled={busy} onClick={()=>void refresh()}>Retry screenshot list</button>{isAdmin&&client&&<button type="button" className="filter" disabled={busy||!allowed} onClick={async()=>{try{const pending=await cleanupScreenshotFiles(client);setStatus(pending?"File cleanup is still pending.":"File cleanup complete.");}catch{setStatus("File cleanup failed. Reconnect and retry.");}}}>Retry file cleanup</button>}</div>}
  {!loaded?<p className="muted" role="status">Loading screenshots...</p>:!rows.length&&!error?<p className="muted">No screenshots attached yet.</p>:null}
  <div className="screenshot-gallery">{rows.map((row,i)=><figure key={row.id} className="screenshot-card">
   <button type="button" className="screenshot-thumbnail" aria-label={`Open screenshot ${i+1}`} onClick={()=>setSelected(row.id)}><ScreenshotImage url={api!.publicUrl(row.storagePath)} alt={`Match screenshot ${i+1}`}/></button>
   <figcaption><span>Screenshot {i+1}</span>{isAdmin&&<button type="button" className="filter" disabled={busy||!allowed} onClick={()=>setConfirmId(row.id)}>Remove screenshot {i+1}</button>}</figcaption>
   {isAdmin&&confirmId===row.id&&<div className="alert" role="alertdialog" aria-label={`Remove screenshot ${i+1}?`}><p>Remove this screenshot? This cannot be undone.</p><div className="filters"><button type="button" className="button" disabled={busy||!allowed} onClick={()=>void remove(row)}>Confirm removal</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setConfirmId(null)}>Cancel removal</button></div></div>}
  </figure>)}</div>
  {selectedIndex>=0&&api&&<ScreenshotPreview rows={rows} index={selectedIndex} url={api.publicUrl} onIndex={i=>setSelected(rows[i].id)} onClose={()=>setSelected(null)}/>}
 </section>;
}
