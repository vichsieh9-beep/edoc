// Node tests use real SQLite, while the runtime suite separately covers workerd persistence.
import {DatabaseSync} from 'node:sqlite';
import {CollaborationHub} from '../worker/src/collaboration/hub.js';
import {github} from '../worker/src/github.js';
const hubs=new WeakMap();
export function localCollaboration(gh,env,{now,random}={}){
 if(hubs.has(gh))return hubs.get(gh);
 const db=new DatabaseSync(':memory:');
 const storage={sql:{exec(sql,...args){const statements=sql.trim().split(';');if(!args.length&&(statements.length>1||/^(CREATE|INSERT OR IGNORE)/.test(sql))){db.exec(sql);return {toArray:()=>[]};}const rows=db.prepare(sql).all(...args);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},async setAlarm(){},async deleteAlarm(){}};
 const hub=new CollaborationHub({storage},env);hub.gh=github(env,gh.fetch);if(now)hub.clock=now;if(random)hub.random=random;
 hubs.set(gh,hub);return hub;
}
