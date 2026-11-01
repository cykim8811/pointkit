import { test, expect } from '@playwright/test';

test.beforeEach(async ({page,context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.picker));
});
async function pick(page, locator) {
  const box=await locator.boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await expect(locator).toHaveClass(/pointkit-target/);
  await page.mouse.click(box.x+box.width/2, box.y+box.height/2);
  await expect(page.locator('html')).not.toHaveClass(/pointkit-active/);
  await expect(page.locator('#output')).toContainText('pointkit.element.v1');
  return JSON.parse(await page.locator('#output').textContent());
}

test('Cmd+C selects, copies precise context, and suppresses original click', async ({page}) => {
  await page.keyboard.press('Meta+c');
  await expect(page.locator('html')).toHaveClass(/pointkit-active/);
  const copied=await pick(page,page.locator('#primary'));
  expect(copied.selector).toBe('#primary');
  expect(copied.app).toBe('pointkit-demo');
  expect(copied.text).toBe('Example button');
  expect(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()))).toEqual(copied);
  expect(await page.evaluate(()=>window.clickCount)).toBe(0);
  await page.locator('#primary').click();
  expect(await page.evaluate(()=>window.clickCount)).toBe(1);
});

test('Ctrl+C and Escape preserve focus and remove outline', async ({page}) => {
  await page.locator('#primary').focus();
  await page.keyboard.press('Control+c');
  const box=await page.locator('#example-link').boundingBox();
  await page.mouse.move(box.x+4,box.y+4);
  await expect(page.locator('#example-link')).toHaveClass(/pointkit-target/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pointkit-target')).toHaveCount(0);
  await expect(page.locator('#primary')).toBeFocused();
  expect(await page.evaluate(()=>window.picker.isActive())).toBe(false);
});

test('native selected text, input, and editable copying remain intact', async ({page}) => {
  await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#selection'));getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Select this text and copy it normally.');
  await expect(page.locator('html')).not.toHaveClass(/pointkit-active/);
  await page.locator('#input').selectText();
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Native input copy');
  await page.locator('#editable').selectText();
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Native editable copy');
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.locator('#input').focus();
  await page.keyboard.press('Meta+c');
  await expect(page.locator('html')).not.toHaveClass(/pointkit-active/);
});

test('anonymous selectors resolve uniquely and private text is omitted', async ({page}) => {
  await page.keyboard.press('Control+c');
  const copied=await pick(page,page.locator('.anonymous span').nth(1));
  expect(await page.locator(copied.selector).count()).toBe(1);
  expect(await page.locator(copied.selector).textContent()).toBe('Second element');
  const context=await page.evaluate(async()=>{const {describeElement}=await import('/dist/index.js');return describeElement(document.querySelector('#private-parent'));});
  expect(context.text).toBe('Public context');
  const input=await page.evaluate(async()=>{const {describeElement}=await import('/dist/index.js');return describeElement(document.querySelector('#input'));});
  expect(input.text).toBe('');expect(input.attributes.value).toBeUndefined();
});

test('ignored areas, destroy, and reinstall do not leave handlers or styles', async ({page}) => {
  await page.keyboard.press('Control+c');
  const box=await page.locator('#ignored').boundingBox();
  await page.mouse.move(box.x+5,box.y+5);await page.mouse.click(box.x+5,box.y+5);
  expect(await page.evaluate(()=>window.picker.isActive())).toBe(true);
  await page.evaluate(()=>{window.picker.destroy();window.picker.destroy();});
  await expect(page.locator('[data-pointkit-style]')).toHaveCount(0);
  await page.keyboard.press('Control+c');
  await expect(page.locator('html')).not.toHaveClass(/pointkit-active/);
  await page.evaluate(async()=>{const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit();window.duplicate=createPointkit();});
  expect(await page.evaluate(()=>window.duplicate===window.picker)).toBe(true);
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>window.picker.isActive())).toBe(true);
  await expect(page.locator('[data-pointkit-style]')).toHaveCount(1);
});

