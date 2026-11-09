# mgoth.de

A one-page personal site with a monochrome wireframe identity, a private Spotify integration, and an automatically synchronized index of official Linux ISO torrents. The site is English-only and built with React, TypeScript, Anime.js, and Node.js.

## Deploy

Use a fresh Ubuntu or Debian server with a public DNS record for the domain and an HTTPS reverse proxy already running. Clone this repository, enter its directory, and run the setup script:

```bash
git clone <repository-url>
cd mgoth.de
sudo bash setup.sh
```

The script installs Docker Engine and Compose from Docker’s official apt repository when needed. It asks for the public domain, optional Spotify app credentials, persistent storage location, torrent storage reservation, bandwidth limits, download concurrency, catalog retention, refresh interval, peer port, and (if applicable) the existing Docker network used by a containerized reverse proxy. Generated secrets and prior settings are preserved on subsequent runs. The script creates service directories only when needed and does not clear saved data.

For a reverse proxy running on the host, the public app listens on `127.0.0.1:8080`. Point the proxy at `http://127.0.0.1:8080`, enable HTTPS there, and preserve the `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers. For a reverse proxy running in Docker, enter its existing network name during setup; the public app joins that network as `mgoth-web:3000`, and the generated Compose override leaves admin, worker, and Transmission off the proxy network. Set the proxy upstream to `http://mgoth-web:3000`. No TLS listener or proxy configuration is installed by this project, so unrelated proxy services remain untouched.

For Nginx Proxy Manager in Docker, find its network with `docker inspect -f '{{range $name, $conf := .NetworkSettings.Networks}}{{$name}} {{end}}' <proxy-container-name>` and enter one of those existing network names during setup. Its current proxy host can then target `mgoth-web` on port `3000` without changing the other proxy hosts.

### Spotify credentials

Create a Spotify Developer app and add this exact Redirect URI to its settings:

```text
https://YOUR_DOMAIN/api/spotify/callback
```

Enter the app’s Client ID and Client Secret when setup asks. Press Enter to skip credentials temporarily; rerunning setup lets you add them later. Playback data appears after the owner completes OAuth authorization. The app follows Spotify’s [authorization-code flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) and requests only `user-read-currently-playing` and `user-read-recently-played`. Spotify refresh tokens expire after six months; when Spotify returns `invalid_grant`, the app clears the expired token and shows a disconnected state so you can authorize again through the private API. Spotify credentials stay on the server; the encrypted refresh token is stored in `data/app/spotify-token.enc` (or the selected data directory).

### Complete Spotify authorization

The administration API is published only to host loopback on port `3001`; the public website’s reverse-proxy port does not contain administration routes. On the server, request an authorization link with the generated bearer token:

```bash
ADMIN_TOKEN="$(sudo awk -F= '$1 == "ADMIN_TOKEN" {print substr($0, index($0, "=") + 1); exit}' .env)"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3001/spotify/connect
unset ADMIN_TOKEN
```

Open the returned `url` in a browser where the Spotify account owner is signed in and approve the requested access. If the server has no desktop, run an SSH tunnel with `ssh -L 3001:127.0.0.1:3001 USER@SERVER`, then run the same request against `http://127.0.0.1:3001` from your computer. The callback still reaches the public HTTPS domain.

### Ports and seeding

The web interface and public API are available through the reverse proxy. The private administration API runs as a separate service and is loopback-only on host port `3001`; it does not join the Docker proxy network. Transmission’s RPC and Web UI are not published. The peer port selected during setup is published for TCP and UDP so other BitTorrent peers can connect. Permit that port through the host firewall and any upstream NAT to receive inbound peers. Outbound connections still work if inbound forwarding is unavailable, but peer reachability may be lower.

The storage reservation is enforced before the worker adds another torrent: Transmission’s existing torrent sizes plus the next ISO must fit within 95% of the configured GiB limit. The remaining 5% is reserved for partial-file and filesystem overhead. Upload/download limits are applied in KiB/s; zero means unlimited. The Transmission download queue limits simultaneous downloads.

