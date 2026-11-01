import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPointServer} from '../service/server.mjs';

const key='test-upload-key-000000000000000000000';
const context={schema:'pointkit.element.v1',page:'https://example.com/settings?token=secret#private',selector:'#save',tag:'button',attributes:{'aria-label':'<img src=x onerror=alert(1)>'},text:'Save'};
async function service(t,options={}){const server=createPointServer({uploadKey:key,dbPath:':memory:',allowedOrigins:['https://app.example.com'],...options});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;return {base,request:(path,options)=>fetch(base+path,options)};}
const post=(value,headers={})=>({method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,...headers},body:JSON.stringify(value)});

test('authenticated upload, public JSON/HTML, exact receipt, and capability deletion',async t=>{
 const {request}=await service(t);
 assert.equal((await request('/api/points',{...post({context}),headers:{'Content-Type':'application/json'}})).status,401);
 const created=await request('/api/points',post({context}));assert.equal(created.status,201);const receipt=await created.json();
 assert.match(receipt.id,/^[a-f0-9]{32}$/);assert.ok(receipt.delete_token.length>30);assert.equal(receipt.context,undefined);
 const path='/api/points/'+receipt.id;
 const point=await (await request(path)).json();assert.equal(point.context.page,'https://example.com/settings');assert.equal(point.delete_token,undefined);
 const negotiated=await request('/points/'+receipt.id,{headers:{Accept:'application/json'}});assert.equal((await negotiated.json()).id,receipt.id);
 const html=await request('/points/'+receipt.id,{headers:{Accept:'text/html'}});assert.equal(html.status,200);const text=await html.text();assert.ok(text.includes('&lt;img'));assert.ok(!text.includes('<img src=x'));assert.ok(!text.includes(receipt.delete_token));
 assert.equal((await request(path,{method:'DELETE',headers:{Authorization:'Bearer wrong'}})).status,403);
 assert.equal((await request(path,{method:'DELETE',headers:{Authorization:'Bearer '+receipt.delete_token}})).status,204);
 assert.equal((await request(path)).status,404);
});

test('expiration, body validation, capacity and CORS write restrictions',async t=>{
 let now=100000;const {request}=await service(t,{now:()=>now,maxPoints:1});
 assert.equal((await request('/api/points',post({context,expires_in:1}))).status,400);
 assert.equal((await request('/api/points',post({context:null}))).status,400);
 assert.equal((await request('/api/points',post({context:{...context,text:'a'.repeat(70000)}}))).status,413);
 assert.equal((await request('/api/points',post({context},{Origin:'https://evil.example.com'}))).status,403);
 const preflight=await request('/api/points',{method:'OPTIONS',headers:{Origin:'https://app.example.com','Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://app.example.com');
 const receipt=await (await request('/api/points',post({context,expires_in:60}))).json();
 assert.equal((await request('/api/points',post({context}))).status,507);
 now+=61;assert.equal((await request('/api/points/'+receipt.id)).status,410);
 assert.equal((await request('/api/points',post({context}))).status,201);
});

test('signed HTTP-only browser session authorizes writes and logout clears cookie',async t=>{
 const {request}=await service(t);
 const login=await request('/api/session',post({key}));assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));
 const session=cookie.split(';')[0];assert.equal((await (await request('/api/session',{headers:{Cookie:session}})).json()).connected,true);
 const response=await request('/api/points',post({context},{Authorization:'',Cookie:session}));assert.equal(response.status,201);
 const modified=session.slice(0,-1)+(session.endsWith('a')?'b':'a');assert.equal((await (await request('/api/session',{headers:{Cookie:modified}})).json()).connected,false);
 const logout=await request('/api/session',{method:'DELETE',headers:{Cookie:session}});assert.equal(logout.status,204);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
});

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=';
test('PNG and memo are public by capability, correctly typed, escaped, and expire together',async t=>{
 let now=200000;const {request}=await service(t,{now:()=>now});
 const created=await request('/api/points',post({context:{...context,note:'<script>alert(1)</script>\n두 번째 줄'},image:{data_url:png,width:9999,height:9999},expires_in:60}));
 assert.equal(created.status,201);const receipt=await created.json();assert.equal(receipt.image.width,1);assert.equal(receipt.image.height,1);
 const publicPoint=await (await request('/api/points/'+receipt.id)).json();assert.equal(publicPoint.image.url,receipt.image.url);assert.ok(!JSON.stringify(publicPoint).includes('base64'));
 const image=await request('/api/points/'+receipt.id+'/image');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),png.split(',')[1]);
 const html=await (await request('/points/'+receipt.id,{headers:{Accept:'text/html'}})).text();assert.ok(html.includes('id="point-image"'));assert.ok(html.includes('id="point-note"'));assert.ok(html.includes('&lt;script&gt;alert(1)'));assert.ok(!html.includes('<script>alert'));
 now+=61;assert.equal((await request('/api/points/'+receipt.id+'/image')).status,410);assert.equal((await request('/api/points/'+receipt.id)).status,404);
});

test('reject non-PNG, malformed/oversized images and long notes; enforce byte quota',async t=>{
 const {request}=await service(t);
 for(const image of [{data_url:'data:image/svg+xml;base64,PHN2Zz4='},{data_url:'data:image/png;base64,YmFk'}]) assert.equal((await request('/api/points',post({context,image}))).status,400);
 assert.equal((await request('/api/points',post({context,image:{data_url:'data:image/png;base64,'+Buffer.alloc(1048577).toString('base64')}}))).status,413);
 assert.equal((await request('/api/points',post({context:{...context,note:'a'.repeat(4001)}}))).status,400);
 const limited=await service(t,{maxStorageBytes:10});assert.equal((await limited.request('/api/points',post({context,image:{data_url:png}}))).status,507);
});
