export type Track={title:string;artists:string[];album:string;artwork:string|null;url:string;durationMs:number;progressMs:number|null;isPlaying:boolean;updatedAt:number};
export type SpotifySnapshot={connected:boolean;status:'playing'|'paused'|'inactive'|'disconnected'|'error';current:Track|null;lastPlayed:Track|null;checkedAt:string;message?:string};
export type Distro={id:string;name:string;sourceUrl:string;downloadPage:string};
export type Release={id:string;distro:string;name:string;version:string;architecture:string;date:string|null;sizeBytes:number|null;torrentUrl:string|null;magnetUrl:string|null;downloadPage:string;sourceUrl:string;syncedAt:string;seedStatus:'queued'|'downloading'|'verifying'|'seeding'|'stopped'|'unavailable'};
export type Catalog={distributions:Distro[];releases:Release[];updatedAt:string|null};
