declare module 'torrent-parser' {
  type ParsedTorrent = { name?: string; length?: number | null; files?: Array<{ length?: number }>; infoHash?: string; announce?: string[] };
  const torrentParser: { decodeTorrent(input: Buffer | Uint8Array | string): ParsedTorrent };
  export default torrentParser;
}
