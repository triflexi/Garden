#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Smoke check failed at line $LINENO" >&2' ERR
cd "$(dirname "$0")/.."
port="${HTTP_PORT:-8080}"
curl --fail --silent "http://127.0.0.1:$port/web-health" >/dev/null
curl --fail --silent "http://127.0.0.1:$port/api/health/ready" >/dev/null

# Node in the API image can query internal services without publishing their ports.
docker compose exec -T api node -e '
(async()=>{
  for(let i=0;i<20;i++){
    const r=await fetch("http://victoriametrics:8428/api/v1/query?query=min(up)").then(r=>r.json());
    const required=[
      "node_memory_MemAvailable_bytes",
      "node_cpu_seconds_total",
      "node_filesystem_avail_bytes{mountpoint=~\"/|/mnt/docker-desktop-disk\",fstype!~\"tmpfs|overlay\"}",
      "container_memory_working_set_bytes{container_label_com_docker_compose_project=\"listva\"}",
      "container_spec_cpu_quota{container_label_com_docker_compose_project=\"listva\"}"
    ];
    const data=await Promise.all(required.map(q=>fetch("http://victoriametrics:8428/api/v1/query?query="+encodeURIComponent(q)).then(r=>r.json())));
    if(r.data?.result?.[0]?.value[1]==="1" && data.every(r=>r.data?.result?.length>0)) return;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error("Some monitoring targets or resource metrics are unavailable");
})().catch(e=>{console.error(e.message);process.exit(1)});'

grafana_password="$(docker compose exec -T grafana printenv GF_SECURITY_ADMIN_PASSWORD)"
docker compose exec -T -e "VERIFY_GRAFANA_PASSWORD=$grafana_password" api node -e '
(async()=>{
  const auth=Buffer.from("admin:"+process.env.VERIFY_GRAFANA_PASSWORD).toString("base64");
  for(let i=0;i<20;i++){
    const r=await fetch("http://grafana:3000/api/dashboards/uid/listva",{headers:{authorization:"Basic "+auth}});
    if(r.ok && (await r.json()).dashboard.panels.length>=15) return;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error("Grafana dashboard is not provisioned");
})().catch(e=>{console.error(e.message);process.exit(1)});'

# Restore into a disposable database, never over the running application database.
backup="$(bash scripts/backup.sh)"
verify_db="listva_restore_verify_$$"
cleanup() {
  docker compose start db >/dev/null || true
  docker compose start api >/dev/null || true
  docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$verify_db" >/dev/null || true
}
trap cleanup EXIT
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$verify_db"
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error' sh "$verify_db" < "$backup"
before="$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc '\''SELECT count(*) FROM "User"'\''')"
after="$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$1" -Atc '\''SELECT count(*) FROM "User"'\''' sh "$verify_db")"
[[ "$before" == "$after" ]]

# A DB outage must affect readiness, while liveness and diagnostic metrics remain available.
docker compose stop db
if ! ready_status="$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health/ready")"; then
  echo "Readiness request failed (HTTP $ready_status)" >&2
  exit 1
fi
[[ "$ready_status" == 503 ]]
curl --fail --silent --max-time 5 "http://127.0.0.1:$port/api/health/live" >/dev/null
docker compose exec -T api node -e '
(async()=>{
  const response=await fetch("http://127.0.0.1:3000/metrics");
  if(!response.ok || !(await response.text()).includes("app_database_up 0")) throw Error("Diagnostics failed during DB outage");
})().catch(e=>{console.error(e.message);process.exit(1)});'
docker compose start --wait db
db_recovered=false
for attempt in $(seq 1 20); do
  if curl --fail --silent --max-time 5 "http://127.0.0.1:$port/api/health/ready" >/dev/null; then db_recovered=true; break; fi
  sleep 2
done
[[ "$db_recovered" == true ]]

# Check that monitoring actually detects a stopped API, then bring it back.
docker compose stop api
detected=false
for attempt in $(seq 1 20); do
  result="$(docker compose exec -T web wget -q -O - 'http://victoriametrics:8428/api/v1/query?query=probe_success%7Binstance%3D%22http%3A%2F%2Fapi%3A3000%2Fapi%2Fhealth%2Fready%22%7D')"
  if printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.exit(JSON.parse(s).data?.result?.[0]?.value[1]==="0"?0:1));'; then detected=true; break; fi
  sleep 2
done
[[ "$detected" == true ]]
docker compose start api
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/api/health/ready" >/dev/null; then echo 'Monitoring, backup, restore and recovery verified.'; exit 0; fi
  sleep 2
done
exit 1
