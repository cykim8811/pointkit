import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const equal = (a,b) => timingSafeEqual(Buffer.from(sha(String(a))), Buffer.from(sha(String(b))));
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
class HTTPError extends Error {constructor(status,message) {super(message);this.status=status;}}

export function createPointServer(options = {}) {
  const key=options.uploadKey ?? process.env.POINTKIT_UPLOAD_KEY;
  if(!key || key.length<24) throw new Error('Set POINTKIT_UPLOAD_KEY to at least 24 random characters.');
  const path=options.dbPath ?? process.env.POINTKIT_DB_PATH ?? 'data/points.sqlite3';
  if(path!==':memory:') mkdirSync(dirname(resolve(path)),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS points(id TEXT PRIMARY KEY, context TEXT NOT NULL, delete_hash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS points_expires ON points(expires);`);
  const columns=new Set(db.prepare('PRAGMA table_info(points)').all().map(column=>column.name));
  for(const [name,type] of [['image','BLOB'],['image_width','INTEGER'],['image_height','INTEGER']]) if(!columns.has(name)) db.exec(`ALTER TABLE points ADD COLUMN ${name} ${type}`);
  const originConfig=options.publicUrl ?? process.env.PUBLIC_URL;
  const allowedOrigins=new Set(options.allowedOrigins ?? (process.env.POINTKIT_ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
  const maxPoints=options.maxPoints ?? 5000;
  const maxStorageBytes=options.maxStorageBytes ?? 256*1024*1024;
  const now=options.now ?? (()=>Math.floor(Date.now()/1000));
  const rates=new Map();
  const base=()=>originConfig ? new URL(originConfig).origin : `http://127.0.0.1:${server.address().port}`;
  const bearer=req=>(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1] || '';
  const signature=value=>createHmac('sha256',key).update(value).digest('base64url');
  function session(req) {
    const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('pointkit_session='));
    if(!cookie) return false;
    const [expires,nonce,sig]=cookie.slice('pointkit_session='.length).split('.');
    return Number(expires)>now() && nonce && sig && equal(signature(expires+'.'+nonce),sig);
  }
  const authorized=req=>equal(bearer(req),key) || session(req);
  const cleanup=()=>db.prepare('DELETE FROM points WHERE expires<=?').run(now());
  const timer=setInterval(cleanup,60000);timer.unref();
  function headers(res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }
  function json(res,status,payload) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(payload));}
  async function body(req) {
    if(!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new HTTPError(415,'Use application/json.');
    let size=0;const chunks=[];
    for await(const chunk of req) {size+=chunk.length;if(size>1500000) throw new HTTPError(413,'Point upload exceeds the request size limit.');chunks.push(chunk);}
    let parsed;try {parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new HTTPError(400,'Invalid JSON.');}
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new HTTPError(400,'A JSON object is required.');
    return parsed;
  }
  function validate(context) {
    if(!context || typeof context!=='object' || Array.isArray(context)) throw new HTTPError(400,'A context object is required.');
    if(Buffer.byteLength(JSON.stringify(context))>65536) throw new HTTPError(413,'Point context exceeds 64 KB.');
    if(context.note!==undefined && (typeof context.note!=='string' || context.note.length>4000)) throw new HTTPError(400,'A note must be at most 4000 characters.');
    if(context.schema!=='pointkit.element.v1') throw new HTTPError(400,'Unsupported context schema.');
    for(const field of ['selector','tag','page']) if(typeof context[field]!=='string' || !context[field].length || context[field].length>4096) throw new HTTPError(400,`Invalid context ${field}.`);
    let page;try {page=new URL(context.page);} catch {throw new HTTPError(400,'Invalid context page URL.');}
    if(!['http:','https:'].includes(page.protocol)) throw new HTTPError(400,'Context page must use HTTP or HTTPS.');
    // Drop query strings, credentials and fragments even for direct API callers.
    const clean={...context,page:page.origin+page.pathname};
    if(typeof clean.text!=='string' || clean.text.length>10000) throw new HTTPError(400,'Invalid context text.');
    return clean;
  }
  function validateImage(image) {
    if(image===undefined || image===null)return null;
    if(typeof image!=='object' || typeof image.data_url!=='string') throw new HTTPError(400,'Invalid point image.');
    const match=image.data_url.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match || match[1].length%4) throw new HTTPError(400,'Only base64 PNG images are accepted.');
    const bytes=Buffer.from(match[1],'base64');
    if(bytes.length>1048576) throw new HTTPError(413,'Point image exceeds 1 MB.');
    if(bytes.length<45 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.readUInt32BE(8)!==13 || bytes.toString('ascii',12,16)!=='IHDR') throw new HTTPError(400,'Invalid PNG image.');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(!width || !height || width>1600 || height>1600) throw new HTTPError(400,'Point image dimensions must be within 1600×1600.');
    return {bytes,width,height};
  }
  function rate(req) {
    // Use the socket address; never trust caller-supplied forwarding headers.
    const id=req.socket.remoteAddress || 'unknown';const minute=Math.floor(now()/60);
    const old=rates.get(id);const count=old?.minute===minute ? old.count+1 : 1;
    rates.set(id,{minute,count});
    if(rates.size>1000) for(const [key,value] of rates) if(value.minute!==minute) rates.delete(key);
    if(count>60) throw new HTTPError(429,'Upload rate limit exceeded. Try again in a minute.');
  }
  function point(id) {
    const row=db.prepare('SELECT id,context,created,expires,length(image) AS image_bytes,image_width,image_height FROM points WHERE id=?').get(id);
    if(!row) throw new HTTPError(404,'Point not found or expired.');
    if(row.expires<=now()) {db.prepare('DELETE FROM points WHERE id=?').run(id);throw new HTTPError(410,'This point has expired.');}
    return {id:row.id,url:base()+'/points/'+id,api_url:base()+'/api/points/'+id,created_at:new Date(row.created*1000).toISOString(),expires_at:new Date(row.expires*1000).toISOString(),...(row.image_bytes?{image:{url:base()+'/api/points/'+id+'/image',mime_type:'image/png',width:row.image_width,height:row.image_height,bytes:row.image_bytes}}:{}),context:JSON.parse(row.context)};
  }
  const shell=(title,content)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Pointkit</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/picker.css"></head><body><header><a class="brand" href="/">pointkit<span> / points</span></a><div id="session-status"></div></header><main>${content}</main><div id="toast" role="status" hidden></div><script type="module" src="/assets/site.js"></script></body></html>`;
  const server=createServer(async(req,res)=>{
    headers(res);
    let url;try {url=new URL(req.url,'http://internal');} catch {res.writeHead(400).end();return;}
    const requestOrigin=req.headers.origin;
    const sameOrigin=requestOrigin===base();
    const corsAllowed=requestOrigin && (sameOrigin || allowedOrigins.has(requestOrigin));
    res.setHeader('Vary','Origin, Accept');
    if(corsAllowed) {res.setHeader('Access-Control-Allow-Origin',requestOrigin);res.setHeader('Access-Control-Allow-Credentials','true');}
    if(req.method==='OPTIONS') {
      if(!corsAllowed) {json(res,403,{error:'Origin is not allowed.'});return;}
      res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.writeHead(204).end();return;
    }
    const writing=!['GET','HEAD'].includes(req.method);
    try {
      if(writing && requestOrigin && !corsAllowed) throw new HTTPError(403,'Origin is not allowed.');
      if(req.method==='GET' && url.pathname==='/healthz') {json(res,200,{status:'ok'});return;}
      if(url.pathname==='/api/session') {
        if(req.method==='GET') {json(res,200,{connected:authorized(req)});return;}
        if(req.method==='POST') {
          rate(req);const value=await body(req);if(!equal(value.key,key)) throw new HTTPError(401,'Invalid upload key.');
          const payload=(now()+30*86400)+'.'+randomBytes(16).toString('base64url');
          res.setHeader('Set-Cookie',`pointkit_session=${payload}.${signature(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${base().startsWith('https:')?'; Secure':''}`);
          json(res,200,{connected:true});return;
        }
        if(req.method==='DELETE') {res.setHeader('Set-Cookie',`pointkit_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${base().startsWith('https:')?'; Secure':''}`);res.writeHead(204).end();return;}
      }
      if(req.method==='POST' && url.pathname==='/api/points') {
        if(!authorized(req)) throw new HTTPError(401,'An upload key is required.');rate(req);
        const input=await body(req), context=validate(input.context), image=validateImage(input.image);
        const ttl=input.expires_in ?? 7*86400;
        if(!Number.isInteger(ttl) || ttl<60 || ttl>30*86400) throw new HTTPError(400,'expires_in must be 60–2592000 seconds.');
        cleanup();if(db.prepare('SELECT COUNT(*) AS count FROM points').get().count>=maxPoints) throw new HTTPError(507,'Point storage is full.');
        const used=db.prepare('SELECT COALESCE(SUM(length(CAST(context AS BLOB))+COALESCE(length(image),0)),0) AS bytes FROM points').get().bytes;
        if(used+Buffer.byteLength(JSON.stringify(context))+(image?.bytes.length || 0)>maxStorageBytes) throw new HTTPError(507,'Point storage is full.');
        const id=randomBytes(16).toString('hex'), token=randomBytes(32).toString('base64url'), created=now();
        db.prepare('INSERT INTO points(id,context,delete_hash,created,expires,image,image_width,image_height) VALUES(?,?,?,?,?,?,?,?)').run(id,JSON.stringify(context),sha(token),created,created+ttl,image?.bytes ?? null,image?.width ?? null,image?.height ?? null);
        const receipt={...point(id),delete_token:token};delete receipt.context;
        res.setHeader('Location',receipt.url);json(res,201,receipt);return;
      }
      const imageMatch=url.pathname.match(/^\/api\/points\/([a-f0-9]{32})\/image$/);
      if(imageMatch && ['GET','HEAD'].includes(req.method)) {
        const value=point(imageMatch[1]);if(!value.image)throw new HTTPError(404,'This point has no image.');
        const row=db.prepare('SELECT image FROM points WHERE id=?').get(imageMatch[1]);
        res.setHeader('Access-Control-Allow-Origin','*');res.removeHeader('Access-Control-Allow-Credentials');
        res.writeHead(200,{'Content-Type':'image/png','Content-Length':row.image.length}).end(row.image);return;
      }
      const match=url.pathname.match(/^\/(api\/)?points\/([a-f0-9]{32})$/);
      if(match) {
        const id=match[2];
        if(req.method==='DELETE' && match[1]) {
          const row=db.prepare('SELECT delete_hash FROM points WHERE id=?').get(id);
          if(!row) throw new HTTPError(404,'Point not found or expired.');
          if(!authorized(req) && !equal(sha(bearer(req)),row.delete_hash)) throw new HTTPError(403,'The deletion token is required.');
          db.prepare('DELETE FROM points WHERE id=?').run(id);res.writeHead(204).end();return;
        }
        if(req.method==='GET' || req.method==='HEAD') {
          const value=point(id);
          if(match[1] || (req.headers.accept || '').includes('application/json')) {
            res.setHeader('Access-Control-Allow-Origin','*');res.removeHeader('Access-Control-Allow-Credentials');
            json(res,200,value);return;
          }
          const content=`<section class="point" data-point-id="${id}"><div class="eyebrow">POINT / ${id.slice(0,8)}</div><div class="title-row"><h1>${escape(value.context.attributes?.['aria-label'] || value.context.tag)}</h1><button id="copy-link">링크 복사</button></div><p class="muted">만료 ${escape(value.expires_at)}</p><dl><dt>페이지</dt><dd>${escape(value.context.page)}</dd><dt>Selector</dt><dd><code>${escape(value.context.selector)}</code></dd></dl><div class="actions"><a href="${value.api_url}">JSON API ↗</a><button id="copy-json">JSON 복사</button><button id="delete-point" hidden>삭제</button></div>${value.image?`<figure class="point-image"><img id="point-image" src="${escape(value.image.url)}" width="${value.image.width}" height="${value.image.height}" alt="선택한 요소 이미지"><figcaption>${value.image.width} × ${value.image.height} · PNG</figcaption></figure>`:''}${value.context.note?`<section class="point-note"><h2>메모</h2><p id="point-note">${escape(value.context.note)}</p></section>`:''}<pre id="point-context">${escape(JSON.stringify(value.context,null,2))}</pre><p class="muted">링크를 아는 사람과 AI가 이 정보를 조회할 수 있습니다.</p></section>`;
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(shell('Point '+id.slice(0,8),content));return;
        }
      }
      if(req.method==='GET' && url.pathname==='/') {
        const content=await readFile(new URL('public/home.html',import.meta.url),'utf8');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(shell('화면의 맥락을 공유하세요',content));return;
      }
      const assets={ '/assets/site.css':['service/public/site.css','text/css'], '/assets/site.js':['service/public/site.js','text/javascript'], '/assets/pointkit.js':['dist/index.js','text/javascript'], '/assets/picker.css':['dist/style.css','text/css'] };
      if(req.method==='GET' && assets[url.pathname]) {
        const [file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}).end(await readFile(resolve(project,file)));return;
      }
      throw new HTTPError(404,'Not found.');
    } catch(error) {
      const status=error instanceof HTTPError ? error.status : 500;
      if(status===500) console.error('Point request failed:',error.name);
      if(url.pathname.startsWith('/points/') && (req.headers.accept || '').includes('text/html')) {
        res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'}).end(shell('Point unavailable',`<h1>이 Point를 열 수 없습니다.</h1><p>${escape(status===410?'만료된 링크입니다.':'삭제됐거나 존재하지 않는 링크입니다.')}</p>`));
      } else json(res,status,{error:status===500?'Internal server error.':error.message});
    }
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  server.on('close',()=>{clearInterval(timer);db.close();});
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const server=createPointServer();server.listen(Number(process.env.PORT || 8080),'0.0.0.0',()=>console.log('Pointkit points service ready on port '+server.address().port));
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
