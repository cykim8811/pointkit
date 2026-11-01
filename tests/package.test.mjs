import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

test('ESM and CommonJS exports import safely without a DOM',async()=>{
  const esm=await import('../dist/index.js');
  const cjs=createRequire(import.meta.url)('../dist/index.cjs');
  assert.equal(typeof esm.createPointkit,'function');assert.equal(typeof cjs.createPointkit,'function');
  assert.throws(()=>esm.createPointkit(),/browser/);
  assert.equal((await import('../dist/auto.js')).pointkit,null);
});
test('the package has no runtime dependencies and publishes only the build',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  assert.deepEqual(pkg.files,['dist','LICENSE','README.md']);
});
