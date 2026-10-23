#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
if [[ $# -ne 1 || ${#1} -gt 253 || ! "$1" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
  echo 'Usage: bash scripts/bootstrap.sh YOUR_PUBLIC_IP_OR_HOSTNAME' >&2
  exit 2
fi
IFS=. read -r -a labels <<< "$1"
for label in "${labels[@]}"; do
  if [[ "$1" =~ ^[0-9.]+$ ]]; then
    if [[ ${#labels[@]} -ne 4 || ! "$label" =~ ^(0|[1-9][0-9]{0,2})$ ]] || (( 10#$label > 255 )); then
      echo 'Invalid IPv4 address' >&2
      exit 2
    fi
  elif [[ ! "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]]; then
    echo 'Invalid hostname' >&2
    exit 2
  fi
done
http_port="${HTTP_PORT:-80}"
if [[ ! "$http_port" =~ ^[1-9][0-9]{0,4}$ ]] || (( http_port > 65535 )); then
  echo 'Invalid HTTP port' >&2
  exit 2
fi
origin="http://$1"
if [[ "$http_port" != 80 ]]; then origin+=":$http_port"; fi
command -v docker >/dev/null
docker compose version
if [[ -e .env ]]; then
  echo '.env already exists; no settings were changed.'
  exit 0
fi
db_password="$(openssl rand -hex 32)"
grafana_password="$(openssl rand -hex 24)"
# Refuse to overwrite a file created by another bootstrap in the meantime.
set -o noclobber
cat > .env <<EOF
PUBLIC_ORIGIN=$origin
HTTP_PORT=$http_port
POSTGRES_USER=listva
POSTGRES_DB=listva
DB_PASSWORD=$db_password
GRAFANA_PASSWORD=$grafana_password
COOKIE_SECURE=false
TRUST_PROXY=true
DB_PORT=15432
DATABASE_URL=postgresql://listva:$db_password@localhost:15432/listva?schema=public
EOF
echo 'Created .env with generated passwords.'
