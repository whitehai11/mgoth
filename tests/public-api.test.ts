import {afterEach,describe,expect,it} from 'vitest';
import express from 'express';
import {publicApi} from '../src/server/routes/api.js';

let server:ReturnType<ReturnType<typeof express>['listen']>|undefined;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;});
describe('public website API surface',()=>{
 it('keeps only health and Spotify public endpoints',async()=>{
  const app=express();app.use('/api',publicApi);server=app.listen(0);await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Test server has no TCP address');const base=`http://127.0.0.1:${address.port}/api`;
  const health=await fetch(`${base}/health`);expect(health.status).toBe(200);expect(health.headers.get('set-cookie')).toBeNull();
  for(const path of ['/catalog','/stats','/torrents/a/file','/seeds/reconcile'])expect((await fetch(`${base}${path}`)).status).toBe(404);
 });
});
