#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in healthy first-deploy automatic-bootstrap bootstrap-fails pull-fails backup-fails empty-backup database-fails migration-fails start-fails health-fails rollback-start-fails rollback-health-fails env-port default-port locked; do
  new_fixture
  if [[ "$scenario" != first-deploy && "$scenario" != automatic-bootstrap && "$scenario" != bootstrap-fails ]]; then
    printf 'API_IMAGE=ghcr.io/example/api:old\nWEB_IMAGE=ghcr.io/example/web:old\n' > "$fixture/.deploy-images.env"
    cp "$fixture/.deploy-images.env" "$fixture/known-old.env"
  fi
  if [[ "$scenario" == automatic-bootstrap || "$scenario" == bootstrap-fails ]]; then rm -- "$fixture/.env"; fi
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s|%s|%s\n' "$*" "${API_IMAGE:-}" "${WEB_IMAGE:-}" >> "$CALL_LOG"
[[ "$1" == compose ]] || exit 90
shift
while [[ "${1:-}" == -f ]]; do shift 2; done
case "$*" in
  'version') printf 'Docker Compose version v2.24.4\n' ;;
  'config --quiet') ;;
  'port web 80')
    if [[ "$SCENARIO" == default-port ]]; then printf '0.0.0.0:8080\n'; else printf '0.0.0.0:%s\n' "${HTTP_PORT:-80}"; fi ;;
  pull)
    [[ "$DEPLOY_PULL_POLICY" == always ]] || exit 91
    [[ "$SCENARIO" != pull-fails ]] || exit 7 ;;
  'exec -T db sh -c pg_dump '*)
    [[ "$SCENARIO" != empty-backup ]] || exit 0
    printf 'test-backup-data'
    [[ "$SCENARIO" != backup-fails ]] || exit 6 ;;
  'up -d --wait --wait-timeout 120 --pull never db') [[ "$SCENARIO" != database-fails ]] || exit 5 ;;
  'run --rm --no-deps migrate')
    [[ "$DEPLOY_PULL_POLICY" == never ]] || exit 91
    [[ "$SCENARIO" != migration-fails ]] || exit 8 ;;
  'up -d --no-build --pull never --remove-orphans') [[ "$SCENARIO" != start-fails ]] || exit 9 ;;
  'up -d --no-deps --no-build --pull never api web') [[ "$SCENARIO" != rollback-start-fails ]] || exit 10 ;;
  *) echo "Unexpected Docker command: $*" >&2; exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf 'curl %s|%s\n' "$*" "$API_IMAGE" >> "$CALL_LOG"
if [[ "$API_IMAGE" == *:new ]]; then
  case "$SCENARIO" in health-fails|rollback-start-fails|rollback-health-fails) exit 22 ;; esac
fi
[[ "$SCENARIO" != rollback-health-fails ]]
MOCK
  if [[ "$scenario" == locked ]]; then printf '#!/usr/bin/env bash\nexit 1\n' > "$fixture/bin/flock"; fi
  chmod +x "$fixture/bin/"*
  export SCENARIO="$scenario" API_IMAGE=ghcr.io/example/api:new WEB_IMAGE=ghcr.io/example/web:new
  export DEPLOY_HOST=203.0.113.10
  if [[ "$scenario" == bootstrap-fails ]]; then export DEPLOY_HOST=999.1.2.3; fi
  if [[ "$scenario" == env-port ]]; then export HTTP_PORT=18080; else unset HTTP_PORT; fi
  run_script deploy.sh
  case "$scenario" in
    healthy|first-deploy|automatic-bootstrap|env-port|default-port)
      assert_success
      grep -qF 'API_IMAGE=ghcr.io/example/api:new' "$fixture/.deploy-images.env"
      assert_called 'up -d --no-build --pull never --remove-orphans'
      if [[ "$scenario" == env-port ]]; then assert_called 'http://127.0.0.1:18080/api/health/ready'; fi
      if [[ "$scenario" == default-port ]]; then assert_called 'http://127.0.0.1:8080/api/health/ready'; fi
      if [[ "$scenario" == first-deploy || "$scenario" == automatic-bootstrap ]]; then assert_not_called pg_dump; fi
      if [[ "$scenario" == automatic-bootstrap ]]; then grep -qFx 'PUBLIC_ORIGIN=http://203.0.113.10' "$fixture/.env"; fi ;;
    *)
      assert_failure
      if [[ "$scenario" == bootstrap-fails ]]; then
        [[ ! -e "$fixture/.env" ]]
        assert_not_called pull
      else
        cmp "$fixture/known-old.env" "$fixture/.deploy-images.env"
      fi
      case "$scenario" in
        start-fails|health-fails|rollback-start-fails|rollback-health-fails)
          assert_called 'up -d --no-deps --no-build --pull never api web|ghcr.io/example/api:old|ghcr.io/example/web:old'
          case "$scenario" in
            start-fails|health-fails) grep -qF 'restored and healthy' "$fixture/output.log" ;;
            *) grep -qF 'Rollback failed' "$fixture/output.log" ;;
          esac ;;
        *) assert_not_called 'up -d --no-build --pull never --remove-orphans' ;;
      esac ;;
  esac
  case "$scenario" in
    healthy|database-fails|migration-fails|start-fails|health-fails)
      backup_line="$(grep -n pg_dump "$CALL_LOG" | cut -d: -f1)"
      database_line="$(grep -n 'up -d --wait' "$CALL_LOG" | cut -d: -f1)"
      [[ "$backup_line" -lt "$database_line" ]] ;;
  esac
  [[ ! -e "$fixture/.deploy-images.env.tmp" ]]
  if [[ -d "$fixture/backups" ]]; then [[ -z "$(find "$fixture/backups" -name '*.tmp' -print)" ]]; fi
  printf 'PASS: deployment %s\n' "$scenario"
done
