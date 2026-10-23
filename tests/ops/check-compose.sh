#!/usr/bin/env bash
# Read-only checks against a real Compose CLI, including the minimum supported version in CI.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
export API_IMAGE=ghcr.io/example/api:verified WEB_IMAGE=ghcr.io/example/web:verified
export DB_PASSWORD=compose-validation-password GRAFANA_PASSWORD=compose-validation-password
docker compose version
docker compose up -d --wait --wait-timeout 120 --no-build --no-deps --pull never --remove-orphans --help >/dev/null
docker compose run --rm --no-deps --help >/dev/null
docker compose --env-file .env.example -f compose.yaml config --format json | node -e '
const assert=require("node:assert/strict"), fs=require("node:fs"), c=JSON.parse(fs.readFileSync(0,"utf8"));
assert.equal(c.services.db.ports,undefined);
assert.equal(c.services.api.ports,undefined);
assert.equal(c.services.grafana.ports[0].host_ip,"0.0.0.0");
assert.equal(String(c.services.grafana.ports[0].published),"3001");
assert.equal(c.services.grafana.ports[0].target,3000);
assert.equal(c.services.api.depends_on.migrate.condition,"service_completed_successfully");'
docker compose --env-file .env.example -f compose.dev.yaml config --format json | node -e '
const assert=require("node:assert/strict"), fs=require("node:fs"), c=JSON.parse(fs.readFileSync(0,"utf8"));
assert.deepEqual(Object.keys(c.services),["db"]);
assert.equal(c.services.db.ports[0].host_ip,"127.0.0.1");'
for policy in always never; do
  DEPLOY_PULL_POLICY="$policy" docker compose --env-file .env.example -f compose.yaml -f compose.prod.yaml config --format json | EXPECTED_POLICY="$policy" node -e '
const assert=require("node:assert/strict"), fs=require("node:fs"), c=JSON.parse(fs.readFileSync(0,"utf8"));
for(const service of ["api","migrate","web"]){
  assert.equal(c.services[service].build,undefined);
  assert.equal(c.services[service].pull_policy,process.env.EXPECTED_POLICY);
}
assert.equal(c.services.api.image,process.env.API_IMAGE);
assert.equal(c.services.migrate.image,process.env.API_IMAGE);
assert.equal(c.services.web.image,process.env.WEB_IMAGE);'
done
echo 'PASS: Compose CLI flags and development/production configurations'