test('clipboard failures are reported and cancel selection', async ({page}) => {
  await page.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new Error('Clipboard denied'));});
  await page.keyboard.press('Control+c');
  const box=await page.locator('#primary').boundingBox();
  await page.mouse.click(box.x+5,box.y+5);
  await expect(page.locator('#status')).toHaveText('Clipboard denied');
  await expect(page.locator('html')).not.toHaveClass(/pointkit-active/);
  expect(await page.evaluate(()=>window.clickCount)).toBe(0);
});

test('strict CSP supports externally linked CSS without style injection', async ({page}) => {
  await page.route('**/examples/csp.html',async route=>route.fulfill({
    headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'"},
    body:'<!doctype html><link rel="stylesheet" href="/dist/style.css"><button id="target">Target</button><script type="module" src="/examples/csp.js"></script>'
  }));
  await page.route('**/examples/csp.js',async route=>route.fulfill({contentType:'text/javascript',body:"import {createPointkit} from '/dist/index.js';window.picker=createPointkit({styles:false});"}));
  await page.goto('/examples/csp.html');await page.waitForFunction(()=>Boolean(window.picker));
  await page.keyboard.press('Control+c');
  await expect(page.locator('html')).toHaveClass(/pointkit-active/);
  await expect(page.locator('[data-pointkit-style]')).toHaveCount(0);
  const box=await page.locator('#target').boundingBox();await page.mouse.move(box.x+2,box.y+2);
  expect(await page.locator('#target').evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
});

test('sharing uploads first and copies only the returned link with deletion receipt',async({page})=>{
 const id='a'.repeat(32),url='http://127.0.0.1:4173/points/'+id;
 let uploaded;
 await page.route('**/api/points',async route=>{
  uploaded=route.request().postDataJSON();expect(route.request().headers().authorization).toBe('Bearer write-only');
  await new Promise(resolve=>setTimeout(resolve,100));
  await route.fulfill({status:201,json:{id,url,api_url:'http://127.0.0.1:4173/api/points/'+id,delete_token:'delete-only-token',expires_at:'2030-01-01T00:00:00Z'}});
 });
 await page.evaluate(async()=>{window.picker.destroy();const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit({composer:false,capture:false,share:{endpoint:'/api/points',token:'write-only',expiresIn:3600},onUpload:receipt=>window.receipt=receipt,onCopy:event=>window.copied=event,onError:error=>window.shareError=error.message});});
 await page.keyboard.press('Meta+c');const box=await page.locator('#primary').boundingBox();await page.mouse.click(box.x+5,box.y+5);
 await page.waitForFunction(()=>Boolean(window.copied));expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
 expect(uploaded.context.selector).toBe('#primary');expect(uploaded.expires_in).toBe(3600);
 expect(await page.evaluate(()=>window.receipt.delete_token)).toBe('delete-only-token');expect(await page.evaluate(()=>window.shareError)).toBeUndefined();
});

test('failed uploads report an error instead of copying a misleading link',async({page})=>{
 await page.route('**/api/points',route=>route.fulfill({status:401,json:{error:'An upload key is required.'}}));
 await page.evaluate(async()=>{window.picker.destroy();const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit({composer:false,capture:false,share:{endpoint:'/api/points'},onCopy:()=>window.unexpectedCopy=true,onError:error=>window.shareError=error.message});});
 await page.keyboard.press('Control+c');const box=await page.locator('#primary').boundingBox();await page.mouse.click(box.x+5,box.y+5);
 await page.waitForFunction(()=>Boolean(window.shareError));expect(await page.evaluate(()=>window.shareError)).toBe('An upload key is required.');expect(await page.evaluate(()=>window.unexpectedCopy)).toBeUndefined();
});

test('sharing composer waits for memo, captures a PNG, and cancels without uploading',async({page})=>{
 let uploads=0,payload;
 const url='http://127.0.0.1:4173/points/'+'b'.repeat(32);
 await page.route('**/api/points',async route=>{uploads++;payload=route.request().postDataJSON();await route.fulfill({status:201,json:{id:'b'.repeat(32),url,delete_token:'delete',expires_at:'2030-01-01',api_url:url.replace('/points/','/api/points/')}});});
 await page.evaluate(async()=>{window.picker.destroy();const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit({share:{endpoint:'/api/points'},onError:e=>window.lastError=e.message});});
 await page.keyboard.press('Meta+c');const box=await page.locator('#primary').boundingBox();await page.mouse.click(box.x+5,box.y+5);
 await expect(page.locator('.pointkit-composer')).toBeVisible();await expect(page.locator('.pointkit-preview-image')).toBeVisible();expect(uploads).toBe(0);
 await page.locator('.pointkit-note').fill('메모를 입력합니다.');
 await page.keyboard.press('Escape');await expect(page.locator('.pointkit-composer')).toHaveCount(0);expect(uploads).toBe(0);
 await page.keyboard.press('Meta+c');await page.mouse.click(box.x+5,box.y+5);await expect(page.locator('.pointkit-preview-image')).toBeVisible();
 await page.locator('.pointkit-note').fill('실제 메모');await page.locator('.pointkit-submit').click();
 await expect(page.locator('.pointkit-composer')).toHaveCount(0);expect(uploads).toBe(1);expect(payload.context.note).toBe('실제 메모');expect(payload.image.data_url).toMatch(/^data:image\/png;base64,/);expect(payload.image.width).toBeGreaterThan(1);expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
});

test('private input image is redacted and clipboard retry reuses its saved receipt',async({page})=>{
 let uploads=0,payload;const url='http://127.0.0.1:4173/points/'+'c'.repeat(32);
 await page.route('**/api/points',async route=>{uploads++;payload=route.request().postDataJSON();await route.fulfill({status:201,json:{id:'c'.repeat(32),url,delete_token:'delete',api_url:url.replace('/points/','/api/points/'),expires_at:'2030-01-01'}});});
 await page.evaluate(async()=>{window.picker.destroy();const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit({share:{endpoint:'/api/points'}});window.originalWrite=navigator.clipboard.write.bind(navigator.clipboard);navigator.clipboard.write=()=>Promise.reject(new Error('denied'));});
 await page.keyboard.press('Meta+c');const box=await page.locator('#input').boundingBox();await page.mouse.click(box.x+5,box.y+5);
 await expect(page.locator('.pointkit-preview-image')).toBeVisible();await page.locator('.pointkit-submit').click();await expect(page.locator('.pointkit-submit')).toHaveText('저장된 링크 다시 복사');
 expect(uploads).toBe(1);expect(payload.context.text).toBe('');expect(payload.image.redacted).toBe(true);expect(JSON.stringify(payload)).not.toContain('Native input copy');
 await page.evaluate(()=>navigator.clipboard.write=window.originalWrite);await page.locator('.pointkit-submit').click();await expect(page.locator('.pointkit-composer')).toHaveCount(0);expect(uploads).toBe(1);expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
});

test('capture failure requires explicit image-free sharing and preserves the memo',async({page})=>{
 let uploads=0,payload;const url='http://127.0.0.1:4173/points/'+'d'.repeat(32);
 await page.route('**/api/points',async route=>{uploads++;payload=route.request().postDataJSON();await route.fulfill({status:201,json:{id:'d'.repeat(32),url,delete_token:'delete',api_url:url.replace('/points/','/api/points/'),expires_at:'2030-01-01'}});});
 await page.evaluate(async()=>{window.picker.destroy();const {createPointkit}=await import('/dist/index.js');window.picker=createPointkit({share:{endpoint:'/api/points'}});HTMLCanvasElement.prototype.toDataURL=()=>{throw new Error('Canvas unavailable');};});
 await page.keyboard.press('Meta+c');const box=await page.locator('#primary').boundingBox();await page.mouse.click(box.x+5,box.y+5);
 await expect(page.locator('.pointkit-preview-status')).toHaveText('이미지 생성 실패');expect(uploads).toBe(0);
 await page.locator('.pointkit-note').fill('이미지 없이 전달하는 메모');await page.locator('.pointkit-submit').filter({hasText:'이미지 없이 공유'}).click();
 await expect(page.locator('.pointkit-composer')).toHaveCount(0);expect(uploads).toBe(1);expect(payload.image).toBeUndefined();expect(payload.context.note).toBe('이미지 없이 전달하는 메모');
});