The catalog retention setting controls how many current official releases per distribution remain indexed. Torrents that leave the retained catalog are stopped. Their completed ISO data is preserved and still counts against the storage reservation; remove old ISO data from `isos/` and its Transmission record only when you intend to reclaim that space. The setup script never empties volumes.

## How the mirror works

The catalog worker reads official project download pages, validates HTTPS hosts against an explicit per-distribution allowlist, follows only same-project allowlisted redirects, and keeps a local cache of official `.torrent` files. It derives a magnet URI only by parsing the info hash from an official torrent file. Release details missing from an official source stay blank or “Not specified”; no synthetic releases or torrent links are generated. If no official torrent is found, the row links to that distribution’s official download page.

The public catalog distinguishes a mirrored `.torrent` metadata file from a complete ISO being seeded. “ISO actively seeding” is shown only when Transmission reports that the torrent has completed verification and is seeding. A torrent still downloading, queued, stopped, or absent from Transmission is never presented as an active seed.

Configured official sources:

- [Arch Linux](https://archlinux.org/releng/releases/)
- [Ubuntu](https://ubuntu.com/download/alternative-downloads)
- [Debian](https://www.debian.org/CD/torrent-cd/)
- [Fedora](https://torrent.fedoraproject.org/)
- [Linux Mint](https://linuxmint.com/download.php) (the worker also checks official edition pages)
- [Gentoo](https://www.gentoo.org/downloads/)
- [Void Linux](https://voidlinux.org/download/)
- [openSUSE](https://get.opensuse.org/)

Some projects may not publish official torrents for their current installer images. Their official download pages remain available in the accordion, and the mirror does not substitute a third-party torrent.

## Private administration API

Private routes accept `Authorization: Bearer <ADMIN_TOKEN>` or a signed HTTP-only session cookie. The login route accepts the admin token as its password; all of these routes stay loopback-only. They are reachable on `http://127.0.0.1:3001` on the server, not through the public reverse proxy.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Private API health check |
| `POST` | `/login` | Exchange the admin token for a signed, HTTP-only cookie |
| `GET` | `/status` | Spotify and Transmission status |
| `GET` | `/spotify/connect` | Create a protected OAuth authorization URL |
| `POST` | `/catalog/sync` | Refresh official metadata immediately |
| `POST` | `/seeds/reconcile` | Reconcile retained official torrents with Transmission |

Example status request:

```bash
ADMIN_TOKEN="$(sudo awk -F= '$1 == "ADMIN_TOKEN" {print substr($0, index($0, "=") + 1); exit}' .env)"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3001/status
unset ADMIN_TOKEN
```

## Operations

```bash
sudo docker compose ps
sudo docker compose logs -f web admin worker transmission
sudo docker compose pull
sudo docker compose up -d --build
```

The Docker Compose services restart automatically. Logs use Docker’s JSON driver with rotation. Persistent content lives under the data directory configured during setup:

- `app/catalog.json` and `app/torrent-cache/`: official catalog and mirrored torrent files
- `app/spotify-token.enc`: encrypted Spotify refresh token
- `app/worker.heartbeat`: synchronization-worker health marker
- `transmission-config/`: Transmission settings
- `isos/`: downloaded and seeded ISO data
- `watch/`: Transmission watch directory

Back up `.env` and the whole data directory together. If `TOKEN_ENCRYPTION_KEY` is lost, the saved Spotify refresh token cannot be decrypted; the Spotify account can be authorized again.

## Local development

Requires Node.js 22 or later and npm.

```bash
npm ci
cp .env.example .env
# Set ADMIN_TOKEN, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, and TRANSMISSION_PASSWORD in .env.
npm run dev
```

The Vite development server proxies `/api` to `localhost:3000`; the private API listens on `3001`. To run the official catalog or the Spotify flow locally, configure the required services and Spotify credentials in `.env`.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:compose
docker compose config
```

Tests cover OAuth/admin token integrity, allowlisted torrent sources, release field extraction, caching, size extraction, and magnet derivation. `npm run validate:compose` checks the Compose YAML and the private-networking invariants; `docker compose config` on the target server performs Docker’s full interpolation and installed-version validation. The production bundle self-hosts its fonts and includes Anime.js motion while respecting reduced-motion settings.
