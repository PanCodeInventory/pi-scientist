---
name: tmux-runner
description: 'Run a long-running analysis under tmux so it survives agent timeouts, with an explicit setsid alternative. Use for heavy tools (SCENIC, CellRanger, STAR, …), large data, or jobs expected to take more than ~2 minutes. No plan or delegated worker is required.'
---

# Tmux Runner

Main agents and delegated workers use the same wrapper. Copy it, do not transcribe:

```bash
mkdir -p <Module>/scripts/utils
cp <this skill's location>/references/tmux_runner.sh <Module>/scripts/utils/tmux_runner.sh
```

Requires Linux, Bash, Python 3, util-linux `flock`, and the selected backend.
Module paths resolve from the wrapper's location; the analysis runs in the caller's cwd.

## Launch and dependencies

```bash
bash <Module>/scripts/utils/tmux_runner.sh sci_module_step <Module>/scripts/stages/run_step.sh "argument with spaces"
```

The entry point is a **shell script**, not a `.py` or `.R` file. Put the actual command
in it, e.g. `exec mamba run -n myenv python -u path/to/01_analysis.py "$@"`.
Use explicit environment commands/interpreter paths instead of relying on an interactive
shell's activation. All arguments are preserved as separate arguments.

Default launch is asynchronous: exit 0 means **started**, not completed. For dependent
steps, use `--wait` and `&&` (or `set -e` in a chain shell script):

```bash
bash <Module>/scripts/utils/tmux_runner.sh --wait sci_module_p01 path/to/p01.sh &&
bash <Module>/scripts/utils/tmux_runner.sh --wait sci_module_p02 path/to/p02.sh
```

`--wait` returns the script's exit code; 125 means the runner disappeared or the run
was replaced, not scientific failure. Validate upstream artifacts before consuming them;
zero exit alone does not establish that contract. Put very long chains in a shell script
and launch that script once with the wrapper, rather than keeping a bash tool open past
its timeout. Interrupting the waiter does not cancel a detached computation.

## Backend choice and limits

Tmux is the default; attach with `tmux attach -t sci_module_step`. If tmux is unreliable
on this host, choose **before starting**:

```bash
bash <Module>/scripts/utils/tmux_runner.sh --backend setsid sci_module_step path/to/run_step.sh
```

This starts a new process session with detached stdio. `nohup` alone only ignores SIGHUP;
`setsid` also separates the process group. Neither survives host shutdown, OOM, cgroup-wide
kill, or targeted process termination. Do not automatically replay a job after tmux dies:
it might still be running, or might have partially published outputs. No daemon or
systemd service is installed by this wrapper.

## Monitor and verify

Files in `<Module>/tmux/`:
- `<session>.log`: current log (reset **before** launch).
- `<session>.status`: `STATE:RUNNING`, `RUN_ID`, `START_TS`, `BACKEND` immediately;
  on completion, atomically replaced with `EXIT_STATUS:<code>`, `STATE:FINISHED`,
  the same run ID and timestamps. Absence of an exit code is **not success**.
- `<session>.status.pid`: worker PID, for process inspection; a PID alone can be reused.
- `<session>.status.last` / `<session>.log.last`: previous run, not current evidence.
- `manifest.jsonl`: append-only completed run history, including run ID and backend.

Read status and log when a result is needed, or use `--wait`; avoid repeated long sleeps.
For tmux, session disappearance **without a completed status is interruption**, not
completion. For setsid inspect the recorded PID and command (`ps`) as well as status.
After exit 0, check that expected outputs are non-empty, readable, correctly aligned,
and scientifically valid. Assess log warnings and resolve errors.

A duplicate session or unresolved RUNNING status is refused, never killed/overwritten.
For an interrupted run, inspect processes and outputs first; stop any surviving job
only when intended. Then archive the unresolved status and log (or choose a new run
name) before a deliberate rerun. Use a unique `sci_<module>_<step>` name for each job.
SIGKILL/server loss may leave RUNNING forever; no exit trap can reliably report those.

## Protect expensive outputs

Write large/final artifacts to a unique temporary file **in the destination directory**,
close and validate it, then atomically rename it. Never stream directly over the only
valid result. For example (overwrite only when authorized):

```python
import os, tempfile
from pathlib import Path
import anndata as ad

output = Path("results/data/annotated.h5ad")
fd, temporary = tempfile.mkstemp(dir=output.parent, suffix=".h5ad")
os.close(fd)
try:
    adata.write_h5ad(temporary)
    check = ad.read_h5ad(temporary, backed="r")
    assert check.shape == adata.shape
    assert check.obs_names.equals(adata.obs_names)
    check.file.close()
    os.replace(temporary, output)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
```

Add data-specific validation; shape checks are not full content checks. Same-filesystem
rename prevents readers seeing a truncated final file, but is not a power-loss durability
guarantee or authorization to overwrite inputs. SIGKILL can leave a temporary file;
inspect it rather than treating it as a completed output.

Record command, run ID, status/log paths, and actual output checks with the outcome
(and in a delegated task's `result.md`).
