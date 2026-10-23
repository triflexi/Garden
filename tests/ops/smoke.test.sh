#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in healthy metrics-fails grafana-fails restore-fails count-mismatch drop-fails wrong-readiness db-no-recovery probe-missed api-no-recovery; do
  new_fixture
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$CALL_LOG"
[[ "$1" == compose ]] || exit 90
shift
case "$*" in
  'config --format json')
    printf '{"name":"audit-project","services":{"web":{"ports":[{"target":80,"published":"18080"}]}}}'; exit 0 ;;
  'stop db') touch "$FIXTURE/db-stopped"; exit 0 ;;
  'start db') rm -f "$FIXTURE/db-stopped"; touch "$FIXTURE/db-restarted"; exit 0 ;;
  'stop api') touch "$FIXTURE/api-stopped"; exit 0 ;;
  'start api') rm -f "$FIXTURE/api-stopped"; touch "$FIXTURE/api-restarted"; exit 0 ;;
esac
[[ "$1" == exec && "$2" == -T ]] || { echo "Unexpected command: $*" >&2; exit 90; }
shift 2
if [[ "$1" == -e ]]; then export "$2"; shift 2; fi
service="$1"
shift
case "$service:$*" in
  'api:node -e '*) shift; exec node --require "$FETCH_MOCK" "$@" ;;
  'grafana:printenv GF_SECURITY_ADMIN_PASSWORD') printf 'test-password'; exit 0 ;;
  'db:sh -c pg_dump '*) printf 'backup-data'; exit 0 ;;
  'db:sh -c createdb '*) touch "$FIXTURE/verify-db"; exit 0 ;;
  'db:sh -c pg_restore '*) cat >/dev/null; [[ "$SCENARIO" != restore-fails ]]; exit ;;
  'db:sh -c psql '*)
    if [[ "$SCENARIO" == count-mismatch && "$*" == *'"$1"'* ]]; then printf '2'; else printf '1'; fi
    exit 0 ;;
  'db:sh -c dropdb '*)
    [[ "$SCENARIO" != drop-fails ]] || exit 8
    rm -f "$FIXTURE/verify-db"; exit 0 ;;
  'web:wget -T 5 -q -O - '*)
    # An unavailable endpoint and invalid JSON must be retried, not abort the smoke run.
    if [[ ! -f "$FIXTURE/probe-retried" ]]; then touch "$FIXTURE/probe-retried"; exit 4; fi
    if [[ ! -f "$FIXTURE/probe-json-retried" ]]; then touch "$FIXTURE/probe-json-retried"; printf 'not-json'; exit 0; fi
    value=1
    if [[ -f "$FIXTURE/api-stopped" && "$SCENARIO" != probe-missed ]]; then value=0; fi
    printf '{"status":"success","data":{"result":[{"value":[1,"%s"]}]}}' "$value"
    exit 0 ;;
  *) echo "Unexpected exec: $service $*" >&2; exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'curl %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == *'http://127.0.0.1:18080/'* ]] || exit 90
if [[ "$*" == *'%{http_code}'* ]]; then
  if [[ "$SCENARIO" == wrong-readiness ]]; then printf '200'; else printf '503'; fi
elif [[ "$*" == *'/health/ready'* ]]; then
  if [[ "$SCENARIO" == db-no-recovery && -f "$FIXTURE/db-restarted" ]]; then exit 22; fi
  if [[ "$SCENARIO" == api-no-recovery && -f "$FIXTURE/api-restarted" ]]; then exit 22; fi
fi
MOCK
  chmod +x "$fixture/bin/"*
  export SCENARIO="$scenario" FETCH_MOCK="$root/tests/ops/smoke-fetch.cjs"
  run_script smoke.sh
  if [[ "$scenario" == healthy ]]; then
    assert_success
    grep -qF 'Monitoring, backup, restore and recovery verified.' "$fixture/output.log"
    [[ ! -f "$fixture/db-stopped" && ! -f "$fixture/api-stopped" ]]
    [[ -f "$fixture/probe-json-retried" ]]
  else
    assert_failure
  fi
  if [[ "$scenario" != drop-fails ]]; then [[ ! -f "$fixture/verify-db" ]]; fi
  case "$scenario" in
    wrong-readiness|db-no-recovery) [[ ! -f "$fixture/db-stopped" ]] ;;
    probe-missed|api-no-recovery) [[ ! -f "$fixture/api-stopped" ]] ;;
    metrics-fails|grafana-fails) assert_not_called pg_dump ;;
  esac
  assert_not_called 'start --wait'
  printf 'PASS: smoke %s\n' "$scenario"
done
