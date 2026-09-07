---
name: tmux-runner
description: 'Run a long-running analysis under tmux so it survives agent timeouts. Use for heavy tools (SCENIC, CellRanger, STAR, …), large data, or jobs expected to take more than ~2 minutes. No plan or delegated worker is required.'
---

# Tmux Runner

Canonical wrapper + workflow for executing a long-running analysis script inside a
detached tmux session, so it survives agent timeouts and can be monitored in real
time.

The main agent can use this directly. A delegated execution worker can use the
same wrapper when useful; neither delegation nor a plan file is required.

## The wrapper script

A ready-to-use, commented copy lives next to this SKILL.md at
`references/tmux_runner.sh`. **Copy it into the module — do not transcribe it**
(it contains delicate shell/JSON escaping; transcribing by hand is the #1 way to
break it):

```bash
mkdir -p <Module>/scripts/utils
cp <this skill's location>/references/tmux_runner.sh <Module>/scripts/utils/tmux_runner.sh
chmod +x <Module>/scripts/utils/tmux_runner.sh
```

`<this skill's location>` is the `<location>` of `tmux-runner` in your
`<available_skills>` block.

### What the wrapper does

- Resolves `<Module>` from its own path (`<Module>/scripts/utils/`), so logs always
  land under the right module regardless of the cwd it is launched from.
- Captures the **script's** real exit code via `${PIPESTATUS[0]}` (not `tee`'s,
  which is ~always 0) → writes `<Module>/tmux/<session>.status` as
  `EXIT_STATUS:<code>`.

## When to use tmux

Use tmux for ANY of:

- The plan marks the step `**Long-running**: yes` or `**Estimated time**: >5min`
- Large datasets (>10k cells, >5k genes)
- SCENIC, cell communication, trajectory analysis, or multi-sample processing
- External tools (CellRanger, STAR, HISAT2, …)
- You judge it will take more than ~2 minutes

The ~2-minute judgment is the operative threshold; the plan markers are signals,
not a separate threshold.

Quick steps (QC filtering, simple plots, small data) → run directly via `bash`,
no tmux.

## Launch

```bash
bash <Module>/scripts/utils/tmux_runner.sh \
  "sci_<module>_<step>" \
  <Module>/scripts/stages/01_analysis.py
```

Extra args after the script path are forwarded to the script (`$*`).

### Session naming

`sci_<module>_<step>` — e.g. `sci_preprocessing_p01`, `sci_clustering_p02`,
`sci_deg_p03`.

## Monitor (poll every 10–30 s)

```bash
tmux has-session -t "sci_<module>_<step>" 2>/dev/null && echo "Running" || echo "Finished"
tail -20 <Module>/tmux/<session>.log
cat <Module>/tmux/<session>.status 2>/dev/null || echo "Still running"
tail -1 <Module>/tmux/manifest.jsonl
```

When the session no longer exists, read the `.status` file for the exit code; if
non-zero, read the log to diagnose.

## Verify completion

After the session ends:

1. `cat <Module>/tmux/<session>.status` → expect `EXIT_STATUS:0` (the manifest's
   `"exitCode"` is the same value — one check suffices)
2. Expected output files (from the task or an optional plan) are present,
   non-empty, readable, and pass the analysis-specific content checks
3. Inspect the log for traceback, ERROR, and WARNING; resolve errors and assess
   warnings rather than treating every warning as failure

## Error handling

- **Non-zero exit / script fails**: read the full log, identify the error, fix the
  script, and re-launch.
- **No status file after a long wait**: possibly hung — inspect with
  `tmux capture-pane -t <name>`.

## Cleanup

After verifying results:

```bash
tmux kill-session -t "sci_<module>_<step>" 2>/dev/null || true
```

## Files produced

Record these paths with the execution outcome (and in a delegated handoff if
one is used):

- `scripts/utils/tmux_runner.sh` → copied wrapper
- `tmux/<session>.log` → execution log
- `tmux/<session>.status` → actual script exit status
- `tmux/manifest.jsonl` → append-only run history (one JSON line per run)

The executor updates any checklist or plan after verifying completion.
