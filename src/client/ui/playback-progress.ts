export function estimatePlaybackProgress(progressMs:number|null,durationMs:number,playing:boolean,receivedAt:number,now:number){
 if(progressMs===null||!Number.isFinite(progressMs)||durationMs<=0)return 0;
 const advanced=playing?Math.max(0,now-receivedAt):0;
 return Math.min(durationMs,Math.max(0,progressMs+advanced));
}
