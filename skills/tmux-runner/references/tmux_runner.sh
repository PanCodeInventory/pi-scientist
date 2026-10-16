#!/bin/bash
# Copy to <Module>/scripts/utils/. Requires bash, python3 and util-linux flock.
set -euo pipefail

# Internal worker: invoked directly, never through send-keys or interpolated code.
if [[ ${1:-} == --_run ]]; then
    shift
    STATUS_FILE=$1 LOG_FILE=$2 MANIFEST_FILE=$3 RUN_ID=$4 START_TS=$5 SESSION_NAME=$6 MODULE=$7 BACKEND=$8
    shift 8
    SCRIPT_PATH=$1
    shift
    printf '%s\n' "$$" > "${STATUS_FILE}.pid"
    finish() {
        local code=$? end
        trap - EXIT
        end=$(date +%s)
        # Publish completion last, after the manifest is durable to readers.
        python3 - "$MANIFEST_FILE" "$RUN_ID" "$START_TS" "$end" "$SESSION_NAME" "$MODULE" "$SCRIPT_PATH" "$code" "$BACKEND" <<'PY'
import fcntl, json, sys, time
manifest, run, start, end, session, module, script, code, backend = sys.argv[1:]
record = dict(ts=time.strftime('%Y%m%d-%H%M%S'), runId=run, startTs=int(start), endTs=int(end),
              duration_s=int(end)-int(start), session=session, module=module, script=script,
              exitCode=int(code), backend=backend, logFile=f'tmux/{session}.log', statusFile=f'tmux/{session}.status')
with open(manifest, 'a') as out:
    fcntl.flock(out, fcntl.LOCK_EX)
    out.write(json.dumps(record) + '\n')
PY
        printf 'EXIT_STATUS:%s\nSTATE:FINISHED\nRUN_ID:%s\nSTART_TS:%s\nEND_TS:%s\nBACKEND:%s\n' \
            "$code" "$RUN_ID" "$START_TS" "$end" "$BACKEND" > "${STATUS_FILE}.tmp"
        mv -- "${STATUS_FILE}.tmp" "$STATUS_FILE"
        exit "$code"
    }
    trap finish EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
    # Redirect directly: no tee pipeline that can hide the script's exit code.
    bash "$SCRIPT_PATH" "$@"
    exit $?
fi

WAIT=0 BACKEND=tmux
while [[ ${1:-} == --* ]]; do
    case $1 in
        --wait) WAIT=1; shift ;;
        --backend) BACKEND=${2:?Missing backend}; shift 2 ;;
        --) shift; break ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done
