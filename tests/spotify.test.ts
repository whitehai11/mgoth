import {describe,expect,it} from 'vitest';
import {createOAuthState,verifyOAuthState} from '../src/server/services/spotify.js';
import {createSession,validSession} from '../src/server/lib/auth.js';
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
});
