#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in fresh repeat rotate-password custom-port prepare-fails upload-fails login-fails deploy-fails missing-token missing-grafana-password invalid-path mutable-image; do
  new_fixture
  cp "$root/compose.yaml" "$root/compose.prod.yaml" "$fixture/"
  mkdir -p "$fixture/infra" "$fixture/runner-temp"
  cp -R "$root/infra/monitoring" "$fixture/infra/"
  cat > "$fixture/bin/ssh" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'ssh %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == *'StrictHostKeyChecking=yes'* && "$*" == *'IdentitiesOnly=yes'* ]] || exit 90
while [[ "$1" == -i || "$1" == -o ]]; do shift 2; done
[[ "$1" == 'deploy@203.0.113.10' ]] || exit 91
command="$2"
case "$command" in
  'bash -s -- '*)
    cat > "$FIXTURE/prepare-input.sh"
    [[ "$SCENARIO" != prepare-fails ]] || exit 3
    mkdir -p "$REMOTE_APP_PATH" ;;
  'tar --no-same-owner -xzf - -C '*)
    [[ -d "$REMOTE_APP_PATH" && -s "$FIXTURE/prepare-input.sh" ]] || exit 92
    [[ "$SCENARIO" != upload-fails ]] || exit 4
    tar -xzf - -C "$REMOTE_APP_PATH" ;;
  'bash -s')
    [[ -f "$REMOTE_APP_PATH/scripts/deploy.sh" ]] || exit 93
    env -i PATH="$PATH" HOME="$HOME" FIXTURE="$FIXTURE" CALL_LOG="$CALL_LOG" SCENARIO="$SCENARIO" EXPECTED_TOKEN=test-registry-token bash -s ;;
  *) echo "Unexpected SSH command: $command" >&2; exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'docker %s\n' "$*" >> "$CALL_LOG"
if [[ "$1" == login ]]; then
  [[ "$*" == 'login ghcr.io --username workflow-user --password-stdin' ]] || exit 90
  [[ "$(cat)" == "$EXPECTED_TOKEN" ]] || exit 91
  printf 'registry-config=%s\n' "$DOCKER_CONFIG" >> "$CALL_LOG"
  [[ "$SCENARIO" != login-fails ]] || exit 5
  printf 'test-auth' > "$DOCKER_CONFIG/config.json"
  exit 0
fi
[[ "$1" == compose ]] || exit 90
shift
while [[ "${1:-}" == -f ]]; do shift 2; done
case "$*" in
  version) printf 'Docker Compose version v2.24.4\n' ;;
  'config --quiet') [[ -s .env ]] ;;
  pull) [[ -s "$DOCKER_CONFIG/config.json" && ! -v GHCR_TOKEN ]] ;;
  'up -d --wait --wait-timeout 120 --pull never db'|'run --rm --no-deps migrate') ;;
  'up -d --no-build --pull never --remove-orphans') [[ "$SCENARIO" != deploy-fails ]] || exit 6 ;;
  'port web 80') printf '0.0.0.0:%s\n' "$(sed -n 's/^HTTP_PORT=//p' .env)" ;;
  'exec -T db sh -c pg_dump '*) printf 'backup-data' ;;
  'exec -T grafana grafana cli --homepath /usr/share/grafana --config /etc/grafana/grafana.ini admin reset-admin-password --password-from-stdin')
    [[ "$(cat)" == "$GRAFANA_PASSWORD" ]] || exit 94
    printf 'password-synchronized\n' >> "$CALL_LOG" ;;
  *) echo "Unexpected Docker command: $*" >&2; exit 90 ;;
