import {test,expect} from '@playwright/test';
import {once} from 'node:events';
import {createPointServer} from '../service/server.mjs';
let server,base;
const key='browser-upload-key-000000000000000000';
test.beforeAll(async()=>{server=createPointServer({uploadKey:key,dbPath:':memory:'});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;});
test.afterAll(()=>new Promise(resolve=>server.close(resolve)));

test('site login → pick → public link → AI JSON → delete with no secret disclosure',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await expect(page.locator('#connect-form')).toBeVisible();
 await page.locator('#upload-key').fill(key);await page.locator('#connect-form button').click();
 await expect(page.locator('#connected-controls')).toBeVisible();expect(await page.locator('#upload-key').inputValue()).toBe('');
 await page.keyboard.press('Meta+c');const target=page.locator('#demo-action'),box=await target.boundingBox();await page.mouse.move(box.x+5,box.y+5);await expect(target).toHaveClass(/pointkit-target/);await page.mouse.click(box.x+5,box.y+5);
 await expect(page.locator('#last-point')).toBeVisible();await expect(page.locator('#toast')).toContainText('Point 링크를 복사했습니다');
 const url=await page.evaluate(()=>navigator.clipboard.readText());expect(url).toMatch(/\/points\/[a-f0-9]{32}$/);
 const id=url.split('/').at(-1);
 const json=await (await page.request.get(url,{headers:{Accept:'application/json'}})).json();expect(json.context.selector).toBe('#demo-action');expect(json.delete_token).toBeUndefined();
 await page.goto(url);await expect(page.locator('#point-context')).toContainText('#demo-action');await expect(page.locator('#delete-point')).toBeVisible();expect(await page.content()).not.toContain(key);
 const stranger=await context.browser().newContext();const publicPage=await stranger.newPage();await publicPage.goto(url);await expect(publicPage.locator('#point-context')).toBeVisible();await expect(publicPage.locator('#delete-point')).toBeHidden();await stranger.close();
 page.on('dialog',dialog=>dialog.accept());await page.locator('#delete-point').click();await expect(page.locator('#demo')).toBeVisible();expect((await page.request.get(base+'/api/points/'+id)).status()).toBe(404);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});