SESSION_NAME=${1:?Usage: tmux_runner.sh [--wait] [--backend tmux|setsid] <session> <shell-script> [args...]}
SCRIPT_REL=${2:?Missing shell script}
shift 2
[[ $SESSION_NAME =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid session name' >&2; exit 2; }
[[ $BACKEND == tmux || $BACKEND == setsid ]] || { echo 'Backend must be tmux or setsid' >&2; exit 2; }
for bin in "$BACKEND" flock python3; do command -v "$bin" >/dev/null || { echo "Missing: $bin" >&2; exit 127; }; done
SCRIPT_PATH=$(readlink -f -- "$SCRIPT_REL")
[[ -f $SCRIPT_PATH ]] || { echo "Script not found: $SCRIPT_REL" >&2; exit 2; }
WRAPPER=$(readlink -f -- "$0")
MODULE_DIR=$(cd "$(dirname "$WRAPPER")/../.." && pwd)
MODULE=$(basename "$MODULE_DIR")
LOG_DIR="$MODULE_DIR/tmux"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$SESSION_NAME.log"
STATUS_FILE="$LOG_DIR/$SESSION_NAME.status"
MANIFEST_FILE="$LOG_DIR/manifest.jsonl"
exec 9> "$LOG_DIR/$SESSION_NAME.lock"
flock -n 9 || { echo 'Another launcher is using this session' >&2; exit 1; }
# Do not kill a live job, or silently retry an interrupted job with unknown effects.
if grep -q '^STATE:RUNNING$' "$STATUS_FILE" 2>/dev/null || \
   { command -v tmux >/dev/null && tmux has-session -t "=$SESSION_NAME" 2>/dev/null; }; then
    echo "Refusing to replace running/unresolved job: $SESSION_NAME. Inspect status, process and outputs first." >&2
    exit 1
fi
[[ ! -f $STATUS_FILE ]] || mv -- "$STATUS_FILE" "${STATUS_FILE}.last"
[[ ! -f $LOG_FILE ]] || mv -- "$LOG_FILE" "${LOG_FILE}.last"
rm -f -- "${STATUS_FILE}.pid"
: > "$LOG_FILE"
START_TS=$(date +%s)
RUN_ID="${START_TS}-$$-${RANDOM}"
printf 'STATE:RUNNING\nRUN_ID:%s\nSTART_TS:%s\nBACKEND:%s\n' "$RUN_ID" "$START_TS" "$BACKEND" > "${STATUS_FILE}.tmp"
mv -- "${STATUS_FILE}.tmp" "$STATUS_FILE"
worker=(bash "$WRAPPER" --_run "$STATUS_FILE" "$LOG_FILE" "$MANIFEST_FILE" "$RUN_ID" "$START_TS" "$SESSION_NAME" "$MODULE" "$BACKEND" "$SCRIPT_PATH" "$@")
if [[ $BACKEND == tmux ]]; then
    # tmux uses a shell command; quote each argument individually for bash.
    printf -v command '%q ' "${worker[@]}"
    printf -v command '%s > %q 2>&1' "$command" "$LOG_FILE"
    printf -v command 'exec bash -c %q' "$command"
    tmux new-session -d -s "$SESSION_NAME" -c "$PWD" "$command" 9>&- || {
        echo 'Launch failed; RUNNING is unresolved, not success. Inspect before retry.' >&2; exit 1;
    }
else
    # New session/process group, no inherited terminal or tool pipes. Not a cgroup escape.
    setsid --fork "${worker[@]}" < /dev/null >> "$LOG_FILE" 2>&1 9>&-
fi
flock -u 9
exec 9>&-
echo "[runner] Started $SESSION_NAME ($BACKEND), RUN_ID=$RUN_ID"
echo "[runner] Log: $LOG_FILE"
echo "[runner] Status: $STATUS_FILE"
[[ $WAIT == 1 ]] || exit 0
while :; do
    # One atomic snapshot; never accept another invocation's completion.
    status=$(<"$STATUS_FILE")
    grep -qx "RUN_ID:$RUN_ID" <<< "$status" || { echo 'Run replaced while waiting' >&2; exit 125; }
    if grep -q '^EXIT_STATUS:' <<< "$status"; then
        code=$(grep '^EXIT_STATUS:' <<< "$status")
        exit "${code#EXIT_STATUS:}"
    fi
    alive=0
    if [[ $BACKEND == tmux ]]; then
        tmux has-session -t "=$SESSION_NAME" 2>/dev/null && alive=1
    elif [[ -s ${STATUS_FILE}.pid ]]; then
        pid=$(<"${STATUS_FILE}.pid")
        process_state=$(ps -o stat= -p "$pid" 2>/dev/null || true)
        [[ -n $process_state && $process_state != *Z* ]] && kill -0 "$pid" 2>/dev/null && alive=1
    elif (( $(date +%s) - START_TS < 10 )); then
        alive=1 # worker startup handshake
    fi
    if [[ $alive == 0 ]]; then
        # Completion may have been published between the status read and liveness check.
        grep -q '^EXIT_STATUS:' "$STATUS_FILE" && continue
        echo 'Runner disappeared without completion; outputs are unverified. No automatic retry.' >&2
        exit 125
    fi
    sleep 1
done
