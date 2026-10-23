#!/usr/bin/env bash
# GitHub runner entry point: provision, upload and deploy without a server checkout.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
: "${SSH_KEY:?Set SSH_PRIVATE_KEY in the production environment}"
: "${SSH_KNOWN_HOSTS:?Set SSH_KNOWN_HOSTS in the production environment}"
: "${DEPLOY_HOST:?Set DEPLOY_HOST in the production environment}"
: "${DEPLOY_USER:?Set DEPLOY_USER in the production environment}"
: "${API_IMAGE:?Set API_IMAGE}"
: "${WEB_IMAGE:?Set WEB_IMAGE}"
: "${GHCR_USER:?Set GHCR_USER}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN}"
: "${GRAFANA_PASSWORD:?Set GRAFANA_PASSWORD in the production environment secrets}"
bash scripts/grafana-password.sh validate
deploy_path="${DEPLOY_PATH:-/opt/listva}"
public_host="${DEPLOY_PUBLIC_HOST:-$DEPLOY_HOST}"
http_port="${DEPLOY_HTTP_PORT:-80}"
[[ "$deploy_path" =~ ^(/[a-zA-Z0-9_.-]+){2,}/?$ && "/${deploy_path#/}/" != *'/../'* && "/${deploy_path#/}/" != *'/./'* ]] || { echo 'Invalid DEPLOY_PATH' >&2; exit 2; }
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$DEPLOY_USER" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]] || { echo 'Invalid SSH host or user' >&2; exit 2; }
if [[ ! "$public_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ || ! "$http_port" =~ ^[1-9][0-9]{0,4}$ ]] || (( http_port > 65535 )); then
  echo 'Invalid public host or HTTP port' >&2
  exit 2
fi
for image in "$API_IMAGE" "$WEB_IMAGE"; do
  [[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] || { echo 'Expected an immutable GHCR image digest' >&2; exit 2; }
done
temporary_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/listva-ssh.XXXXXX")"
cleanup() {
  if [[ "$temporary_dir" == */listva-ssh.* ]]; then rm -rf -- "$temporary_dir"; fi
}
trap cleanup EXIT
printf '%s\n' "$SSH_KEY" | tr -d '\r' > "$temporary_dir/id_ed25519"
printf '%s\n' "$SSH_KNOWN_HOSTS" | tr -d '\r' > "$temporary_dir/known_hosts"
chmod 600 "$temporary_dir/id_ed25519" "$temporary_dir/known_hosts"
ssh_options=(-i "$temporary_dir/id_ed25519" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$temporary_dir/known_hosts" -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
target="$DEPLOY_USER@$DEPLOY_HOST"
echo 'Preparing VPS dependencies and deployment directory.'
# Values are validated above and intentionally expanded on the runner.
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" "$target" "bash -s -- '$deploy_path' '$http_port'" < scripts/prepare-host.sh
echo 'Uploading deployment files.'
tar -czf "$temporary_dir/deploy.tar.gz" compose.yaml compose.prod.yaml infra/monitoring scripts
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" "$target" "tar --no-same-owner -xzf - -C '$deploy_path'" < "$temporary_dir/deploy.tar.gz"
echo 'Deploying verified images.'
{
  printf 'set -Eeuo pipefail\numask 077\n'
  printf 'cd %q\n' "$deploy_path"
  printf 'export API_IMAGE=%q WEB_IMAGE=%q DEPLOY_HOST=%q DEPLOY_PUBLIC_HOST=%q DEPLOY_HTTP_PORT=%q\n' "$API_IMAGE" "$WEB_IMAGE" "$DEPLOY_HOST" "$public_host" "$http_port"
  printf 'GHCR_USER=%q\nGHCR_TOKEN=%q\n' "$GHCR_USER" "$GHCR_TOKEN"
  printf 'export GRAFANA_PASSWORD=%q\n' "$GRAFANA_PASSWORD"
  cat <<'REMOTE'
docker_config="$(mktemp -d /tmp/listva-registry.XXXXXX)"
cleanup_registry() {
  if [[ "$docker_config" == /tmp/listva-registry.* ]]; then rm -rf -- "$docker_config"; fi
}
trap cleanup_registry EXIT
export DOCKER_CONFIG="$docker_config"
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin >/dev/null
unset GHCR_TOKEN
bash scripts/deploy.sh </dev/null
REMOTE
} | ssh "${ssh_options[@]}" "$target" 'bash -s'
