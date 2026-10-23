#!/usr/bin/env bash
# Streamed over SSH before any application files exist on the VPS.
set -Eeuo pipefail
deploy_path="${1:-}"
http_port="${2:-80}"
if [[ ! "$deploy_path" =~ ^(/[a-zA-Z0-9_.-]+){2,}/?$ || "/${deploy_path#/}/" == *'/../'* || "/${deploy_path#/}/" == *'/./'* || ! "$http_port" =~ ^[1-9][0-9]{0,4}$ ]] || (( http_port > 65535 )); then
  echo 'Invalid deployment directory or HTTP port' >&2
  exit 2
fi
deploy_uid="$(id -u)"
deploy_gid="$(id -g)"
deploy_user="$(id -un)"
as_root() {
  if [[ "$deploy_uid" == 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null && sudo -n true; then
    sudo -n -- "$@"
  else
    echo 'Automatic VPS setup requires an SSH user with root or passwordless sudo access.' >&2
    return 1
  fi
}
apt_install() {
  as_root env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=120 install -y --no-install-recommends "$@" </dev/null
}
compose_supported() {
  local version
  version="$(docker compose version --short 2>/dev/null)" || return 1
  version="${version#v}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-].*)?$ ]] || return 1
  [[ "$(printf '%s\n' 2.24.4 "$version" | sort -V | head -n 1)" == 2.24.4 ]]
}
need_engine=false
if ! command -v docker >/dev/null || ! docker --version >/dev/null 2>&1; then need_engine=true; fi
missing_tools=false
for tool in curl openssl flock tar; do
  if ! command -v "$tool" >/dev/null; then missing_tools=true; fi
done
if [[ "$need_engine" == true || "$missing_tools" == true ]] || ! compose_supported; then
  # shellcheck source=/dev/null
  source /etc/os-release
  case "$ID" in ubuntu|debian) ;; *) echo 'Automatic package installation supports Ubuntu and Debian.' >&2; exit 1 ;; esac
  as_root apt-get -o DPkg::Lock::Timeout=120 update </dev/null
  apt_install ca-certificates curl openssl util-linux tar
  if [[ "$need_engine" == true ]] || ! compose_supported; then
    as_root install -m 0755 -d /etc/apt/keyrings
    as_root curl --fail --silent --show-error --location --retry 3 --max-time 60 "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
    as_root chmod a+r /etc/apt/keyrings/docker.asc
    # Keep compatibility with Docker installations that already use docker.list.
    if [[ ! -f /etc/apt/sources.list.d/docker.sources && ! -f /etc/apt/sources.list.d/docker.list ]]; then
      as_root tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    fi
    as_root apt-get -o DPkg::Lock::Timeout=120 update </dev/null
    if [[ "$need_engine" == true ]]; then
      apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
      apt_install docker-compose-plugin
    fi
  fi
fi
compose_supported || { echo 'Docker Compose >= 2.24.4 is required.' >&2; exit 1; }
if ! docker info >/dev/null 2>&1; then
  if ! as_root docker info >/dev/null 2>&1; then
    as_root systemctl enable --now docker
    as_root docker info >/dev/null
  fi
  if [[ "$deploy_uid" != 0 ]]; then
    as_root usermod -aG docker "$deploy_user"
    echo 'Docker access granted; the next SSH connection will use the new group.'
  fi
fi
if [[ ! -d "$deploy_path" ]]; then
  if ! mkdir -p -- "$deploy_path" 2>/dev/null; then
    as_root install -d -m 0750 -o "$deploy_uid" -g "$deploy_gid" -- "$deploy_path"
  fi
fi
if [[ ! -w "$deploy_path" || ! -x "$deploy_path" ]]; then
  as_root chown "$deploy_uid:$deploy_gid" -- "$deploy_path"
fi
[[ -d "$deploy_path" && -w "$deploy_path" && -x "$deploy_path" ]]
# Permit the application through an active Ubuntu firewall without changing SSH rules.
if command -v ufw >/dev/null && as_root ufw status | grep -q '^Status: active'; then
  as_root ufw allow "$http_port/tcp"
  as_root ufw allow 3001/tcp
fi
echo 'VPS dependencies and application directory are ready.'
