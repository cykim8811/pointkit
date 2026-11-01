import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('.');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + (pathname === '/' ? '/examples/index.html' : pathname));
    if (!file.startsWith(root + sep)) {response.writeHead(403).end();return;}
    const body = await readFile(file);
    response.writeHead(200, {'Content-Type':types[extname(file)] || 'application/octet-stream'}).end(body);
  } catch {response.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Pointkit demo: http://127.0.0.1:'+(process.env.PORT || 4173)));
