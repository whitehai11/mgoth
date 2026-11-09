#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
DATA_DEFAULT="/opt/mgoth/data"
PROXY_NETWORK_DEFAULT="npm_default"

if [[ "${EUID}" -ne 0 ]]; then echo "Run this script with sudo: sudo bash setup.sh" >&2; exit 1; fi
if [[ ! -r /etc/os-release ]]; then echo "Cannot identify this operating system." >&2; exit 1; fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != ubuntu && "${ID:-}" != debian ]]; then echo "This setup supports Ubuntu and Debian. Found: ${PRETTY_NAME:-unknown}." >&2; exit 1; fi

read_env(){ [[ -f "$ENV_FILE" ]] && awk -F= -v key="$1" '$1==key{sub(/^[^=]*=/,"");print;exit}' "$ENV_FILE" || true; }
set_env(){
 local key="$1" value="$2" tmp
 tmp="$(mktemp "$ROOT_DIR/.env.XXXXXX")"
 if [[ -f "$ENV_FILE" ]]; then
  awk -F= -v key="$key" -v value="$value" 'BEGIN{done=0}$1==key{if(!done)print key "=" value;done=1;next}{print}END{if(!done)print key "=" value}' "$ENV_FILE" >"$tmp"
 else printf '%s=%s\n' "$key" "$value" >"$tmp"; fi
 chmod 600 "$tmp";mv "$tmp" "$ENV_FILE"
}
ensure_secret(){ [[ -n "$(read_env "$1")" ]] || set_env "$1" "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"; }
remove_obsolete_settings(){
 local tmp
 tmp="$(mktemp "$ROOT_DIR/.env.XXXXXX")"
 awk -F= 'BEGIN{split("ISO_DATA_DIR MIN_FREE_DISK_GB TRUSTED_GPG_KEYRING TRANSMISSION_URL TRANSMISSION_USER TRANSMISSION_PASSWORD RETENTION_PER_DISTRO CATALOG_SYNC_HOURS MAX_SEED_STORAGE_GB UPLOAD_LIMIT_KBPS DOWNLOAD_LIMIT_KBPS MAX_ACTIVE_DOWNLOADS PUID PGID TZ PEER_PORT TRANSMISSION_IMAGE",keys," ");for(i in keys)drop[keys[i]]=1}!drop[$1]' "$ENV_FILE" >"$tmp"
 chmod 600 "$tmp";mv "$tmp" "$ENV_FILE"
}
install_docker(){
 if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then systemctl start docker 2>/dev/null || true;docker info >/dev/null 2>&1 && return;fi
 echo "Installing Docker Engine and Compose from Docker's official apt repository…"
 apt-get update;apt-get install -y ca-certificates curl
 install -m 0755 -d /etc/apt/keyrings
 if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc;chmod a+r /etc/apt/keyrings/docker.asc;fi
 local codename architecture
 codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}";architecture="$(dpkg --print-architecture)"
 [[ -n "$codename" ]] || { echo "Could not determine the OS release codename." >&2;exit 1; }
 printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$ID" "$codename" >/etc/apt/sources.list.d/docker.list
 apt-get update;apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin;systemctl enable --now docker;docker info >/dev/null
}

install_docker
if [[ ! -f "$ENV_FILE" ]]; then install -m 0600 "$ROOT_DIR/.env.example" "$ENV_FILE";fi
remove_obsolete_settings
chmod 600 "$ENV_FILE"

