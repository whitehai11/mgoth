import {afterEach,describe,expect,it,vi} from 'vitest';
import {DISTROS,inferArch,isOfficialUrl,parseSource,versionFrom,dateFrom,getTorrentBytes} from '../src/server/services/catalog.js';

afterEach(()=>vi.unstubAllGlobals());
describe('official distribution catalog',()=>{
 it('rejects lookalike, insecure, and unapproved source URLs',()=>{
  const arch=DISTROS.find(x=>x.id==='arch')!;
  expect(isOfficialUrl('https://archlinux.org/releng/x.torrent',arch)).toBe(true);
  expect(isOfficialUrl('http://archlinux.org/releng/x.torrent',arch)).toBe(false);
  expect(isOfficialUrl('https://archlinux.org.attacker.example/x.torrent',arch)).toBe(false);
  expect(isOfficialUrl('https://example.org/archlinux.torrent',arch)).toBe(false);
 });
 it('extracts only releases linked from the official project page',async()=>{
  const html='<main><a href="/releng/releases/2026.11.01/archlinux-2026.11.01-x86_64.iso.torrent">Torrent 2026.11.01 x86_64</a><a href="https://example.org/fake.iso.torrent">Torrent 2030.01 fake</a></main>';
  const torrent=Buffer.concat([Buffer.from('d4:infod6:lengthi1e4:name4:test12:piece lengthi16384e6:pieces20:'),Buffer.alloc(20,120),Buffer.from('ee')]);
  const fetch=vi.fn().mockResolvedValueOnce(new Response(html,{status:200,headers:{'content-type':'text/html'}})).mockResolvedValueOnce(new Response(torrent,{status:200}));
  vi.stubGlobal('fetch',fetch);
  const releases=await parseSource(DISTROS.find(x=>x.id==='arch')!);
  expect(releases).toHaveLength(1);
  expect(releases[0]?.distro).toBe('arch');
  expect(releases[0]?.torrentUrl).toBe('https://archlinux.org/releng/releases/2026.11.01/archlinux-2026.11.01-x86_64.iso.torrent');
  expect(releases[0]?.architecture).toBe('x86_64');
  expect(releases[0]?.sizeBytes).toBe(1);
  expect(releases[0]?.magnetUrl).toMatch(/^magnet:\?xt=urn%3Abtih%3A[0-9a-f]{40}/i);
  expect(await getTorrentBytes(releases[0]!.id)).toEqual(torrent);
 });
 it('normalizes release fields without inventing missing dates',()=>{
  expect(inferArch('debian-13.2.0-arm64.iso.torrent')).toBe('arm64');
  expect(versionFrom('Fedora Workstation 44 x86_64','workstation.iso')).toBe('44');
  expect(dateFrom('release date 2026-11-09')).toBe('2026-11-09');
  expect(dateFrom('no published release date')).toBeNull();
 });
});
