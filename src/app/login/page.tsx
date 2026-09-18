"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {PageHeader} from "@/components/ui";
import {useAuth} from "@/lib/auth";
import {getSupabase} from "@/lib/supabase";
export default function Page(){
 const auth=useAuth(),router=useRouter();
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");
  try{const client=getSupabase();if(!client){setError("Supabase is not configured yet.");return;}
   const result=await client.auth.signInWithPassword({email:email.trim(),password});
   if(result.error){setError("Unable to sign in. Check your email and password, or try again later.");return;}
   setPassword("");router.replace("/");
  }catch{setError("Could not reach the login service. Please try again.");}finally{setBusy(false);}
 }
 return <><PageHeader eyebrow="League access" title="Login" description="Everyone can view the league. Sign in to access your account."/>
 {!auth.configured?<div className="alert">Supabase setup is required. Follow the project README to configure the connection.</div>:auth.user?<section className="panel"><p>Signed in as {auth.user.email}.</p><p>{auth.isAdmin?"Administrator access is enabled.":"This account has read-only access."}</p><Link className="button secondary" href={auth.isAdmin?"/admin":"/"}>{auth.isAdmin?"Open Admin":"View league"}</Link></section>:<form className="panel" onSubmit={submit} style={{maxWidth:520}}>
 <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></div>
 <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>
 {error&&<p className="alert" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy?"Signing in…":"Login"}</button></form>}
 {auth.error&&<p role="alert" className="alert">{auth.error}</p>}</>;
}
