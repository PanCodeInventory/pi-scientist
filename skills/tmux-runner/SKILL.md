---
name: tmux-runner
description: 'Worker-side execution infrastructure for long-running bioinformatics scripts. Used by the worker agent (not the main agent) to run a step under tmux so it survives agent timeouts, with a run log, an exit-status file, and an append-only manifest. Provides the canonical tmux_runner.sh wrapper, launch/monitor/verify workflow, session naming, and the <Module>/tmux/manifest.jsonl contract that the reviewer and sci_logs rely on.'
---

# Tmux Runner

Canonical wrapper + workflow for executing a long-running analysis script inside a
detached tmux session, so it survives agent timeouts and can be monitored in real
time. Every run is recorded as one JSON line in `<Module>/tmux/manifest.jsonl`.

The main agent does NOT invoke this directly. The **worker** loads it when it
decides a step is long-running.

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
- Launches the script in a detached tmux session (cwd = analysis root).
- Tees stdout/stderr to `<Module>/tmux/<session>.log`.
- Captures the **script's** real exit code via `${PIPESTATUS[0]}` (not `tee`'s,
  which is ~always 0) → writes `<Module>/tmux/<session>.status` as
  `EXIT_STATUS:<code>`.
- Appends one JSON line per run to `<Module>/tmux/manifest.jsonl`
  (`ts`, `startTs`, `endTs`, `duration_s`, `session`, `module`, `script`,
  `exitCode`, `logFile`, `statusFile`).

## When to use tmux

Use tmux for ANY of:

- The plan marks the step `**Long-running**: yes` or `**Estimated time**: >5min`
- Large datasets (>10k cells, >5k genes)
- SCENIC, cell communication, trajectory analysis, or multi-sample processing
- External tools (CellRanger, STAR, HISAT2, …)
- You judge it will take more than ~2 minutes

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
`sci_deg_p03`. Descriptive and unique to avoid collisions. The wrapper kills any
existing session with the same name before launching.

## Monitor (poll every 10–30 s)

```bash
tmux has-session -t "sci_<module>_<step>" 2>/dev/null && echo "Running" || echo "Finished"
tail -20 <Module>/tmux/<session>.log
cat <Module>/tmux/<session>.status 2>/dev/null || echo "Still running"
tail -1 <Module>/tmux/manifest.jsonl
```

Between polls you may do other preparatory work. When the session no longer
exists, read the `.status` file for the exit code; if non-zero, read the log to
diagnose.

## Verify completion

After the session ends:

1. `cat <Module>/tmux/<session>.status` → expect `EXIT_STATUS:0`
2. All expected output files exist
3. The log shows no errors/warnings
4. `tail -1 <Module>/tmux/manifest.jsonl` shows `"exitCode":0`

## Error handling

- **Script fails**: read the log, fix the script, re-launch (the wrapper kills the
  prior session automatically).
- **Status shows non-zero exit**: read the full log, identify the error, fix and
  retry.
- **No status file after a long wait**: possibly hung — inspect with
  `tmux capture-pane -t <name>`.

## Cleanup

After verifying results:

```bash
tmux kill-session -t "sci_<module>_<step>" 2>/dev/null || true
```

## Files produced (declare in the handoff JSON when tmux was used)

A tmux run creates, under the module:

- `scripts/utils/tmux_runner.sh` — the wrapper → handoff role `tmux_wrapper`
- `tmux/<session>.log` — full run log → handoff role `tmux_log`
- `tmux/<session>.status` — `EXIT_STATUS:<code>` → handoff role `tmux_status`
- `tmux/manifest.jsonl` — append-only run history (one JSON line per run)

`.log` and `.status` are overwritten on re-run; `manifest.jsonl` is append-only.
