import {toPng} from 'html-to-image';
const hidden = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-pointkit-private]';
function privateAncestor(element) {
  let current=element;
  while(current){if(current.closest(hidden))return true;current=current.getRootNode().host;}
  return false;
}
/** Capture a redacted, bounded PNG of the selected element, not the screen. */
export async function captureElement(element) {
  const doc=element.ownerDocument, win=doc.defaultView, rect=element.getBoundingClientRect();
  if(!rect.width || !rect.height) throw new Error('선택한 요소가 화면에 표시되지 않습니다.');
  const ratio=Math.min(1,1280/Math.max(rect.width,rect.height));
  const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
  let dataUrl;
  if(privateAncestor(element)) {
    const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f0f2f5';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#7b8796';ctx.font='12px sans-serif';ctx.fillText('Private input hidden',8,Math.min(height-4,20));
    dataUrl=canvas.toDataURL('image/png');
  } else {
    let timer;
    try {dataUrl=await Promise.race([toPng(element,{
      pixelRatio:1,canvasWidth:width,canvasHeight:height,skipFonts:true,
      backgroundColor:win.getComputedStyle(doc.body).backgroundColor==='rgba(0, 0, 0, 0)'?'#ffffff':win.getComputedStyle(doc.body).backgroundColor,
      filter:node=>!(node.nodeType===1 && (node.matches(hidden+', script, style, iframe, video, [data-pointkit-ui]') || privateAncestor(node))),
      style:{outline:'none',outlineOffset:'0px',margin:'0',transform:'none'},
    }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('이미지 생성 시간이 초과됐습니다.')),10000);})]);}
    finally{clearTimeout(timer);}
  }
  if(!dataUrl.startsWith('data:image/png;base64,')) throw new Error('요소 이미지를 만들지 못했습니다.');
  if((dataUrl.length-'data:image/png;base64,'.length)*.75>1048576) throw new Error('요소 이미지가 1 MB를 초과합니다. 더 작은 요소를 선택해주세요.');
  return {data_url:dataUrl,width,height,...(privateAncestor(element)?{redacted:true}:{})};
}
