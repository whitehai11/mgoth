#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
DATA_DEFAULT="$ROOT_DIR/data"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash setup.sh" >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/docker-compose.yml" ]]; then
  echo "Run setup.sh from a mgoth.de repository checkout." >&2
  exit 1
fi
if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify this operating system." >&2
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
  echo "This setup supports Ubuntu and Debian. Found: ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi

read_env() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
  fi
}
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$ROOT_DIR/.env.XXXXXX")"
  if [[ -f "$ENV_FILE" ]]; then
    awk -F= -v key="$key" -v value="$value" '
      BEGIN {done=0}
      $1 == key {if (!done) print key "=" value; done=1; next}
      {print}
      END {if (!done) print key "=" value}
    ' "$ENV_FILE" > "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}
ensure_secret() {
  local key="$1" current
  current="$(read_env "$key")"
  if [[ -z "$current" ]]; then
    set_env "$key" "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    systemctl start docker 2>/dev/null || true
    docker info >/dev/null 2>&1 && return
  fi
  echo "Installing Docker Engine and the Compose plugin from Docker's official repository…"
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  local codename architecture
  codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
  architecture="$(dpkg --print-architecture)"
  if [[ -z "$codename" ]]; then
    echo "Could not determine the distribution codename for Docker's package repository." >&2
    exit 1
  fi
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$architecture" "$ID" "$codename" >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  docker info >/dev/null
}

install_docker

if [[ ! -f "$ENV_FILE" ]]; then
  install -m 0600 "$ROOT_DIR/.env.example" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

