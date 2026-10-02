import schema from './schema.js';
import { fail } from './contracts.js';
const TABLES=new Set(['policies','actors','links','grants','suggestions','items','publications','document_writes','requests']);
export class CollaborationStore {
 constructor(storage){this.storage=storage;this.sql=storage.sql;this.sql.exec(schema);}
 table(t){if(!TABLES.has(t))throw new Error('Unknown collaboration table');return t;}
 transact(fn){return this.storage.transactionSync(fn);}
 get(t,id,doc){const rows=this.sql.exec(`SELECT json FROM ${this.table(t)} WHERE id=?${doc?' AND doc=?':''}`,id,...(doc?[doc]:[])).toArray();return rows[0]?JSON.parse(rows[0].json):null;}
 put(t,id,doc,value){this.sql.exec(`INSERT INTO ${this.table(t)} (id,doc,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json`,id,doc,JSON.stringify(value));return value;}
 removeWrite(doc){this.sql.exec('DELETE FROM document_writes WHERE doc=?',doc);}
 list(t,doc){return this.sql.exec(`SELECT json FROM ${this.table(t)} WHERE doc=? ORDER BY id`,doc).toArray().map(x=>JSON.parse(x.json));}
 appendEvent(event){this.sql.exec('INSERT INTO events(id,doc,suggestion_id,action,json) VALUES(?,?,?,?,?)',event.id,event.doc,event.suggestionId||null,event.action,JSON.stringify(event));return event;}
 readEvents(doc,cursor=0,limit=50,suggestionId){
  if(!Number.isInteger(cursor)||cursor<0)fail(400,'cursor','記錄游標不符');
  const rows=this.sql.exec(`SELECT seq,json FROM events WHERE doc=? AND seq>?${suggestionId?' AND suggestion_id=?':''} ORDER BY seq LIMIT ?`,doc,cursor,...(suggestionId?[suggestionId]:[]),Math.min(limit,50)).toArray();
  return {events:rows.map(r=>({...JSON.parse(r.json),seq:r.seq})),cursor:rows.at(-1)?.seq||cursor};
 }
 getRequestResult(id,payloadHash){const r=this.get('requests',id);if(r&&r.payloadHash!==payloadHash)fail(409,'request_reuse','同一操作識別碼不能送出不同內容');return r?.result;}
}
