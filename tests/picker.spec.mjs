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
