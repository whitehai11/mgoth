# mgoth.de

A private, English-language personal site with exactly two sections: **Maro** and **Spotify**. It uses a monochrome wireframe identity, React, TypeScript, Anime.js, and a server-side Spotify Web API integration.

## Deploy

Use an Ubuntu or Debian server with DNS configured for the public domain and an HTTPS reverse proxy already running. In the existing repository checkout, run:

```bash
sudo bash setup.sh
```

The idempotent setup script installs Docker Engine and Compose when needed, preserves saved secrets, asks for the public domain and Spotify credentials, configures persistent application storage, and starts the web and private administration services. It does not install or configure a reverse proxy.

For a host-based proxy, forward the domain to `http://127.0.0.1:8080`. For an existing Docker proxy, enter its network name during setup and use `http://mgoth-web:3000` as the upstream. The private administration API is available only on host loopback at `http://127.0.0.1:3001` and is not connected to the proxy network.

### Spotify setup

Create a Spotify Developer app and add this redirect URI:

```text
https://YOUR_DOMAIN/api/spotify/callback
```

Enter the Spotify Client ID and Client Secret when prompted. The app requests only `user-read-currently-playing` and `user-read-recently-played`. The encrypted refresh token is stored at `data/app/spotify-token.enc` (or under the selected data directory). If Spotify revokes authorization, the site shows a disconnected state; reconnect through the private API.

Request a private authorization URL on the server:

```bash
ADMIN_TOKEN="$(sudo awk -F= '$1 == "ADMIN_TOKEN" {print substr($0, index($0, "=") + 1); exit}' .env)"
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3001/spotify/connect
unset ADMIN_TOKEN
```

Open the returned `url` in a browser signed in to the Spotify account owner’s account and approve access. For a headless server, create an SSH tunnel with `ssh -L 3001:127.0.0.1:3001 USER@SERVER` and request the URL from your computer using the same loopback address.

## Privacy and security

The public site has no visitor login, accounts, analytics, tracking pixels, persistent visitor identifiers, or application request logging. Fonts and frontend code are self-hosted; Spotify artwork is loaded from Spotify’s CDN. The private administration API uses constant-time token comparison or a signed HTTP-only, SameSite cookie, is rate-limited, and listens only on loopback. Spotify OAuth state is signed and time-limited; refresh tokens are encrypted with AES-GCM.

## Operations

```bash
sudo docker compose ps
sudo docker compose logs -f web admin
sudo docker compose up -d --build --remove-orphans
```

Application data is stored under the configured data directory. Back up `.env` and `app/` together. Keep `TOKEN_ENCRYPTION_KEY`; without it the saved Spotify refresh token cannot be decrypted.

Setup removes the old app’s torrent services from Compose and uses `--remove-orphans` to stop and remove their containers. It does not delete prior torrent settings beyond the obsolete keys in `.env`, downloaded ISO files, host directories, or Docker volumes. Those files remain untouched.

### Optional manual cleanup of old mirror data

No cleanup is required for the website to run. If you later choose to reclaim space, first inspect the selected data directory and make a backup. Old data may include `isos/`, `transmission-config/`, `watch/`, and `app/catalog.json`, `app/torrent-cache/`, `app/managed-torrents.json`, `app/managed-queue.json`, `app/transmission-stats.json`, `app/transmission-public-stats.json`, `app/checksums/`, and `app/verification-results.json`. Remove only the old mirror files you have identified and no longer need; setup and deployment never remove them.

## Local development

Requires Node.js 22 or later and npm.

```bash
npm ci
cp .env.example .env
# Set ADMIN_TOKEN, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, and Spotify credentials in .env.
npm run dev
```

The Vite server forwards `/api` requests to the public Node server. The private administration API listens on port `3001`.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:compose
docker compose config
```

Tests cover OAuth state and admin sessions, Spotify token refresh, and playback progress timing. The production bundle uses self-hosted fonts and respects `prefers-reduced-motion`.
