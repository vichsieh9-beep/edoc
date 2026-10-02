// Local, disposable collaboration preview. Uses fake GitHub and in-memory SQLite only.
import http from 'node:http';
import {loadTemplates,bundleRuntime,renderDocument,renderLibrary} from './lib/site.mjs';
import {createFakeGithub,ADMIN_TOKEN,TEST_TOKEN} from '../tests/fake-github.js';
import {localCollaboration} from '../tests/local-collaboration.js';
import {handle} from '../worker/src/index.js';
import {hashContent,trustedContent} from '../worker/src/content.js';
const slug='qa-senior-game-qa',gh=createFakeGithub(),doc=gh.read();
doc.versions['v0.7'].html='<h1>【QA】資深遊戲測試工程師（本機測試）</h1><h2>需求條件</h2><p>具遊戲測試經驗。</p><p>能獨立規劃測試。</p><p>善用 AI 協作。</p><p>清楚回報問題。</p><p>主動溝通風險。</p>';gh.write(`documents/${slug}/document.json`,doc);
const [templates,script,libraryScript]=await Promise.all([loadTemplates(),bundleRuntime(),bundleRuntime('src/library.js')]);
let env,hub,base;
const banner='<div style="padding:8px;background:#fff3cd;text-align:center">本機假資料預覽 · 不會寫入 GitHub · 關閉服務後資料清除 · 不產生官方 PDF</div>';
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,base);
  if(url.pathname.startsWith('/api/')){
   let body='';for await(const part of req){body+=part;if(body.length>2_000_000){res.writeHead(413);res.end();return;}}
   const response=await handle(new Request(base+url.pathname.slice(4),{method:req.method,headers:{Origin:req.headers.origin||base},...(req.method==='POST'?{body}:{})}),env,{fetch:gh.fetch,collaboration:hub});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(url.pathname.includes('/pdf/')){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Local preview does not generate official PDFs');return;}
  const current=gh.read();const config={publishApi:base+'/api'};
  const html=url.pathname==='/'?renderLibrary([{slug,doc:current}],{templates,script:libraryScript,config}):url.pathname===`/documents/${slug}/`?renderDocument(current,{templates,script,slug,config}):null;
  if(!html){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});const previewHtml=html.replace(/(<script id="documentMeta" type="application\/json">)([\s\S]*?)(<\/script>)/,(_,a,json,b)=>a+JSON.stringify({...JSON.parse(json),pdfVersions:[]})+b);res.end(previewHtml.replace('<body>','<body>'+banner));
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end(e.message);}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.EDOC_PREVIEW_PORT||0),'127.0.0.1',resolve);});
base='http://127.0.0.1:'+server.address().port;env={GITHUB_TOKEN:'test',GITHUB_REPO:'vichsieh9-beep/edoc',ALLOWED_ORIGIN:base};hub=localCollaboration(gh,env);
const call=async(path,body={},token=ADMIN_TOKEN)=>{const r=await hub.fetch(new Request('http://preview',{method:'POST',body:JSON.stringify({path,body:{doc:slug,token,requestId:crypto.randomUUID(),...body}})}));if(!r.ok)throw new Error(await r.text());return r.json();};
await call('/collaboration/settings',{enabled:true,expectedRevision:0});const before=trustedContent(doc.versions['v0.7'].html);
const proposed=process.env.EDOC_PREVIEW_SCENARIO==='alignment'
 ?before.replace('<p>具遊戲','<p>有帶過人</p><p>具遊戲').replace('<p>能獨立規劃測試。</p>','').replace('協作','作')
 :['paragraph','markup','review-tools'].includes(process.env.EDOC_PREVIEW_SCENARIO)
 ?before.replace('具遊戲','具備網路遊戲').replace('規劃測試。',['markup','review-tools'].includes(process.env.EDOC_PREVIEW_SCENARIO)?'規劃Test Case。':'規劃測試案例。').replace('<p>主動溝通風險。</p>','').replace('善用 AI 協作。',process.env.EDOC_PREVIEW_SCENARIO==='review-tools'?'AI 協作。':'善用 AI 協作。')
 :before.replace('具遊戲','具 iGaming 遊戲').replace('規劃','規劃及執行').replace('善用','有實際運用').replace('清楚','完整').replace('主動','積極');
await call('/suggestions/create',{baseVersion:'v0.7',baseHash:await hashContent(before),proposedHtml:proposed},TEST_TOKEN);
console.log('本機主控者測試連結：'+base+`/documents/${slug}/#edit=`+ADMIN_TOKEN);
console.log('本機提出者測試連結：'+base+`/documents/${slug}/#edit=`+TEST_TOKEN);
console.log('資料只存在記憶體，按 Ctrl+C 關閉；沒有雲端或付費 AI 呼叫。');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>process.exit(0));server.closeAllConnections();});
