#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Smoke check failed at line $LINENO" >&2' ERR
cd "$(dirname "$0")/.."
settings="$(docker compose config --format json | node -e '
const fs=require("node:fs"), config=JSON.parse(fs.readFileSync(0,"utf8"));
const port=config.services.web.ports.find(p=>Number(p.target)===80)?.published;
if(!config.name || !port) throw Error("Compose project name or HTTP port is missing");
console.log(config.name,port);')"
read -r project port <<< "$settings"
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$port/web-health" >/dev/null
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$port/api/health/ready" >/dev/null

# Node in the API image can query internal services without publishing their ports.
docker compose exec -T -e "VERIFY_COMPOSE_PROJECT=$project" api node -e '
(async()=>{
  const query=async q=>{
    const r=await fetch("http://victoriametrics:8428/api/v1/query?query="+encodeURIComponent(q),{signal:AbortSignal.timeout(5000)});
    if(!r.ok) throw Error("Metrics query returned HTTP "+r.status);
    const data=await r.json();
    if(data.status!=="success") throw Error("Metrics query failed");
    return data;
  };
  const project=JSON.stringify(process.env.VERIFY_COMPOSE_PROJECT);
  let lastError="Metrics are not ready";
  for(let i=0;i<20;i++){
    try {
      const r=await query("min(up)");
      const required=[
        "node_memory_MemAvailable_bytes",
        "node_cpu_seconds_total",
        "node_filesystem_avail_bytes{mountpoint=~\"/|/mnt/docker-desktop-disk\",fstype!~\"tmpfs|overlay\"}",
        "container_memory_working_set_bytes{container_label_com_docker_compose_project="+project+"}",
        "container_spec_cpu_quota{container_label_com_docker_compose_project="+project+"}"
      ];
      const data=await Promise.all(required.map(query));
      if(r.data?.result?.[0]?.value[1]==="1" && data.every(r=>r.data?.result?.length>0)) return;
    } catch(error) { lastError=error.message; }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error("Some monitoring targets or resource metrics are unavailable: "+lastError);
})().catch(e=>{console.error(e.message);process.exit(1)});'

grafana_password="$(docker compose exec -T grafana printenv GF_SECURITY_ADMIN_PASSWORD)"
docker compose exec -T -e "VERIFY_GRAFANA_PASSWORD=$grafana_password" api node -e '
(async()=>{
  const auth=Buffer.from("admin:"+process.env.VERIFY_GRAFANA_PASSWORD).toString("base64");
  let lastError="Dashboard is not ready";
  for(let i=0;i<20;i++){
    try {
      const r=await fetch("http://grafana:3000/api/dashboards/uid/listva",{headers:{authorization:"Basic "+auth},signal:AbortSignal.timeout(5000)});
      if(r.ok && (await r.json()).dashboard?.panels?.length>=15) return;
      lastError="HTTP "+r.status;
    } catch(error) { lastError=error.message; }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw Error("Grafana dashboard is not provisioned: "+lastError);
})().catch(e=>{console.error(e.message);process.exit(1)});'

# Restore into a disposable database, never over the running application database.
backup="$(bash scripts/backup.sh)"
verify_db="listva_restore_verify_$$"
db_stopped=false
api_stopped=false
verify_db_created=false
# shellcheck disable=SC2317
cleanup() {
  local status=$?
  if [[ "$db_stopped" == true ]]; then docker compose start db >/dev/null || status=1; fi
  if [[ "$api_stopped" == true ]]; then docker compose start api >/dev/null || status=1; fi
  if [[ "$verify_db_created" == true ]]; then
    docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$verify_db" >/dev/null || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$verify_db"
verify_db_created=true
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl --exit-on-error' sh "$verify_db" < "$backup"
before="$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc '\''SELECT count(*) FROM "User"'\''')"
after="$(docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$1" -Atc '\''SELECT count(*) FROM "User"'\''' sh "$verify_db")"
[[ "$before" == "$after" ]]
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$verify_db"
verify_db_created=false

# A DB outage must affect readiness, while liveness and diagnostic metrics remain available.
db_stopped=true
docker compose stop db
if ! ready_status="$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health/ready")"; then
  echo "Readiness request failed (HTTP $ready_status)" >&2
  exit 1
fi
[[ "$ready_status" == 503 ]]
curl --fail --silent --max-time 5 "http://127.0.0.1:$port/api/health/live" >/dev/null
docker compose exec -T api node -e '
(async()=>{
  const response=await fetch("http://127.0.0.1:3000/metrics",{signal:AbortSignal.timeout(10000)});
  if(!response.ok || !(await response.text()).includes("app_database_up 0")) throw Error("Diagnostics failed during DB outage");
})().catch(e=>{console.error(e.message);process.exit(1)});'
# The readiness loop below waits for the database connection to recover.
docker compose start db
db_recovered=false
for ((attempt=0; attempt<20; attempt++)); do
  if curl --fail --silent --max-time 5 "http://127.0.0.1:$port/api/health/ready" >/dev/null; then db_recovered=true; break; fi
  sleep 2
done
[[ "$db_recovered" == true ]]
db_stopped=false

# Check that monitoring actually detects a stopped API, then bring it back.
probe_url='http://victoriametrics:8428/api/v1/query?query=probe_success%7Binstance%3D%22http%3A%2F%2Fapi%3A3000%2Fapi%2Fhealth%2Fready%22%7D'
probe_matches() {
  local result
  if ! result="$(docker compose exec -T web wget -T 5 -q -O - "$probe_url")"; then return 1; fi
  printf '%s' "$result" | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
  try { const r=JSON.parse(s);process.exit(r.status==="success" && r.data?.result?.[0]?.value[1]===process.argv[1]?0:1); }
  catch { process.exit(1); }
});' "$1"
}
api_stopped=true
docker compose stop api
detected=false
for ((attempt=0; attempt<20; attempt++)); do
  if probe_matches 0; then detected=true; break; fi
  sleep 2
done
[[ "$detected" == true ]]
docker compose start api
for ((attempt=0; attempt<30; attempt++)); do
  if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/api/health/ready" >/dev/null && probe_matches 1; then
    api_stopped=false
    echo 'Monitoring, backup, restore and recovery verified.'
    exit 0
  fi
  sleep 2
done
exit 1
