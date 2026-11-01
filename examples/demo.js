import { createPointkit } from '../dist/index.js';
window.clickCount = 0;
document.querySelector('#primary').onclick = () => window.clickCount++;
window.picker = createPointkit({
  getContext: element => ({ app:'pointkit-demo', area:element.closest('section')?.id || null }),
  onModeChange: active => {document.querySelector('#status').textContent = active ? 'Click an element · Esc to cancel' : 'Ready';},
  onCopy: ({ text }) => {document.querySelector('#output').textContent = text;},
  onError: error => {document.querySelector('#status').textContent = error.message;}
});
