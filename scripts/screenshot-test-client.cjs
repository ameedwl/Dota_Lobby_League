// In-process Storage boundary fixture.
module.exports=function screenshotTestClient({getRole,getMatches}) {
 const state={rows:[],objects:new Set(),pending:new Set(),reservations:new Set(),uploads:0,failUpload:false,failInsert:false,failRemove:false,hold:false,release:null};
 const denied=()=>({data:null,error:{code:"42501",message:"Administrator required"}});
 function from(table){
  let mode="select",value,filters=[];
  const run=async(single=false)=>{
   const matches=row=>filters.every(([key,val])=>row[key]===val);
   if(mode!=="select"&&getRole()!=="admin")return denied();
   if(table==="matches")return {data:single?getMatches().find(matches)??null:getMatches().filter(matches),error:null};
   if(table==="screenshot_cleanup")return {data:getRole()==="admin"?[...state.pending].map(storage_path=>({storage_path})):[],error:null};
   if(table!=="match_screenshots")throw new Error("Unexpected screenshot fixture table "+table);
   if(mode==="insert"){
    if(state.failInsert)return {data:null,error:{message:"Insert failed"}};
    if(state.rows.some(row=>row.match_id===value.match_id&&row.sort_order===value.sort_order))return {data:null,error:{code:"23505",message:"Slot used"}};
    const row={...value,created_at:new Date().toISOString()};state.rows.push(row);state.reservations.delete(row.storage_path);return {data:single?row:[row],error:null};
   }
   const found=state.rows.filter(matches).sort((a,b)=>a.sort_order-b.sort_order);
   if(mode==="delete"){found.forEach(row=>state.pending.add(row.storage_path));state.rows=state.rows.filter(row=>!matches(row));}
   return {data:single?found[0]??null:found,error:null};
  };
  const query={select(){return this;},eq(key,val){filters.push([key,val]);return this;},order(){return this;},lte(){return this;},limit(){return this;},insert(row){mode="insert";value=row;return this;},delete(){mode="delete";return this;},single(){return run(true);},maybeSingle(){return run(true);},then(resolve,reject){return run().then(resolve,reject);}};
  return query;
 }
 const storage={from(){return {
  getPublicUrl:path=>({data:{publicUrl:"https://example.invalid/storage/"+path}}),
  async upload(path){state.uploads++;if(state.hold)await new Promise(resolve=>state.release=resolve);if(getRole()!=="admin")return denied();if(state.failUpload)return {data:null,error:{message:"Upload failed"}};state.objects.add(path);return {data:{path},error:null};},
  async remove(paths){if(getRole()!=="admin")return denied();if(state.failRemove)return {data:null,error:{message:"Storage offline"}};const removed=[];for(const path of paths){if(!state.rows.some(r=>r.storage_path===path)){state.objects.delete(path);removed.push({name:path});}}return {data:removed,error:null};}
 };}};
 async function rpc(name,{p_path}){
  if(getRole()!=="admin")return denied();
  if(name==="prepare_screenshot_upload"){state.reservations.add(p_path);return {data:null,error:null};}
  if(name==="discard_screenshot_upload"){if(state.rows.some(row=>row.storage_path===p_path))return {data:false,error:null};state.reservations.delete(p_path);state.pending.add(p_path);return {data:true,error:null};}
  if(name==="complete_screenshot_cleanup"){if(state.objects.has(p_path))return {data:false,error:null};state.pending.delete(p_path);return {data:true,error:null};}
  throw new Error("Unexpected screenshot RPC "+name);
 }
 return {state,storage,from,rpc};
};
