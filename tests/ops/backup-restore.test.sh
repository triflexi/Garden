#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=tests/ops/helpers.sh
source "$(dirname "$0")/helpers.sh"

for scenario in backup-ok backup-fails backup-empty restore-ok invalid-archive restore-fails restart-fails no-confirm locked; do
  new_fixture
  printf 'archive-data' > "$fixture/input.dump"
  cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$CALL_LOG"
case "$*" in
  'compose exec -T db sh -c pg_dump '*)
    [[ "$SCENARIO" != backup-empty ]] || exit 0
    printf 'backup-data'
    [[ "$SCENARIO" != backup-fails ]] || exit 8 ;;
  'compose exec -T db pg_restore --list') cat >/dev/null; [[ "$SCENARIO" != invalid-archive ]] || exit 7 ;;
  'compose stop api') ;;
  'compose exec -T db sh -c pg_restore '*)
    [[ "$*" == *'--single-transaction'* && "$*" == *'--exit-on-error'* ]] || exit 91
    cat >/dev/null
    [[ "$SCENARIO" != restore-fails ]] || exit 6 ;;
  'compose start api') [[ "$SCENARIO" != restart-fails ]] || exit 5 ;;
  *) echo "Unexpected Docker command: $*" >&2; exit 90 ;;
esac
MOCK
  if [[ "$scenario" == locked ]]; then printf '#!/usr/bin/env bash\nexit 1\n' > "$fixture/bin/flock"; fi
  chmod +x "$fixture/bin/"*
  export SCENARIO="$scenario"
  case "$scenario" in
    backup-*) run_script backup.sh ;;
    no-confirm) run_script restore.sh input.dump ;;
    *) run_script restore.sh input.dump --confirm-replace-database ;;
  esac
  case "$scenario" in backup-ok|restore-ok) assert_success ;; *) assert_failure ;; esac
  case "$scenario" in
    backup-fails|backup-empty) [[ -z "$(find "$fixture/backups" -type f -print)" ]] ;;
    invalid-archive|no-confirm|locked)
      assert_not_called pg_dump
      assert_not_called 'stop api' ;;
    restore-fails)
      assert_called 'stop api'
      assert_not_called 'start api'
      grep -qF 'API remains stopped' "$fixture/output.log" ;;
    restore-ok|restart-fails)
      backup_line="$(grep -n pg_dump "$CALL_LOG" | cut -d: -f1)"
      stop_line="$(grep -n 'stop api' "$CALL_LOG" | cut -d: -f1)"
      [[ "$backup_line" -lt "$stop_line" ]]
      assert_called 'start api' ;;
  esac
  printf 'PASS: backup/restore %s\n' "$scenario"
done