esac
MOCK
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/bin/curl"
  chmod +x "$fixture/bin/"*
  export SCENARIO="$scenario" REMOTE_APP_PATH="$fixture/remote/app" RUNNER_TEMP="$fixture/runner-temp"
  export SSH_KEY=test-private-key SSH_KNOWN_HOSTS='203.0.113.10 ssh-ed25519 test-public-host-key'
  export DEPLOY_HOST=203.0.113.10 DEPLOY_USER=deploy DEPLOY_PATH="$REMOTE_APP_PATH"
  export DEPLOY_PUBLIC_HOST=203.0.113.10 DEPLOY_HTTP_PORT=80
  export GHCR_USER=workflow-user GHCR_TOKEN=test-registry-token
  export GRAFANA_PASSWORD=test-grafana-secret
  digest="$(printf 'a%.0s' {1..64})"
  export API_IMAGE="ghcr.io/example/api@sha256:$digest" WEB_IMAGE="ghcr.io/example/web@sha256:$digest"
  case "$scenario" in
    custom-port) export DEPLOY_PUBLIC_HOST=garden.example.com DEPLOY_HTTP_PORT=8088 ;;
    missing-token) unset GHCR_TOKEN ;;
    missing-grafana-password) unset GRAFANA_PASSWORD ;;
    invalid-path) export DEPLOY_PATH=/ ;;
    mutable-image) export API_IMAGE=ghcr.io/example/api:latest ;;
  esac
  run_script deploy-ssh.sh
  case "$scenario" in
    fresh|repeat|rotate-password|custom-port)
      assert_success
      [[ -s "$REMOTE_APP_PATH/.env" && -s "$REMOTE_APP_PATH/.deploy-images.env" ]]
      [[ "$(stat -c %a "$REMOTE_APP_PATH/.env")" == 600 ]]
      grep -qFx 'GRAFANA_PASSWORD="test-grafana-secret"' "$REMOTE_APP_PATH/.env"
      assert_called password-synchronized
      if [[ "$scenario" == custom-port ]]; then
        grep -qFx 'PUBLIC_ORIGIN=http://garden.example.com:8088' "$REMOTE_APP_PATH/.env"
      else
        grep -qFx 'PUBLIC_ORIGIN=http://203.0.113.10' "$REMOTE_APP_PATH/.env"
      fi
      if [[ "$scenario" == repeat ]]; then
        cp "$REMOTE_APP_PATH/.env" "$fixture/initial.env"
        run_script deploy-ssh.sh
        assert_success
        cmp "$fixture/initial.env" "$REMOTE_APP_PATH/.env"
        assert_called pg_dump
      fi
      if [[ "$scenario" == rotate-password ]]; then
        initial_db_password="$(sed -n 's/^DB_PASSWORD=//p' "$REMOTE_APP_PATH/.env")"
        export GRAFANA_PASSWORD=rotated-grafana-secret
        run_script deploy-ssh.sh
        assert_success
        grep -qFx 'GRAFANA_PASSWORD="rotated-grafana-secret"' "$REMOTE_APP_PATH/.env"
        [[ "$(sed -n 's/^DB_PASSWORD=//p' "$REMOTE_APP_PATH/.env")" == "$initial_db_password" ]]
      fi ;;
    *) assert_failure ;;
  esac
  case "$scenario" in
    prepare-fails) assert_not_called 'tar --no-same-owner -xzf' ;;
    upload-fails) assert_not_called 'docker login' ;;
    login-fails) assert_not_called 'docker compose' ;;
    missing-token|missing-grafana-password|invalid-path|mutable-image) [[ ! -s "$CALL_LOG" ]] ;;
  esac
  if grep -qF test-registry-token "$fixture/output.log"; then echo 'Registry token leaked into logs' >&2; exit 1; fi
  if [[ -n "${GRAFANA_PASSWORD:-}" ]] && grep -qF "$GRAFANA_PASSWORD" "$fixture/output.log"; then echo 'Grafana password leaked into logs' >&2; exit 1; fi
  while IFS= read -r config_path; do [[ ! -e "$config_path" ]]; done < <(sed -n 's/^registry-config=//p' "$CALL_LOG")
  [[ -z "$(find "$RUNNER_TEMP" -mindepth 1 -print)" ]]
  printf 'PASS: SSH first deployment %s\n' "$scenario"
done
