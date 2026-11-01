import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const common = { bundle:true, minify:true, target:'es2020', legalComments:'inline', loader:{'.css':'text'} };
await Promise.all([
  build({...common, entryPoints:['src/index.js'], outfile:'dist/index.js', format:'esm'}),
  build({...common, entryPoints:['src/index.js'], outfile:'dist/index.cjs', format:'cjs'}),
  build({...common, entryPoints:['src/auto.js'], outfile:'dist/auto.js', format:'esm', bundle:false}),
  build({...common, entryPoints:['src/index.js'], outfile:'dist/pointkit.global.js', format:'iife', globalName:'Pointkit'})
]);
await Promise.all(['index.d.ts','auto.d.ts','style.css'].map(file => cp('src/'+file, 'dist/'+file)));
