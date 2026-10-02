import { test,expect } from '@playwright/test';
import { startRuntime } from './worker-runtime.mjs';
let rt;
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{rt=await startRuntime();});
test.afterAll(async()=>{await rt?.close();});
for(const action of ['decision','permission'])test(`${action}_event_rollback`,async()=>{
 const r=await rt.testStore({action,fail:true});expect(r.status).toBe(500);
 const s=await rt.testStore({action:'inspect'});expect(s.body.records).toEqual([]);expect(s.body.events).toEqual([]);
});
test('same_request_replay and payload mismatch',async()=>{
 const a=await rt.testStore({action:'write',requestId:'request-0001',value:'甲'});
 const b=await rt.testStore({action:'write',requestId:'request-0001',value:'甲'});expect(b.body).toEqual(a.body);
 expect((await rt.testStore({action:'write',requestId:'request-0001',value:'乙'})).status).toBe(409);
 expect((await rt.testStore({action:'inspect'})).body.events).toHaveLength(1);
});
test('restart_keeps_history and document isolation',async()=>{
 await rt.restart();const s=await rt.testStore({action:'inspect'});expect(s.body.records).toHaveLength(1);expect(s.body.events[0].actorSnapshot.name).toBe('B');
 expect((await rt.testStore({action:'inspect',doc:'other'})).body.records).toEqual([]);
});
