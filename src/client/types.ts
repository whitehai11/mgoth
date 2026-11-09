export type Track={title:string;artists:string[];album:string;artwork:string|null;url:string;durationMs:number;progressMs:number|null;isPlaying:boolean;updatedAt:number};
export type SpotifySnapshot={connected:boolean;status:'playing'|'paused'|'inactive'|'disconnected'|'error';current:Track|null;lastPlayed:Track|null;checkedAt:string;message?:string};
