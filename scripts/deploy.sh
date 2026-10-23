#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
exec 9>.deploy.lock
flock -n 9 || { echo 'A deployment is already running' >&2; exit 1; }
: "${API_IMAGE:?Set API_IMAGE to an immutable image tag}"
: "${WEB_IMAGE:?Set WEB_IMAGE to an immutable image tag}"
[[ -f .env ]] || { echo 'Run bootstrap.sh first' >&2; exit 1; }
compose=(docker compose -f compose.yaml -f compose.prod.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" pull
if [[ -f .deploy-images.env ]]; then
  cp -- .deploy-images.env .previous-images.env
  bash scripts/backup.sh
fi
"${compose[@]}" up -d --wait db
"${compose[@]}" run --rm --no-deps migrate
started=true
if ! "${compose[@]}" up -d --no-build --remove-orphans; then
  started=false
fi
port="$(sed -n 's/^HTTP_PORT=//p' .env | tr -d '\r')"
port="${port:-80}"
for attempt in $(seq 1 30); do
  [[ "$started" == true ]] || break
  if curl --fail --silent --max-time 5 "http://127.0.0.1:$port/api/health/ready" >/dev/null && curl --fail --silent --max-time 5 "http://127.0.0.1:$port/web-health" >/dev/null; then
    printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$API_IMAGE" "$WEB_IMAGE" > .deploy-images.env.tmp
    mv -- .deploy-images.env.tmp .deploy-images.env
    echo 'Deployment healthy.'
    exit 0
  fi
  sleep 2
done
echo 'Health check failed. Rolling back application images.' >&2
if [[ -f .previous-images.env ]]; then
  set -a
  source .previous-images.env
  set +a
  "${compose[@]}" up -d --no-deps --no-build api web
  cp -- .previous-images.env .deploy-images.env
fi
exit 1
