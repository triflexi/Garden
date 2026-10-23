#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in valid hostname custom-port existing invalid-octet too-many-octets trailing-dot leading-zero invalid-host invalid-port missing-argument random-fails; do
  new_fixture
  if [[ "$scenario" != existing ]]; then rm -- "$fixture/.env"; fi
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
[[ "$*" == 'compose version' ]]
MOCK
  if [[ "$scenario" == random-fails ]]; then printf '#!/usr/bin/env bash\nexit 1\n' > "$fixture/bin/openssl"; fi
  chmod +x "$fixture/bin/"*
  unset HTTP_PORT
  if [[ "$scenario" == custom-port ]]; then export HTTP_PORT=8088; fi
  if [[ "$scenario" == invalid-port ]]; then export HTTP_PORT=65536; fi
  case "$scenario" in
    hostname) run_script bootstrap.sh garden.example.com ;;
    invalid-octet) run_script bootstrap.sh 999.1.2.3 ;;
    too-many-octets) run_script bootstrap.sh 1.2.3.4.5 ;;
    trailing-dot) run_script bootstrap.sh 1.2.3.4. ;;
    leading-zero) run_script bootstrap.sh 01.2.3.4 ;;
    invalid-host) run_script bootstrap.sh bad..example.com ;;
    missing-argument) run_script bootstrap.sh ;;
    *) run_script bootstrap.sh 203.0.113.10 ;;
  esac
  case "$scenario" in
    valid|hostname|custom-port)
      assert_success
      case "$scenario" in
        valid) grep -qFx 'PUBLIC_ORIGIN=http://203.0.113.10' "$fixture/.env" ;;
        hostname) grep -qFx 'PUBLIC_ORIGIN=http://garden.example.com' "$fixture/.env" ;;
        custom-port) grep -qFx 'PUBLIC_ORIGIN=http://203.0.113.10:8088' "$fixture/.env" ;;
      esac
      grep -qE '^DB_PASSWORD=[0-9a-f]{64}$' "$fixture/.env"
      grep -qE '^GRAFANA_PASSWORD=[0-9a-f]{48}$' "$fixture/.env"
      [[ "$(stat -c %a "$fixture/.env")" == 600 ]] ;;
    existing)
      assert_success
      [[ "$(cat "$fixture/.env")" == HTTP_PORT=80 ]] ;;
    *) assert_failure; [[ ! -e "$fixture/.env" ]] ;;
  esac
  printf 'PASS: bootstrap %s\n' "$scenario"
done
unset HTTP_PORT
