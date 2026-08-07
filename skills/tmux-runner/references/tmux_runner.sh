#!/bin/bash
set -euo pipefail

SESSION_NAME="${1:?Usage: $0 <session_name> <script_path> [args...]}"
SCRIPT_REL="${2:?Usage: $0 <session_name> <script_path> [args...]}"
shift 2

# Resolve absolute paths. Logs live under the MODULE's tmux/ folder, located
# relative to this wrapper script (correct regardless of where it is invoked from).
WRAPPER_DIR="$(cd "$(dirname "$0")" && pwd)"        # <Module>/scripts/utils
MODULE_DIR="$(cd "$WRAPPER_DIR/../.." && pwd)"        # <Module>
MODULE="$(basename "$MODULE_DIR")"
SCRIPT_PATH="$(readlink -f "$SCRIPT_REL")"
WORK_DIR="$(pwd)"                                      # tmux session cwd (analysis root)
LOG_DIR="$MODULE_DIR/tmux"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/${SESSION_NAME}.log"
STATUS_FILE="$LOG_DIR/${SESSION_NAME}.status"
MANIFEST_FILE="$LOG_DIR/manifest.jsonl"

# Clean up previous run's status (log is overwritten by tee; manifest keeps history)
rm -f "$STATUS_FILE"

# Kill existing session if any
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Create detached tmux session
tmux new-session -d -s "$SESSION_NAME" -c "$WORK_DIR"

# Send the command to the tmux session
tmux send-keys -t "$SESSION_NAME" "
cd '$WORK_DIR' && \
  START_TS=\$(date +%s); \
  bash '$SCRIPT_PATH' $* 2>&1 | tee '$LOG_FILE'; \
  EXIT_CODE=\${PIPESTATUS[0]}; \
  END_TS=\$(date +%s); \
  DURATION=\$((END_TS - START_TS)); \
  echo \"EXIT_STATUS:\$EXIT_CODE\" > '$STATUS_FILE'; \
  printf '{\"ts\":\"%s\",\"startTs\":%s,\"endTs\":%s,\"duration_s\":%s,\"session\":\"$SESSION_NAME\",\"module\":\"$MODULE\",\"script\":\"$SCRIPT_REL\",\"exitCode\":%s,\"logFile\":\"tmux/${SESSION_NAME}.log\",\"statusFile\":\"tmux/${SESSION_NAME}.status\"}\n' \"\$(date +%Y%m%d-%H%M%S)\" \"\$START_TS\" \"\$END_TS\" \"\$DURATION\" \"\$EXIT_CODE\" >> '$MANIFEST_FILE'; \
  echo \"[tmux-wrapper] Script finished with exit code \$EXIT_CODE (duration \${DURATION}s)\"; \
  echo \"[tmux-wrapper] Log: $LOG_FILE\"; \
  echo \"[tmux-wrapper] Status: $STATUS_FILE\"
" Enter

echo "[tmux-wrapper] Session '$SESSION_NAME' started"
echo "[tmux-wrapper] Log: $LOG_FILE"
echo "[tmux-wrapper] Status: $STATUS_FILE"
echo "[tmux-wrapper] Monitor with: tmux attach -t $SESSION_NAME"
