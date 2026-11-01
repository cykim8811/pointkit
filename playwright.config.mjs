import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', testMatch:'*.spec.mjs', fullyParallel:false, workers:1,
  use:{ baseURL:'http://127.0.0.1:4173', headless:true,
    launchOptions:process.env.POINTKIT_CHROMIUM ? { executablePath:process.env.POINTKIT_CHROMIUM, args:['--no-sandbox'] } : {} },
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false}
});
