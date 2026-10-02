/** @typedef {{view:boolean,propose:boolean,decide:boolean,publish:boolean,manage:boolean}} Capabilities */
/** @typedef {{id:string,name:string,company:string,linkId:string}} Actor */
/** @typedef {{doc:string,enabled:boolean,ownerId:string,policyRevision:number}} DocumentPolicy */
export const CAPABILITIES=['view','propose','decide','publish','manage'];
export const FULL_CAPABILITIES=Object.fromEntries(CAPABILITIES.map(k=>[k,true]));
export const DEFAULT_CAPABILITIES={view:true,propose:true,decide:false,publish:false,manage:false};
export class CollaborationError extends Error {
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
export function fail(status,code,message){throw new CollaborationError(status,code,message);}
export function expectRevision(value,expected){if(value!==expected)fail(409,'revision','內容或權限已更新，請重新檢視');}
export function checkedCapabilities(c){
 if(!c||typeof c!=='object'||CAPABILITIES.some(k=>typeof c[k]!=='boolean')||Object.keys(c).some(k=>!CAPABILITIES.includes(k)))fail(400,'capabilities','權限格式不符');
 if(!c.view&&CAPABILITIES.slice(1).some(k=>c[k]))fail(400,'capabilities','其他能力需要檢視權限');return {...c};
}
export function checkedText(text,max=2000,optional=false){if(optional&&text==null)return '';if(typeof text!=='string'||(!optional&&!text.trim())||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail(400,'text','文字格式或長度不符');return text.trim();}
export function checkRequestId(id){if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(id))fail(400,'request_id','操作識別碼不符');}
