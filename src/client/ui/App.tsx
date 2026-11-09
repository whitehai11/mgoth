import {useEffect,useRef,useState} from 'react';
import {animate,stagger} from 'animejs';
import type {SpotifySnapshot,Track} from '../types';
import {estimatePlaybackProgress} from './playback-progress';

const emptySpotify:SpotifySnapshot={connected:false,status:'disconnected',current:null,lastPlayed:null,checkedAt:new Date(0).toISOString()};
const time=(ms:number)=>`${Math.floor(Math.max(0,ms)/60_000)}:${String(Math.floor((Math.max(0,ms)%60_000)/1000)).padStart(2,'0')}`;

function Geometry(){
 const root=useRef<SVGSVGElement>(null);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const paths=root.current?.querySelectorAll('path,line,polyline');if(!paths?.length)return;const animation=animate(paths,{strokeDashoffset:[220,0],opacity:[0.15,0.72],duration:2600,delay:stagger(38),ease:'outQuad',loop:true,direction:'alternate'});return()=>{animation.cancel();};},[]);
 return <svg ref={root} className="geometry" viewBox="0 0 920 650" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth=".7" vectorEffect="non-scaling-stroke"><path d="M80 136 448 32l392 146-368 123z"/><path d="m80 136 392 165v300L80 433z"/><path d="m472 301 368-123v300L472 497z"/><path d="M80 236 472 402l368-125M80 336l392 165 368-123M202 102v382M326 67v470M594 261v277M716 219v277"/><path d="M80 136 472 301 840 178M80 433l392-132 368-123M202 102 594 261M326 67 716 219"/><line x1="80" y1="136" x2="840" y2="478"/><line x1="840" y1="178" x2="80" y2="433"/><polyline points="114,148 114,177 472,329 807,218"/><polyline points="151,160 151,188 472,324 767,225"/></g></svg>;
}

function TrackLine({track,label,playing}:{track:Track;label:string;playing:boolean}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{setNow(Date.now());if(!playing)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[playing,track.updatedAt]);
 const elapsed=estimatePlaybackProgress(track.progressMs,track.durationMs,playing,track.updatedAt,now);
 const progress=track.progressMs!==null&&track.durationMs>0?Math.min(100,elapsed/track.durationMs*100):0;
 return <div className="track-line"><div className="track-image">{track.artwork?<img src={track.artwork} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span aria-hidden="true">—</span>}</div><div className="track-copy"><div className="track-state"><span className={`state-indicator ${playing?'is-live':''}`} aria-hidden="true"/>{label}</div><a className="track-title" href={track.url} target="_blank" rel="noreferrer">{track.title}<span className="external" aria-hidden="true">↗</span></a><p className="track-artist">{track.artists.join(', ')}<span className="track-album"> / {track.album}</span></p>{track.progressMs!==null&&track.durationMs>0&&<div className="progress-row"><span>{time(elapsed)}</span><div className="progress-track" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div><span>{time(track.durationMs)}</span></div>}</div></div>;
}

async function fetchSpotify():Promise<SpotifySnapshot>{const response=await fetch('/api/spotify',{headers:{accept:'application/json'},credentials:'same-origin'});if(!response.ok)throw new Error(`Spotify status returned ${response.status}`);return response.json() as Promise<SpotifySnapshot>;}

export default function App(){
 const [spotify,setSpotify]=useState(emptySpotify);const [spotifyError,setSpotifyError]=useState(false);
 useEffect(()=>{
  const params=new URLSearchParams(location.search);if(params.has('spotify')){history.replaceState({},'',location.pathname+location.hash);if(params.get('spotify')==='error')setSpotifyError(true);}
  let sequence=0;const poll=()=>{const request=++sequence;void fetchSpotify().then(snapshot=>{if(request!==sequence)return;setSpotify(snapshot);setSpotifyError(false);}).catch(()=>{if(request===sequence)setSpotifyError(true);});};poll();const timer=window.setInterval(poll,30_000);return()=>{sequence++;clearInterval(timer);};
 },[]);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const nodes=document.querySelectorAll<HTMLElement>('[data-reveal]');nodes.forEach((node,index)=>animate(node,{opacity:[0,1],translateY:[12,0],duration:560,delay:140+index*120,ease:'outQuad'}));},[]);
 const current=spotify.current;const last=!current||spotify.status==='inactive'?spotify.lastPlayed:null;const label=spotify.status==='playing'?'Now playing':spotify.status==='paused'?'Paused':'Last played';
 const unavailable=spotify.status==='error'||spotifyError;
 return <main><section className="hero" aria-labelledby="hero-name"><div className="hero-grid" aria-hidden="true"/><Geometry/><h1 id="hero-name">Maro</h1></section><section className="content-section music-section" id="spotify" aria-labelledby="spotify-title"><div className="section-heading" data-reveal><span className="section-index">01 / AUDIO</span><h2 id="spotify-title">Spotify</h2></div><div className="music-rule"/><div className="music-content" data-reveal>{current?<TrackLine track={current} label={label} playing={spotify.status==='playing'}/>:last?<TrackLine track={last} label="Last played" playing={false}/>:<div className="empty-state"><span className="state-indicator" aria-hidden="true"/><div><p className="empty-title">{unavailable?'Music status unavailable':spotify.connected?'No recent track available':'Spotify is not connected'}</p><p className="empty-note">{spotify.message??(unavailable?'Check back shortly.':'Playback information will appear here when available.')}</p></div></div>}<a className="spotify-link" href="https://open.spotify.com/" target="_blank" rel="noreferrer">Open Spotify <span aria-hidden="true">↗</span></a></div></section><footer className="site-footer"><span>Maro</span><a href="#hero-name">Back to top <span aria-hidden="true">↑</span></a></footer></main>;
}