current_url="$(read_env PUBLIC_BASE_URL)"
current_domain="${current_url#https://}"
if [[ "$current_domain" == "$current_url" ]]; then current_domain="${current_url#http://}"; fi
read -r -p "Public domain (DNS and HTTPS reverse proxy must point here) [${current_domain:-mgoth.de}]: " domain_input
PUBLIC_DOMAIN="${domain_input:-${current_domain:-mgoth.de}}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN#https://}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN#http://}"
if [[ ! "$PUBLIC_DOMAIN" =~ ^[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
  echo "Enter a domain name, optionally followed by a port. Do not include a path." >&2
  exit 1
fi
PUBLIC_URL="https://${PUBLIC_DOMAIN}"
set_env PUBLIC_BASE_URL "$PUBLIC_URL"
set_env SPOTIFY_REDIRECT_URI "${PUBLIC_URL}/api/spotify/callback"

existing_id="$(read_env SPOTIFY_CLIENT_ID)"
read -r -p "Spotify Client ID (press Enter to configure it later): " spotify_id
spotify_id="${spotify_id:-$existing_id}"
if [[ -n "$spotify_id" ]]; then set_env SPOTIFY_CLIENT_ID "$spotify_id"; fi
existing_secret="$(read_env SPOTIFY_CLIENT_SECRET)"
if [[ -n "$existing_secret" ]]; then
  read -r -s -p "Spotify Client Secret (press Enter to keep the stored value): " spotify_secret
  echo
else
  read -r -s -p "Spotify Client Secret (press Enter to configure it later): " spotify_secret
  echo
fi
spotify_secret="${spotify_secret:-$existing_secret}"
if [[ -n "$spotify_secret" ]]; then set_env SPOTIFY_CLIENT_SECRET "$spotify_secret"; fi
unset spotify_secret existing_secret

current_root="$(read_env DATA_ROOT)"
read -r -p "Persistent data directory [${current_root:-$DATA_DEFAULT}]: " data_input
DATA_ROOT="${data_input:-${current_root:-$DATA_DEFAULT}}"
if [[ "$DATA_ROOT" != /* ]]; then DATA_ROOT="$ROOT_DIR/$DATA_ROOT"; fi
case "$DATA_ROOT" in *:*|*$'\n'*) echo "The data directory cannot contain a colon or newline." >&2; exit 1;; esac
set_env DATA_ROOT "$DATA_ROOT"

prompt_setting() {
  local key="$1" label="$2" fallback="$3" value
  value="$(read_env "$key")"
  read -r -p "$label [${value:-$fallback}]: " input
  set_env "$key" "${input:-${value:-$fallback}}"
}
prompt_setting MAX_SEED_STORAGE_GB "Maximum total torrent data reservation in GiB" "100"
prompt_setting UPLOAD_LIMIT_KBPS "Upload limit in KiB/s (0 = unlimited)" "0"
prompt_setting DOWNLOAD_LIMIT_KBPS "Download limit in KiB/s (0 = unlimited)" "0"
prompt_setting MAX_ACTIVE_DOWNLOADS "Maximum simultaneous downloads" "2"
prompt_setting RETENTION_PER_DISTRO "Catalog retention per distribution" "3"
prompt_setting CATALOG_SYNC_HOURS "Catalog refresh interval in hours" "12"
prompt_setting PEER_PORT "Public BitTorrent peer port (TCP and UDP)" "51413"
current_proxy_network="$(read_env PROXY_NETWORK)"
read -r -p "Existing Docker reverse-proxy network (leave blank if the proxy runs on the host) [${current_proxy_network}]: " proxy_network_input
PROXY_NETWORK="${proxy_network_input:-$current_proxy_network}"
if [[ -n "$PROXY_NETWORK" ]]; then
  if [[ ! "$PROXY_NETWORK" =~ ^[A-Za-z0-9_.-]+$ ]] || ! docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
    echo "Enter the name of an existing Docker network used by the reverse proxy." >&2
    exit 1
  fi
  set_env PROXY_NETWORK "$PROXY_NETWORK"
  set_env COMPOSE_FILE "docker-compose.yml:deploy/docker-compose.proxy.yml"
else
  set_env PROXY_NETWORK ""
  set_env COMPOSE_FILE "docker-compose.yml"
fi

valid_integer() { [[ "$2" =~ ^[0-9]+$ ]] && (( $2 >= $3 && $2 <= $4 )); }
valid_decimal() { [[ "$2" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk -v n="$2" -v min="$3" -v max="$4" 'BEGIN {exit !(n >= min && n <= max)}'; }
valid_decimal MAX_SEED_STORAGE_GB "$(read_env MAX_SEED_STORAGE_GB)" 0.01 100000 || { echo "Torrent storage reservation must be between 0.01 and 100000 GiB." >&2; exit 1; }
valid_integer UPLOAD_LIMIT_KBPS "$(read_env UPLOAD_LIMIT_KBPS)" 0 1000000 || { echo "Upload limit must be an integer from 0 through 1000000 KiB/s." >&2; exit 1; }
valid_integer DOWNLOAD_LIMIT_KBPS "$(read_env DOWNLOAD_LIMIT_KBPS)" 0 1000000 || { echo "Download limit must be an integer from 0 through 1000000 KiB/s." >&2; exit 1; }
valid_integer MAX_ACTIVE_DOWNLOADS "$(read_env MAX_ACTIVE_DOWNLOADS)" 1 100 || { echo "Simultaneous downloads must be an integer from 1 through 100." >&2; exit 1; }
valid_integer RETENTION_PER_DISTRO "$(read_env RETENTION_PER_DISTRO)" 1 100 || { echo "Catalog retention must be an integer from 1 through 100." >&2; exit 1; }
valid_integer CATALOG_SYNC_HOURS "$(read_env CATALOG_SYNC_HOURS)" 1 168 || { echo "Catalog interval must be an integer from 1 through 168 hours." >&2; exit 1; }
valid_integer PEER_PORT "$(read_env PEER_PORT)" 1 65535 || { echo "Peer port must be an integer from 1 through 65535." >&2; exit 1; }
existing_transmission=""
if existing_transmission="$(docker compose --env-file "$ENV_FILE" ps -q transmission 2>/dev/null)" && [[ -n "$existing_transmission" ]]; then
  : # The current deployment owns its already-bound peer port; reruns stay idempotent.
elif command -v ss >/dev/null 2>&1 && ss -H -ltnu "sport = :$(read_env PEER_PORT)" | grep -q .; then
  echo "Peer port $(read_env PEER_PORT) already has a local listener. Rerun setup and choose a free port." >&2
  exit 1
fi

ensure_secret ADMIN_TOKEN
ensure_secret SESSION_SECRET
ensure_secret TOKEN_ENCRYPTION_KEY
if [[ -z "$(read_env TRANSMISSION_PASSWORD)" ]]; then
  set_env TRANSMISSION_PASSWORD "$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
fi
if [[ -z "$(read_env TRANSMISSION_USER)" ]]; then set_env TRANSMISSION_USER mgoth; fi
if [[ -z "$(read_env PUID)" ]]; then set_env PUID "${SUDO_UID:-1000}"; fi
if [[ -z "$(read_env PGID)" ]]; then set_env PGID "${SUDO_GID:-1000}"; fi
if [[ -z "$(read_env TZ)" ]]; then set_env TZ Europe/Berlin; fi

mkdir -p "$DATA_ROOT/app/torrent-cache" "$DATA_ROOT/transmission-config" "$DATA_ROOT/isos" "$DATA_ROOT/watch"
# Correct only directory ownership for the service accounts; never recurse through or rewrite saved volume contents.
chown 1000:1000 "$DATA_ROOT/app" "$DATA_ROOT/app/torrent-cache"
chown "$(read_env PUID):$(read_env PGID)" "$DATA_ROOT/transmission-config" "$DATA_ROOT/isos" "$DATA_ROOT/watch"
chmod 750 "$DATA_ROOT/app" "$DATA_ROOT/app/torrent-cache" "$DATA_ROOT/transmission-config" "$DATA_ROOT/isos" "$DATA_ROOT/watch"
chmod 600 "$ENV_FILE"

cd "$ROOT_DIR"
echo "Building services and starting the site…"
docker compose --env-file "$ENV_FILE" config -q
docker compose --env-file "$ENV_FILE" up -d --build

echo "Waiting for service health checks…"
ready=0
for _ in $(seq 1 150); do
  web_id="$(docker compose --env-file "$ENV_FILE" ps -q web)"
  admin_id="$(docker compose --env-file "$ENV_FILE" ps -q admin)"
  worker_id="$(docker compose --env-file "$ENV_FILE" ps -q worker)"
  transmission_id="$(docker compose --env-file "$ENV_FILE" ps -q transmission)"
  web_health="$(docker inspect --format '{{.State.Health.Status}}' "$web_id" 2>/dev/null || true)"
  admin_health="$(docker inspect --format '{{.State.Health.Status}}' "$admin_id" 2>/dev/null || true)"
  worker_health="$(docker inspect --format '{{.State.Health.Status}}' "$worker_id" 2>/dev/null || true)"
  transmission_health="$(docker inspect --format '{{.State.Health.Status}}' "$transmission_id" 2>/dev/null || true)"
  if [[ "$web_health" == "healthy" && "$admin_health" == "healthy" && "$worker_health" == "healthy" && "$transmission_health" == "healthy" ]] && curl -fsS --max-time 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if (( ready == 0 )); then
  docker compose ps
  echo "The containers started but did not all become healthy. Check logs with: sudo docker compose logs --tail=100" >&2
  exit 1
fi

printf '\nSite API health: '
curl -fsS http://127.0.0.1:8080/api/health
printf '\n\n'
echo "Deployment is running. Configure your existing HTTPS reverse proxy to forward the domain to http://127.0.0.1:8080."
echo "The private administration API listens on 127.0.0.1:3001 and is not routed through the public site."
if [[ -n "$PROXY_NETWORK" ]]; then
  echo "The public app is available to containers on reverse-proxy network '$PROXY_NETWORK' as http://mgoth-web:3000."
else
  echo "The public app is available to a host reverse proxy at http://127.0.0.1:8080."
fi
echo "If the selected Spotify credentials are configured, start the protected OAuth flow using the instructions in README.md."
echo "Persistent data: $DATA_ROOT"
