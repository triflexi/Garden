#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
if [[ $# -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Usage: bash scripts/bootstrap.sh YOUR_PUBLIC_IPV4' >&2
  exit 2
fi
command -v docker >/dev/null
docker compose version
if [[ -e .env ]]; then
  echo '.env already exists; no settings were changed.'
  exit 0
fi
db_password="$(openssl rand -hex 32)"
grafana_password="$(openssl rand -hex 24)"
cat > .env <<EOF
PUBLIC_ORIGIN=http://$1
HTTP_PORT=80
POSTGRES_USER=listva
POSTGRES_DB=listva
DB_PASSWORD=$db_password
GRAFANA_PASSWORD=$grafana_password
COOKIE_SECURE=false
TRUST_PROXY=true
DB_PORT=15432
DATABASE_URL=postgresql://listva:$db_password@localhost:15432/listva?schema=public
EOF
echo 'Created .env with generated passwords. Configure GHCR access before deployment.'
