#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
backup="backups/listva-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f -- "$backup.tmp"' EXIT
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup.tmp"
if [[ ! -s "$backup.tmp" ]]; then
  rm -f -- "$backup.tmp"
  echo 'Backup is empty' >&2
  exit 1
fi
mv -- "$backup.tmp" "$backup"
echo "$backup"