current_url="$(read_env PUBLIC_BASE_URL)";current_domain="${current_url#https://}";[[ "$current_domain" != "$current_url" ]] || current_domain="${current_url#http://}"
read -r -p "Public domain (DNS and HTTPS reverse proxy must point here) [${current_domain:-mgoth.de}]: " domain_input
PUBLIC_DOMAIN="${domain_input:-${current_domain:-mgoth.de}}";PUBLIC_DOMAIN="${PUBLIC_DOMAIN#https://}";PUBLIC_DOMAIN="${PUBLIC_DOMAIN#http://}"
if [[ ! "$PUBLIC_DOMAIN" =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then echo "Enter a domain name, optionally with a port, and no path." >&2;exit 1;fi
PUBLIC_URL="https://${PUBLIC_DOMAIN}";set_env PUBLIC_BASE_URL "$PUBLIC_URL";set_env SPOTIFY_REDIRECT_URI "${PUBLIC_URL}/api/spotify/callback"

existing_id="$(read_env SPOTIFY_CLIENT_ID)";read -r -p "Spotify Client ID (press Enter to keep the stored value or configure later): " spotify_id;spotify_id="${spotify_id:-$existing_id}";set_env SPOTIFY_CLIENT_ID "$spotify_id"
existing_secret="$(read_env SPOTIFY_CLIENT_SECRET)"
if [[ -n "$existing_secret" ]]; then read -r -s -p "Spotify Client Secret (press Enter to keep the stored value): " spotify_secret;else read -r -s -p "Spotify Client Secret (press Enter to configure later): " spotify_secret;fi
echo;spotify_secret="${spotify_secret:-$existing_secret}";set_env SPOTIFY_CLIENT_SECRET "$spotify_secret";unset spotify_secret existing_secret

current_root="$(read_env DATA_ROOT)"
# Older deployments stored application files one level below DATA_ROOT in an app/ directory.
if [[ -n "$current_root" ]]; then
 legacy_root="$current_root";[[ "$legacy_root" == /* ]] || legacy_root="$ROOT_DIR/$legacy_root"
 if [[ -d "$legacy_root/app" && ! -e "$legacy_root/spotify-token.enc" ]]; then current_root="$legacy_root/app";fi
fi
read -r -p "Persistent Spotify application data directory [${current_root:-$DATA_DEFAULT}]: " data_input;DATA_ROOT="${data_input:-${current_root:-$DATA_DEFAULT}}";[[ "$DATA_ROOT" == /* ]] || DATA_ROOT="$ROOT_DIR/$DATA_ROOT"
case "$DATA_ROOT" in *:*|*$'\n'*) echo "The data directory cannot contain a colon or newline." >&2;exit 1;; esac
set_env DATA_ROOT "$DATA_ROOT"

current_proxy_network="$(read_env PROXY_NETWORK)";read -r -p "Existing Docker reverse-proxy network [${current_proxy_network:-$PROXY_NETWORK_DEFAULT}]: " proxy_network_input;PROXY_NETWORK="${proxy_network_input:-${current_proxy_network:-$PROXY_NETWORK_DEFAULT}}"
if [[ ! "$PROXY_NETWORK" =~ ^[A-Za-z0-9_.-]+$ ]] || ! docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then echo "Create or select the existing reverse-proxy Docker network (default: $PROXY_NETWORK_DEFAULT), then rerun setup." >&2;exit 1;fi
set_env PROXY_NETWORK "$PROXY_NETWORK";set_env COMPOSE_FILE "docker-compose.yml:deploy/docker-compose.proxy.yml"

ensure_secret ADMIN_TOKEN;ensure_secret SESSION_SECRET;ensure_secret TOKEN_ENCRYPTION_KEY
mkdir -p "$DATA_ROOT";chown 1000:1000 "$DATA_ROOT";chmod 750 "$DATA_ROOT";chmod 600 "$ENV_FILE"

cd "$ROOT_DIR"
echo "Building the website and private Spotify administration service…"
docker compose --env-file "$ENV_FILE" config -q
docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans

echo "Waiting for service health checks…"
ready=0
for _ in $(seq 1 150); do
 web_id="$(docker compose --env-file "$ENV_FILE" ps -q web)";admin_id="$(docker compose --env-file "$ENV_FILE" ps -q admin)"
 web_health="$(docker inspect --format '{{.State.Health.Status}}' "$web_id" 2>/dev/null || true)";admin_health="$(docker inspect --format '{{.State.Health.Status}}' "$admin_id" 2>/dev/null || true)"
 if [[ "$web_health" == healthy && "$admin_health" == healthy ]] && curl -fsS --max-time 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then ready=1;break;fi
 sleep 2
done
if (( ready==0 )); then docker compose --env-file "$ENV_FILE" ps;echo "The services did not become healthy. Inspect logs with: sudo docker compose logs --tail=100" >&2;exit 1;fi

echo "Deployment is healthy. Configure your existing HTTPS reverse proxy to forward the domain to http://127.0.0.1:8080."
echo "The private Spotify administration API listens on 127.0.0.1:3001 and is not connected to the public proxy network."
if [[ -n "$PROXY_NETWORK" ]]; then echo "For a Docker reverse proxy, use http://mgoth-web:3000 on '$PROXY_NETWORK'.";fi
echo "Persistent Spotify application data: $DATA_ROOT"
echo "Use the private /spotify/connect endpoint to authorize Spotify; instructions are in README.md."
