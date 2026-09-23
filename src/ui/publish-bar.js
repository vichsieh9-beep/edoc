// Published (http/https) vs Local (file://) badge and 複製公開網址.
import { el } from './elements.js';
import { isPublished, shareableUrl } from '../engine/publish.js';

export function initPublishBar(){
  const { publishStatus, shareUrlBtn }=el;
  shareUrlBtn.addEventListener('click',async()=>{
    if(shareUrlBtn.disabled) return;
    try{
      await navigator.clipboard.writeText(shareableUrl(location));
      const old=shareUrlBtn.textContent;
      shareUrlBtn.textContent='已複製網址';
      setTimeout(()=>shareUrlBtn.textContent=old,1200);
    }catch(e){
      alert('無法直接複製網址，請從瀏覽器網址列複製。');
    }
  });
  const live=isPublished(location);
  publishStatus.textContent = live ? 'Published' : 'Local';
  publishStatus.classList.toggle('live',live);
  publishStatus.classList.toggle('local',!live);
  shareUrlBtn.disabled=!live;
}
