#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
for script in scripts/*.sh tests/ops/*.sh; do bash -n "$script"; done
node --check scripts/dev.mjs
node --check tests/ops/smoke-fetch.cjs
node --test tests/ops/dev.test.cjs
for test in tests/ops/*.test.sh; do bash "$test"; done
