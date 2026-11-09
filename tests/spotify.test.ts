import {describe,expect,it} from 'vitest';
import {createOAuthState,verifyOAuthState} from '../src/server/services/spotify.js';
import {createSession,validSession} from '../src/server/lib/auth.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {vi} from 'vitest';
describe('protected authorization tokens',()=>{
 it('signs OAuth state and rejects changes',()=>{
  const state=createOAuthState();
  expect(verifyOAuthState(state)).toBe(true);
  expect(verifyOAuthState(`${state}x`)).toBe(false);
  expect(verifyOAuthState('forged.state')).toBe(false);
 });
 it('accepts a valid admin session and rejects a forged one',()=>{
  const session=createSession();
  expect(validSession(session)).toBe(true);
  expect(validSession(`${session}x`)).toBe(false);
  expect(validSession('')).toBe(false);
 });
 it('refreshes an expired access token and anchors Spotify progress at response receipt',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'mgoth-spotify-'));const prior={DATA_DIR:process.env.DATA_DIR,SPOTIFY_CLIENT_ID:process.env.SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET:process.env.SPOTIFY_CLIENT_SECRET};process.env.DATA_DIR=dir;process.env.SPOTIFY_CLIENT_ID='fixture-client';process.env.SPOTIFY_CLIENT_SECRET='fixture-secret';vi.resetModules();let tokenCalls=0;const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);if(url.endsWith('/api/token')){tokenCalls++;const body=new URLSearchParams(String(init?.body));return Response.json(body.get('grant_type')==='authorization_code'?{access_token:'short-lived',refresh_token:'fixture-refresh',expires_in:1}:{access_token:'refreshed-access',expires_in:3600});}if(url.includes('currently-playing')){expect(new Headers(init?.headers).get('authorization')).toBe('Bearer refreshed-access');return Response.json({is_playing:true,progress_ms:1200,timestamp:1,item:{name:'Fixture track',artists:[{name:'Fixture artist'}],album:{name:'Fixture album',images:[]},external_urls:{spotify:'https://open.spotify.com/track/fixture'},duration_ms:180000}});}throw new Error(`Unexpected Spotify request ${url}`);});vi.stubGlobal('fetch',fetch);
  try{const spotify=await import('../src/server/services/spotify.js');await spotify.exchangeCode('fixture-code');const snapshot=await spotify.getSnapshot(true);expect(snapshot.status).toBe('playing');expect(snapshot.current?.progressMs).toBe(1200);expect(snapshot.current?.updatedAt).toBeGreaterThan(Date.now()-2000);expect(tokenCalls).toBe(2);}finally{vi.unstubAllGlobals();vi.resetModules();await rm(dir,{recursive:true,force:true});for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 });
});
