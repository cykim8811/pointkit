/** A small bottom composer. No HTML from the selected page is interpolated. */
export function openComposer({doc,context,capture,onSubmit,onClose,onReselect}) {
  const previous=doc.activeElement;
  let closed=false,busy=false,image=null,receipt=null,failed=false;
  const form=doc.createElement('form');form.className='pointkit-composer';form.dataset.pointkitUi='';form.dataset.pointkitIgnore='';
  form.setAttribute('role','region');form.setAttribute('aria-label','선택한 요소 공유');
  form.innerHTML='<div class="pointkit-preview"><img class="pointkit-preview-image" alt="선택한 요소 미리보기" hidden><span class="pointkit-preview-status" role="status"></span></div><div class="pointkit-compose-main"><div class="pointkit-compose-title"><code class="pointkit-selector"></code><button class="pointkit-reselect" type="button">다시 선택</button></div><textarea class="pointkit-note" maxlength="4000" rows="2" aria-label="요소 메모" placeholder="이 요소에 대한 메모를 입력하세요…"></textarea><div class="pointkit-compose-feedback" role="status"></div></div><div class="pointkit-compose-actions"><button type="button" class="pointkit-cancel">취소</button><button class="pointkit-submit" type="submit">공유 링크 복사</button></div>';
  const $=selector=>form.querySelector(selector);
  const submit=$('.pointkit-submit'),note=$('.pointkit-note'),preview=$('.pointkit-preview-image'),status=$('.pointkit-preview-status'),feedback=$('.pointkit-compose-feedback');
  $('.pointkit-selector').textContent=context.selector;
  function close(force=false){if(closed || (busy && !force))return false;closed=true;form.remove();if(previous?.isConnected)previous.focus?.({preventScroll:true});onClose?.();return true;}
  $('.pointkit-cancel').onclick=()=>close();
  $('.pointkit-reselect').onclick=()=>{if(close())onReselect();};
  note.addEventListener('keydown',event=>{if(event.key==='Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing){event.preventDefault();if(!submit.disabled)form.requestSubmit();}});
  function preparing(){submit.disabled=true;status.textContent='이미지 만드는 중…';}
  async function prepare(){
    if(!capture){status.textContent='이미지 없음';return;}
    preparing();
    try {const result=await capture();if(closed)return;image=result;preview.src=result.data_url;preview.hidden=false;status.textContent=result.redacted?'입력값 제외':'';submit.disabled=false;}
    catch(error){if(closed)return;failed=true;status.textContent='이미지 생성 실패';feedback.textContent=error.message+' 이미지 없이 공유하거나 다시 선택할 수 있습니다.';submit.textContent='이미지 없이 공유';submit.disabled=false;}
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(busy || submit.disabled)return;
    busy=true;for(const button of form.querySelectorAll('button'))button.disabled=true;note.disabled=true;submit.textContent=receipt?'링크 복사 중…':'공유 중…';feedback.textContent='';
    try {
      // Upload failures keep the memo; clipboard failures keep the existing receipt.
      receipt=await onSubmit(note.value.trim(),image,receipt);
      busy=false;close();
    } catch(error){
      if(closed)return;
      if(error.pointReceipt)receipt=error.pointReceipt;
      busy=false;for(const button of form.querySelectorAll('button'))button.disabled=false;note.disabled=Boolean(receipt);
      feedback.textContent=error.message;submit.textContent=receipt?'저장된 링크 다시 복사':failed?'이미지 없이 공유':'공유 링크 복사';
    }
  };
  doc.body.append(form);note.focus({preventScroll:true});void prepare();
  return close;
}
