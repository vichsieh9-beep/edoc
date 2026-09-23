// Optional editor name: stored per browser, never required to start a revision.
import { el } from './elements.js';
import { state } from './state.js';

function editorStorageKey(){ return 'edoc-editor:'+state.docState.documentId; }
export function getEditorName(){ return localStorage.getItem(editorStorageKey()) || ''; }
export function refreshEditorButton(){
  const name=getEditorName();
  el.editorBtn.textContent=name ? '編輯者：'+name : '編輯者：未設定';
  el.editorBtn.classList.toggle('state-blue', !!name);
}
export function initEditorDialog(){
  const { editorBtn, editorBackdrop, editorNameInput, cancelEditorBtn, saveEditorBtn, clearEditorBtn }=el;
  editorBtn.addEventListener('click',()=>{
    editorNameInput.value=getEditorName();
    editorBackdrop.classList.add('show');
    setTimeout(()=>editorNameInput.focus(),0);
  });
  cancelEditorBtn.addEventListener('click',()=>editorBackdrop.classList.remove('show'));
  editorBackdrop.addEventListener('click',(e)=>{
    if(e.target===editorBackdrop) editorBackdrop.classList.remove('show');
  });
  saveEditorBtn.addEventListener('click',()=>{
    const v=editorNameInput.value.trim();
    if(v) localStorage.setItem(editorStorageKey(),v);
    else localStorage.removeItem(editorStorageKey());
    refreshEditorButton();
    editorBackdrop.classList.remove('show');
  });
  clearEditorBtn.addEventListener('click',()=>{
    localStorage.removeItem(editorStorageKey());
    editorNameInput.value='';
    refreshEditorButton();
    editorBackdrop.classList.remove('show');
  });
  editorNameInput.addEventListener('keydown',(e)=>{
    if(e.key==='Enter') saveEditorBtn.click();
    if(e.key==='Escape') editorBackdrop.classList.remove('show');
  });
}
