#!/usr/bin/env bash
# Use a separate Compose project and database to verify the real restore script.
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture="$(mktemp -d /tmp/listva-restore-test.XXXXXX)"
project="listva-restore-test-$$"
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    docker compose --project-name "$project" logs --no-color --tail 20 || true
  fi
  docker compose --project-name "$project" down --volumes --remove-orphans || status=1
  if [[ "$fixture" == /tmp/listva-restore-test.* ]]; then rm -rf -- "$fixture"; fi
  exit "$status"
}
trap cleanup EXIT
mkdir -p "$fixture/scripts"
cp "$root"/scripts/*.sh "$fixture/scripts/"
cp "$root/compose.yaml" "$fixture/"
cp "$root/.env.example" "$fixture/.env"
cd "$fixture"
unset COMPOSE_FILE COMPOSE_ENV_FILES
export COMPOSE_PROJECT_NAME="$project"
export DB_PASSWORD=restore-integration-password GRAFANA_PASSWORD=restore-integration-password
export POSTGRES_USER=listva POSTGRES_DB=listva
docker compose up -d --no-build --pull never --wait --wait-timeout 120 api
docker compose exec -T db psql -U listva -d listva -v ON_ERROR_STOP=1 -c "CREATE TABLE ops_restore_marker (value text); INSERT INTO ops_restore_marker VALUES ('before');" >/dev/null
archive="$(bash scripts/backup.sh)"
docker compose exec -T db psql -U listva -d listva -v ON_ERROR_STOP=1 -c "UPDATE ops_restore_marker SET value = 'after';" >/dev/null
bash scripts/restore.sh "$archive" --confirm-replace-database
[[ "$(docker compose exec -T db psql -U listva -d listva -Atc 'SELECT value FROM ops_restore_marker')" == before ]]
docker compose exec -T api node -e '
(async()=>{
  for(let i=0;i<30;i++){
    try { if((await fetch("http://127.0.0.1:3000/api/health/ready",{signal:AbortSignal.timeout(3000)})).ok) return; } catch {}
    await new Promise(r=>setTimeout(r,1000));
  }
  throw Error("Restored API did not become ready");
})().catch(e=>{console.error(e);process.exit(1)});'
echo 'PASS: real backup and database replacement, API recovered'

# Preserve the archive TOC but truncate its data, so validation succeeds and the
# restore itself fails after entering the transaction.
node -e 'const fs=require("node:fs"),b=fs.readFileSync(process.argv[1]);fs.writeFileSync("broken.dump",b.subarray(0,b.length-64));' "$archive"
docker compose exec -T db pg_restore --list < broken.dump >/dev/null
docker compose exec -T db psql -U listva -d listva -v ON_ERROR_STOP=1 -c "UPDATE ops_restore_marker SET value = 'retained-after-failure';" >/dev/null
if bash scripts/restore.sh broken.dump --confirm-replace-database > restore-failure.log 2>&1; then
  echo 'A truncated archive unexpectedly restored successfully' >&2
  exit 1
fi
grep -qF 'Restore failed; API remains stopped' restore-failure.log
[[ "$(docker compose exec -T db psql -U listva -d listva -Atc 'SELECT value FROM ops_restore_marker')" == retained-after-failure ]]
[[ -z "$(docker compose ps --status running --quiet api)" ]]
echo 'PASS: failed real restore rolls back all changes and keeps API stopped'
