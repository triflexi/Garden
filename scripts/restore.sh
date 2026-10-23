#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 2 || "$2" != '--confirm-replace-database' || ! -s "$1" || ! -r "$1" ]]; then
  echo 'Usage: bash scripts/restore.sh backups/FILE.dump --confirm-replace-database' >&2
  exit 2
fi
exec 9>.deploy.lock
flock -n 9 || { echo 'A deployment or restore is already running' >&2; exit 1; }
# Reject invalid archives before taking the application offline.
docker compose exec -T db pg_restore --list < "$1" >/dev/null
# Always retain a backup of the database being replaced, then stop writers.
bash scripts/backup.sh
docker compose stop api
if docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction' < "$1"; then
  docker compose start api
  echo 'Database restored.'
else
  echo 'Restore failed; API remains stopped. The previous database is preserved by the transaction.' >&2
  exit 1
fi
