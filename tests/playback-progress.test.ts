import {describe,expect,it} from 'vitest';
import {estimatePlaybackProgress} from '../src/client/ui/playback-progress.js';
describe('Spotify playback progress reference clock',()=>{
 it('advances from the response receipt time while playing',()=>expect(estimatePlaybackProgress(30_000,180_000,true,1_000,6_000)).toBe(35_000));
 it('freezes while paused and never reports a missing API position as zero progress',()=>{expect(estimatePlaybackProgress(30_000,180_000,false,1_000,60_000)).toBe(30_000);expect(estimatePlaybackProgress(null,180_000,true,1_000,60_000)).toBe(0);});
 it('clamps delayed and excessive progress to valid track bounds',()=>{expect(estimatePlaybackProgress(179_000,180_000,true,1_000,60_000)).toBe(180_000);expect(estimatePlaybackProgress(10_000,180_000,true,5_000,1_000)).toBe(10_000);});
});
