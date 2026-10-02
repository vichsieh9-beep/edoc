import { spawn } from 'node:child_process';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {createFakeGithub,repoDocument} from './fake-github.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function startRuntime(){
 const gh=createFakeGithub();let writeBlock=null,failWrites=0,loseWrite=false;
 const githubServer=http.createServer(async(req,res)=>{
  let body='';for await(const x of req)body+=x;
  if(req.method==='PUT'&&writeBlock){const block=writeBlock;writeBlock=null;block.enter();await block.wait;}
  if(req.method==='PUT'&&failWrites>0){failWrites--;res.writeHead(503);res.end('{}');return;}
  const response=await gh.fetch('https://api.github.com'+req.url,{method:req.method,headers:{Accept:req.headers.accept},body:body||undefined});
  if(req.method==='PUT'&&loseWrite){loseWrite=false;res.writeHead(503);res.end('{}');return;}
  res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
 });
 await new Promise(r=>githubServer.listen(0,'127.0.0.1',r));const githubUrl='http://127.0.0.1:'+githubServer.address().port;
 const directory=await mkdtemp(join(tmpdir(),'edoc-collaboration-')),port=await freePort();let child,log='';const backups=new Set();
 async function stop(){if(!child)return;const c=child;child=null;try{process.kill(-c.pid,'SIGTERM');}catch{};await Promise.race([new Promise(r=>c.once('exit',r)),pause(5000)]);if(c.exitCode===null){try{process.kill(-c.pid,'SIGKILL');}catch{};await new Promise(r=>c.once('exit',r));}}
 async function start(){
  log='';child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config','worker/wrangler.test.toml','--port',String(port),'--inspector-port','0','--persist-to',directory,'--var','FAKE_GITHUB:'+githubUrl],{env:{...process.env,WRANGLER_SEND_METRICS:'false',BROWSER:'none'},stdio:['ignore','pipe','pipe'],detached:true});
  child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
  for(let i=0;i<150;i++){try{await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(500)});return;}catch{}if(child.exitCode!==null||log.includes('Build failed'))break;await pause(100);}
  await stop();throw new Error('Local Worker did not start: '+log);
 }
 async function call(path,body){const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'text/plain','Origin':'http://edoc.test'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try{await start();}catch(e){await stop();await new Promise(r=>githubServer.close(r));await rm(directory,{recursive:true,force:true});throw e;}return {gh,blockNextWrite(){let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);writeBlock={enter,wait};return {entered,release};},loseNextWrite(){loseWrite=true;},failNextWrites(n){failWrites=n;},call,testStore:b=>call('/store',b),backup:async()=>{await stop();const snapshot=await mkdtemp(join(tmpdir(),'edoc-private-backup-'));backups.add(snapshot);await cp(directory,snapshot,{recursive:true});const checkpoint={directory:snapshot,formalCommits:gh.commits.length};await start();return checkpoint;},restore:async(checkpoint)=>{const snapshot=checkpoint.directory;if(!backups.has(snapshot))throw new Error('Unknown private snapshot');await stop();await rm(directory,{recursive:true,force:true});await cp(snapshot,directory,{recursive:true});await start();},restart:async()=>{await stop();await start();},close:async()=>{await stop();await new Promise(r=>githubServer.close(r));await rm(directory,{recursive:true,force:true});await Promise.all([...backups].map(p=>rm(p,{recursive:true,force:true})));},get log(){return log;}};
}
