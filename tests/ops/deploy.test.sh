#!/usr/bin/env bash
# Exercise the real deployment script in an isolated directory with fake external commands.
# These checks cover ordering and rollback; container/database verification is in smoke.sh.
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture=''
cleanup() {
  if [[ "${fixture:-}" == /tmp/listva-deploy-test.* ]]; then rm -rf -- "$fixture"; fi
}
trap cleanup EXIT

for scenario in healthy migration-fails start-fails health-fails; do
  fixture="$(mktemp -d /tmp/listva-deploy-test.XXXXXX)"
  mkdir -p "$fixture/scripts" "$fixture/bin"
  cp "$root/scripts/deploy.sh" "$root/scripts/backup.sh" "$fixture/scripts/"
  printf 'HTTP_PORT=80\n' > "$fixture/.env"
  printf 'API_IMAGE=ghcr.io/example/api:old\nWEB_IMAGE=ghcr.io/example/web:old\n' > "$fixture/.deploy-images.env"
  cp "$fixture/.deploy-images.env" "$fixture/known-old.env"
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s|%s|%s\n' "$*" "${API_IMAGE:-}" "${WEB_IMAGE:-}" >> "$CALL_LOG"
case "$*" in
  *'exec -T db sh -c pg_dump'*) printf 'test-backup-data'; exit 0 ;;
  *'run --rm --no-deps migrate'*) [[ "$SCENARIO" != migration-fails ]] || exit 8 ;;
  *'up -d --no-build --remove-orphans'*) [[ "$SCENARIO" != start-fails ]] || exit 9 ;;
esac
exit 0
MOCK
  cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
[[ "$SCENARIO" != health-fails ]]
MOCK
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/bin/sleep"
  chmod +x "$fixture/bin/"*
  code=0
  API_IMAGE=ghcr.io/example/api:new WEB_IMAGE=ghcr.io/example/web:new \
    SCENARIO="$scenario" CALL_LOG="$fixture/calls.log" PATH="$fixture/bin:$PATH" \
    bash "$fixture/scripts/deploy.sh" > "$fixture/output.log" 2>&1 || code=$?

  backup_line="$(grep -n 'pg_dump' "$fixture/calls.log" | cut -d: -f1)"
  database_line="$(grep -n 'up -d --wait db' "$fixture/calls.log" | cut -d: -f1)"
  [[ -n "$backup_line" && -n "$database_line" && "$backup_line" -lt "$database_line" ]]
  if [[ "$scenario" == healthy ]]; then
    [[ "$code" == 0 ]]
    grep -qF 'API_IMAGE=ghcr.io/example/api:new' "$fixture/.deploy-images.env"
    cmp "$fixture/known-old.env" "$fixture/.previous-images.env"
  else
    [[ "$code" != 0 ]]
    cmp "$fixture/known-old.env" "$fixture/.deploy-images.env"
    if [[ "$scenario" == migration-fails ]]; then
      ! grep -qF 'up -d --no-build --remove-orphans' "$fixture/calls.log"
    else
      grep -qF 'up -d --no-deps --no-build api web|ghcr.io/example/api:old|ghcr.io/example/web:old' "$fixture/calls.log"
    fi
  fi
  [[ ! -e "$fixture/.deploy-images.env.tmp" ]]
  printf 'PASS: deployment %s\n' "$scenario"
  cleanup
  fixture=''
done
