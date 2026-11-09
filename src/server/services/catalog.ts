import { load } from 'cheerio';
import { readFile, writeFile, mkdir, readdir, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import torrentParser from 'torrent-parser';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export type DistroId = 'arch'|'ubuntu'|'debian'|'fedora'|'mint'|'gentoo'|'void'|'opensuse';
export type Release = { id:string; distro:DistroId; name:string; version:string; architecture:string; date:string|null; sizeBytes:number|null; torrentUrl:string|null; magnetUrl:string|null; downloadPage:string; sourceUrl:string; syncedAt:string; seedStatus?:SeedStatus };
export type SeedStatus = 'queued'|'downloading'|'verifying'|'seeding'|'stopped'|'unavailable';
export type Distro = {id:DistroId;name:string;sourceUrl:string;downloadPage:string;allowedHosts:string[]};
export const DISTROS:Distro[]=[
 {id:'arch',name:'Arch Linux',sourceUrl:'https://archlinux.org/releng/releases/',downloadPage:'https://archlinux.org/download/',allowedHosts:['archlinux.org']},
 {id:'ubuntu',name:'Ubuntu',sourceUrl:'https://ubuntu.com/download/alternative-downloads',downloadPage:'https://ubuntu.com/download/alternative-downloads',allowedHosts:['ubuntu.com','releases.ubuntu.com','torrent.ubuntu.com','bittorrent.ubuntu.com']},
 {id:'debian',name:'Debian',sourceUrl:'https://www.debian.org/CD/torrent-cd/',downloadPage:'https://www.debian.org/distrib/',allowedHosts:['debian.org','cdimage.debian.org']},
 {id:'fedora',name:'Fedora',sourceUrl:'https://torrent.fedoraproject.org/',downloadPage:'https://fedoraproject.org/workstation/download/',allowedHosts:['fedoraproject.org','torrent.fedoraproject.org','dl.fedoraproject.org']},
 {id:'mint',name:'Linux Mint',sourceUrl:'https://linuxmint.com/download.php',downloadPage:'https://linuxmint.com/download.php',allowedHosts:['linuxmint.com']},
 {id:'gentoo',name:'Gentoo',sourceUrl:'https://www.gentoo.org/downloads/',downloadPage:'https://www.gentoo.org/downloads/',allowedHosts:['gentoo.org','distfiles.gentoo.org','distfiles-cdn.gentoo.org']},
 {id:'void',name:'Void Linux',sourceUrl:'https://voidlinux.org/download/',downloadPage:'https://voidlinux.org/download/',allowedHosts:['voidlinux.org','repo-default.voidlinux.org','repo-de.voidlinux.org']},
 {id:'opensuse',name:'openSUSE',sourceUrl:'https://get.opensuse.org/',downloadPage:'https://get.opensuse.org/',allowedHosts:['opensuse.org','download.opensuse.org']}
];
const catalogPath=path.resolve(env.DATA_DIR,'catalog.json');
const mirrorsPath=path.resolve(env.DATA_DIR,'torrent-cache');
export const isOfficialUrl=(raw:string,distro:Distro)=>{try{const u=new URL(raw);return u.protocol==='https:'&&distro.allowedHosts.some(h=>u.hostname===h||u.hostname.endsWith(`.${h}`));}catch{return false;}};
const uniqueId=(d:DistroId,raw:string)=>`${d}-${createHash('sha256').update(raw).digest('hex').slice(0,18)}`;
const formatName=(raw:string)=>{const name=raw.split('/').pop()?.replace(/\.torrent$/i,'').replace(/[-_]/g,' ')??'Official release';try{return decodeURIComponent(name);}catch{return name;}};
export const inferArch=(s:string)=>{const x=s.toLowerCase();return /arm64|aarch64/.test(x)?'arm64':/armhf/.test(x)?'armhf':/riscv64/.test(x)?'riscv64':/ppc64el|powerpc64le/.test(x)?'ppc64el':/s390x/.test(x)?'s390x':/amd64|x86_64|x64/.test(x)?'x86_64':/i386|i686/.test(x)?'x86': 'Not specified';};
const filePath=(id:string)=>path.join(mirrorsPath,`${id}.torrent`);

export async function readCatalog():Promise<Release[]>{try{return JSON.parse(await readFile(catalogPath,'utf8')) as Release[];}catch{return [];}}
async function cacheTorrent(release:Release,source:Buffer){await mkdir(mirrorsPath,{recursive:true});const target=filePath(release.id);const temporary=`${target}.${process.pid}.tmp`;await writeFile(temporary,source,{mode:0o640});await rename(temporary,target);}
export async function getTorrentBytes(id:string):Promise<Buffer|null>{try{return await readFile(filePath(id));}catch{return null;}}

async function fetchOfficial(url:string,d:Distro,limit:number,timeout:number){
 let target=url;
 for(let hop=0;hop<4;hop++){
  if(!isOfficialUrl(target,d))throw new Error(`${d.name} source contains an unapproved URL`);
  const response=await fetch(target,{headers:{'user-agent':'mgoth.de official distribution mirror index/1.0'},signal:AbortSignal.timeout(timeout),redirect:'manual'});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Official source redirect omitted its target');target=new URL(location,target).toString();continue;}
  if(!response.ok)throw new Error(`${d.name} source returned HTTP ${response.status}`);
  const reader=response.body?.getReader();if(!reader)throw new Error('Official source returned an empty response');const parts:Uint8Array[]=[];let length=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>limit){await reader.cancel();throw new Error(`${d.name} source response exceeded the size limit`);}parts.push(chunk.value);}
  return {url:target,bytes:Buffer.concat(parts.map(part=>Buffer.from(part)))};
 }
 throw new Error(`${d.name} source exceeded the redirect limit`);
}
export async function parseSource(d:Distro):Promise<Release[]>{
 const first=await fetchOfficial(d.sourceUrl,d,2_000_000,18_000);
 const pages=[{url:first.url,html:first.bytes.toString('utf8')}];
 if(d.id==='mint'){
  const root=load(pages[0]!.html);const seen=new Set<string>([d.sourceUrl]);
  const links=root('a[href]').map((_i,a)=>{try{return new URL(root(a).attr('href')??'',pages[0]!.url).toString();}catch{return '';}}).get().filter(url=>url.startsWith('https://linuxmint.com/edition.php?id=')&&!seen.has(url)).slice(0,18);
  for(let i=0;i<links.length;i+=4){const batch=links.slice(i,i+4);const results=await Promise.all(batch.map(async url=>{seen.add(url);try{return await fetchOfficial(url,d,1_000_000,12_000);}catch(error){logger.warn({url,error},'Official Mint edition page unavailable');return null;}}));for(const result of results){if(result)pages.push({url:result.url,html:result.bytes.toString('utf8')});}}
 }
 const found=new Map<string,Release>();const syncedAt=new Date().toISOString();
 for(const page of pages){const $=load(page.html);$('a[href]').each((_i,el)=>{const href=$(el).attr('href');if(!href)return;let absolute:string;try{absolute=new URL(href,page.url).toString();}catch{return;}const isMagnet=absolute.toLowerCase().startsWith('magnet:');if(!isMagnet&&!isOfficialUrl(absolute,d))return;
  const label=$(el).text().trim();const rawContext=$(el).parent().text().replace(/\s+/g,' ').trim();const context=`${label} ${rawContext} ${absolute}`;
  if(absolute.toLowerCase().startsWith('magnet:')){
   const params=new URLSearchParams(absolute.slice(7));const hash=params.get('xt')?.replace(/^urn:btih:/i,'');if(!hash||!(/^[a-f0-9]{40}$/i.test(hash)||/^[a-z2-7]{32}$/i.test(hash)))return;
   const key=`${hash.toLowerCase()}`;const name=params.get('dn')??label;if(!/\.iso/i.test(name)&&!/image/i.test(context))return;
   const release:Release={id:uniqueId(d.id,key),distro:d.id,name:formatName(name),version:versionFrom(context,name),architecture:inferArch(context),date:dateFrom(context),sizeBytes:Number(params.get('xl'))||null,torrentUrl:null,magnetUrl:absolute,downloadPage:d.downloadPage,sourceUrl:d.sourceUrl,syncedAt};found.set(key,release);return;
  }
  if(!/\.torrent(?:$|[?#])/i.test(absolute))return;
  const clean=absolute.split(/[?#]/)[0]!;if(found.has(clean))return;
  const text=`${label} ${rawContext} ${clean}`;const name=formatName(clean);if(!/\.iso/i.test(name)&&!/\.iso/i.test(text)&&!/torrent/i.test(label))return;
  const release:Release={id:uniqueId(d.id,clean),distro:d.id,name,version:versionFrom(text,name),architecture:inferArch(text),date:dateFrom(text),sizeBytes:null,torrentUrl:clean,magnetUrl:null,downloadPage:d.downloadPage,sourceUrl:d.sourceUrl,syncedAt};found.set(clean,release);
 });}
 const releases=[...found.values()];
 for(const release of releases.slice(0,Math.max(1,env.RETENTION_PER_DISTRO))){if(release.torrentUrl){try{const fetched=await fetchOfficial(release.torrentUrl,d,8_000_000,15_000);const bytes=fetched.bytes;const parsed=torrentParser.decodeTorrent(bytes);await cacheTorrent(release,bytes);const size=parsed.length??parsed.files?.reduce<number>((sum:number,f:{length?:number})=>sum+(f.length??0),0)??null;release.sizeBytes=size||release.sizeBytes;
     if(parsed.infoHash){const params=new URLSearchParams({xt:`urn:btih:${parsed.infoHash}`,dn:parsed.name??release.name});for(const tracker of (parsed.announce??[]).slice(0,40)){if(/^(https?|udp):\/\//i.test(tracker))params.append('tr',tracker);}release.magnetUrl=`magnet:?${params.toString()}`;}
    }catch(error){logger.warn({distro:d.id,url:release.torrentUrl,error},'Could not cache official torrent metadata');}}
 }
 return releases;
}
export function versionFrom(text:string,name:string){return text.match(/\b\d{2,4}\.\d{1,2}(?:\.\d{1,2})?\b/)?.[0]??text.match(/\b(?:Fedora|Ubuntu|Debian|Linux Mint|Mint)[^\d]{0,20}(\d{2,4})\b/i)?.[1]??name.match(/\b\d+(?:\.\d+){1,3}\b/)?.[0]??'Current release';}
export function dateFrom(text:string){const iso=text.match(/\b20\d{2}-\d{2}-\d{2}\b/);if(iso)return iso[0];const slash=text.match(/\b20\d{2}\/\d{2}\/\d{2}\b/);return slash?.[0].replaceAll('/','-')??null;}
export async function syncCatalog():Promise<{updated:number;failed:string[]}>{const current=await readCatalog();const byDistro=new Map<DistroId,Release[]>();const failed:string[]=[];
 for(const d of DISTROS){try{const fresh=await parseSource(d);if(fresh.length){byDistro.set(d.id,fresh);}else{byDistro.set(d.id,current.filter(x=>x.distro===d.id));logger.info({distro:d.id},'No official torrent links found; official download page remains available');}}catch(error){failed.push(d.name);byDistro.set(d.id,current.filter(x=>x.distro===d.id));logger.error({distro:d.id,error},'Catalog synchronization failed; preserving cached releases');}}
 const retention=Math.max(1,env.RETENTION_PER_DISTRO);const merged=DISTROS.flatMap(d=>{const vals=byDistro.get(d.id)??[];return vals.slice(0,retention);});await mkdir(env.DATA_DIR,{recursive:true});const temporary=`${catalogPath}.${process.pid}.tmp`;await writeFile(temporary,JSON.stringify(merged,null,2),{mode:0o640});await rename(temporary,catalogPath);const active=new Set(merged.filter(r=>r.torrentUrl).map(r=>`${r.id}.torrent`));try{for(const name of await readdir(mirrorsPath)){if(name.endsWith('.torrent')&&!active.has(name))await unlink(path.join(mirrorsPath,name));}}catch(error){logger.warn({error},'Torrent metadata retention cleanup failed');}return {updated:merged.length,failed};}
