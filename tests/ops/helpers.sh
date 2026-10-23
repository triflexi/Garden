#!/usr/bin/env bash
# External commands in these fixtures never touch real services.
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture=''
cleanup() {
  if [[ "${fixture:-}" == /tmp/listva-ops-test.* ]]; then rm -rf -- "$fixture"; fi
}
trap cleanup EXIT
new_fixture() {
  cleanup
  fixture="$(mktemp -d /tmp/listva-ops-test.XXXXXX)"
  mkdir -p "$fixture/scripts" "$fixture/bin"
  cp "$root"/scripts/*.sh "$fixture/scripts/"
  printf 'HTTP_PORT=80\n' > "$fixture/.env"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/bin/sleep"
  export CALL_LOG="$fixture/calls.log" FIXTURE="$fixture"
  : > "$CALL_LOG"
}
run_script() {
  code=0
  PATH="$fixture/bin:$PATH" bash "$fixture/scripts/$1" "${@:2}" > "$fixture/output.log" 2>&1 || code=$?
}
assert_success() {
  if [[ "$code" != 0 ]]; then cat "$fixture/output.log" >&2; exit 1; fi
}
assert_failure() {
  if [[ "$code" == 0 ]]; then echo 'Expected failure, got success' >&2; cat "$fixture/output.log" >&2; exit 1; fi
}
assert_called() {
  if ! grep -qF -- "$1" "$CALL_LOG"; then cat "$CALL_LOG" "$fixture/output.log" >&2; exit 1; fi
}
assert_not_called() {
  if grep -qF -- "$1" "$CALL_LOG"; then echo "Unexpected call: $1" >&2; cat "$CALL_LOG" >&2; exit 1; fi
}
