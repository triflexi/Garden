#!/usr/bin/env bash
# Persist the deployment secret and update an already initialized Grafana database.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
: "${GRAFANA_PASSWORD:?Set GRAFANA_PASSWORD in the production environment secrets}"
if [[ ${#GRAFANA_PASSWORD} -lt 8 || "$GRAFANA_PASSWORD" == *$'\n'* || "$GRAFANA_PASSWORD" == *$'\r'* ]]; then
  echo 'GRAFANA_PASSWORD must contain at least 8 characters and no line breaks.' >&2
  exit 2
fi
case "${1:-}" in
  validate) exit 0 ;;
  configure)
    [[ -f .env && -r .env ]] || { echo 'A readable application .env is required.' >&2; exit 1; }
    temporary_env="$(mktemp .env.grafana.XXXXXX)"
    trap 'rm -f -- "$temporary_env"' EXIT
    # Double-quoted dotenv values need literal backslashes, quotes and dollar signs escaped.
    escaped="${GRAFANA_PASSWORD//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    escaped="${escaped//\$/\$\$}"
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ ! "$line" =~ ^[[:space:]]*(export[[:space:]]+)?GRAFANA_PASSWORD[[:space:]]*[:=] ]]; then
        printf '%s\n' "$line"
      fi
    done < .env > "$temporary_env"
    printf 'GRAFANA_PASSWORD="%s"\n' "$escaped" >> "$temporary_env"
    chmod 600 "$temporary_env"
    mv -- "$temporary_env" .env ;;
  apply)
    for ((attempt=0; attempt<30; attempt++)); do
      if curl --fail --silent --max-time 5 http://127.0.0.1:3001/api/health >/dev/null; then
        printf '%s\n' "$GRAFANA_PASSWORD" | docker compose -f compose.yaml -f compose.prod.yaml exec -T grafana \
          grafana cli --homepath /usr/share/grafana --config /etc/grafana/grafana.ini \
          admin reset-admin-password --password-from-stdin >/dev/null
        echo 'Grafana admin password synchronized with the deployment secret.'
        exit 0
      fi
      sleep 2
    done
    echo 'Grafana did not become ready for admin password synchronization.' >&2
    exit 1 ;;
  *) echo 'Usage: bash scripts/grafana-password.sh validate|configure|apply' >&2; exit 2 ;;
esac
