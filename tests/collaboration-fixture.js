// Local-only runtime entry. No test routes are exported by the production Worker.
import { CollaborationHub } from '../worker/src/collaboration/hub.js';
import { handle } from '../worker/src/index.js';
import { github } from '../worker/src/github.js';
import { hashContent } from '../worker/src/content.js';
export class FixtureHub extends CollaborationHub {
 constructor(ctx,env){super(ctx,env);this.gh=github(env,(url,init)=>fetch(env.FAKE_GITHUB+new URL(url).pathname+new URL(url).search,init));}
 async fetch(request){
  const b=await request.json();
  if(b.failEvent){const original=this.store.appendEvent.bind(this.store);let pending=true;this.store.appendEvent=e=>{if(pending&&e.action===b.action){pending=false;throw new Error('Injected confirmation failure');}return original(e);};return Response.json({ok:true});}
  if(b.advanceClock){this.clockOffset=(this.clockOffset||0)+b.ms;this.clock=()=>new Date(Date.now()+this.clockOffset);await this.alarm();return Response.json({ok:true});}
  if(b.fixture){
   const doc=b.doc||'fixture';
   try{
    if(b.action==='inspect')return Response.json({records:this.store.list('grants',doc),...this.store.readEvents(doc)});
    const payloadHash=await hashContent(JSON.stringify({action:b.action,value:b.value})), key=`${doc}:B:${b.requestId}`;
    const result=this.store.transact(()=>{
     if(b.requestId){const found=this.store.getRequestResult(key,payloadHash);if(found)return found;}
     this.store.put('grants',doc+':B',doc,{name:'B',value:b.value});
     const event={id:crypto.randomUUID(),doc,actorSnapshot:{id:'B',name:'B'},time:new Date().toISOString(),action:b.fail?'':'updated'};
     this.store.appendEvent(event);
     const result={id:event.id};if(b.requestId)this.store.put('requests',key,doc,{payloadHash,result});return result;
    });return Response.json(result);
   }catch(e){return Response.json({error:e.code||'internal'},{status:e.status||500});}
  }
  return super.fetch(new Request(request.url,{method:'POST',body:JSON.stringify(b)}));
 }
}
export default {async fetch(request,env){
 const stub=env.COLLABORATION.get(env.COLLABORATION.idFromName('fixture'));
 if(new URL(request.url).pathname==='/unbound-versions'){const b=await request.json();return handle(new Request('http://test/versions',{method:'POST',headers:{Origin:'http://edoc.test'},body:JSON.stringify(b)}),{ALLOWED_ORIGIN:'http://edoc.test'});}
 if(new URL(request.url).pathname==='/fail-event')return stub.fetch(new Request('http://hub',{method:'POST',body:JSON.stringify({failEvent:true,...await request.json()})}));
 if(new URL(request.url).pathname==='/advance-clock')return stub.fetch(new Request('http://hub',{method:'POST',body:JSON.stringify({advanceClock:true,...await request.json()})}));
 if(new URL(request.url).pathname==='/store')return stub.fetch(new Request('http://hub',{method:'POST',body:JSON.stringify({fixture:true,...await request.json()})}));
 return handle(request,{...env,GITHUB_TOKEN:'test',GITHUB_REPO:'vichsieh9-beep/edoc',GITHUB_BRANCH:'main',ALLOWED_ORIGIN:'http://edoc.test'},{collaboration:stub});
}};
