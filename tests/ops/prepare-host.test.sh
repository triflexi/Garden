#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in installed fresh-root fresh-sudo compose-upgrade daemon-stopped docker-group directory-sudo firewall no-sudo install-fails invalid-path; do
  new_fixture
  cat > "$fixture/bin/id" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  -u) case "$SCENARIO" in fresh-root|daemon-stopped|firewall) echo 0 ;; *) echo 1000 ;; esac ;;
  -g) echo 1000 ;;
  -un) echo deploy ;;
  *) exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'sudo %s\n' "$*" >> "$CALL_LOG"
[[ "$SCENARIO" != no-sudo ]] || exit 1
while [[ "${1:-}" == -n || "${1:-}" == -- ]]; do shift; done
FAKE_PRIVILEGED=1 "$@"
MOCK
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'docker %s\n' "$*" >> "$CALL_LOG"
case "$*" in
  --version)
    case "$SCENARIO" in fresh-*|no-sudo|install-fails) [[ -f "$FIXTURE/docker-installed" ]] || exit 127 ;; esac ;;
  'compose version --short')
    if [[ ! -f "$FIXTURE/docker-installed" ]]; then
      case "$SCENARIO" in fresh-*|no-sudo|install-fails) exit 1 ;; compose-upgrade) echo 2.20.3; exit 0 ;; esac
    fi
    echo 2.24.4 ;;
  info)
    if [[ "$SCENARIO" == daemon-stopped && ! -f "$FIXTURE/service-started" ]]; then exit 1; fi
    if [[ "$SCENARIO" == docker-group && "${FAKE_PRIVILEGED:-}" != 1 ]]; then exit 1; fi ;;
  *) exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/apt-get" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'apt-get %s\n' "$*" >> "$CALL_LOG"
[[ "$SCENARIO" != install-fails ]] || exit 6
if [[ "$*" == *'install '* && "$*" == *'docker-compose-plugin'* ]]; then touch "$FIXTURE/docker-installed"; fi
MOCK
  cat > "$fixture/bin/install" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'install %s\n' "$*" >> "$CALL_LOG"
destination="${!#}"
case "$destination" in
  /etc/apt/keyrings) exit 0 ;;
  "$FIXTURE"/*) /usr/bin/install -d -m 0750 -- "$destination" ;;
  *) echo "Unsafe test destination: $destination" >&2; exit 90 ;;
esac
MOCK
  cat > "$fixture/bin/mkdir" <<'MOCK'
#!/usr/bin/env bash
if [[ "$SCENARIO" == directory-sudo && "$*" == *'/remote/app'* ]]; then exit 1; fi
exec /bin/mkdir "$@"
MOCK
  cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf 'curl %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == *'https://download.docker.com/linux/'*'/gpg -o /etc/apt/keyrings/docker.asc' ]]
MOCK
  cat > "$fixture/bin/tee" <<'MOCK'
#!/usr/bin/env bash
printf 'tee %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == /etc/apt/sources.list.d/docker.sources ]] || exit 90
cat > "$FIXTURE/docker.sources"
MOCK
  cat > "$fixture/bin/chmod" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == 'a+r /etc/apt/keyrings/docker.asc' ]]; then exit 0; fi
exec /bin/chmod "$@"
MOCK
  cat > "$fixture/bin/systemctl" <<'MOCK'
#!/usr/bin/env bash
printf 'systemctl %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == 'enable --now docker' ]] || exit 90
touch "$FIXTURE/service-started"
MOCK
  cat > "$fixture/bin/usermod" <<'MOCK'
#!/usr/bin/env bash
printf 'usermod %s\n' "$*" >> "$CALL_LOG"
[[ "$*" == '-aG docker deploy' ]]
MOCK
  # Always shadow the runner's UFW; its installation/state must not affect fixtures.
  cat > "$fixture/bin/ufw" <<'MOCK'
#!/usr/bin/env bash
printf 'ufw %s\n' "$*" >> "$CALL_LOG"
case "$*" in
  status)
    if [[ "$SCENARIO" == firewall ]]; then echo 'Status: active'; else echo 'Status: inactive'; fi ;;
  'allow 8088/tcp'|'allow 3001/tcp') [[ "$SCENARIO" == firewall ]] ;;
  *) exit 90 ;;
esac
MOCK
  chmod +x "$fixture/bin/"*
  export SCENARIO="$scenario"
  target_path="$fixture/remote/app"
  if [[ "$scenario" == invalid-path ]]; then target_path=/opt/../etc; fi
  run_script prepare-host.sh "$target_path" 8088
  case "$scenario" in
    no-sudo|install-fails|invalid-path)
      assert_failure
      [[ ! -e "$fixture/remote/app" ]] ;;
    *)
      assert_success
      [[ -d "$target_path" ]] ;;
  esac
  case "$scenario" in
    installed)
      assert_not_called apt-get
      assert_not_called usermod
      assert_not_called systemctl
      assert_called 'ufw status'
      assert_not_called 'ufw allow' ;;
    fresh-root|fresh-sudo)
      assert_called 'install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin'
      assert_called 'https://download.docker.com/linux/'
      # A pre-existing Docker apt source on the runner is intentionally reused.
      if [[ -f "$fixture/docker.sources" ]]; then
        grep -qF 'URIs: https://download.docker.com/linux/' "$fixture/docker.sources"
      fi ;;
    compose-upgrade)
      assert_called 'install -y --no-install-recommends docker-compose-plugin'
      assert_not_called 'docker-ce docker-ce-cli' ;;
    daemon-stopped) assert_called 'systemctl enable --now docker' ;;
    docker-group) assert_called 'usermod -aG docker deploy' ;;
    directory-sudo) assert_called 'install -d -m 0750 -o 1000 -g 1000' ;;
    firewall)
      assert_called 'ufw allow 8088/tcp'
      assert_called 'ufw allow 3001/tcp' ;;
    invalid-path) [[ ! -s "$CALL_LOG" ]] ;;
  esac
  printf 'PASS: automatic VPS preparation %s\n' "$scenario"
done
