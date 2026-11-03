#!/usr/bin/env python3
"""Bind one Herdr worker to the calling pane's current Pi session; no prompts sent."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def header(file):
    with open(file, encoding="utf-8") as stream:
        data = json.loads(stream.readline(16 * 1024))
    if data.get("type") != "session" or not re.fullmatch(r"[a-zA-Z0-9_-]+", data.get("id", "")):
        raise ValueError("invalid Pi session header")
    return data


def session(agent):
    ref = agent.get("agent_session", {})
    if ref.get("agent") != "pi" or ref.get("kind") != "path" or not Path(ref.get("value", "")).is_absolute():
        raise ValueError("pane has no confirmed Pi session path; wait for startup and retry")
    file = Path(ref["value"]).resolve()
    return file, header(file)


def bind(worker_pane, run_dir):
    if os.environ.get("HERDR_ENV") != "1":
        raise ValueError("dispatcher must run inside Herdr")
    pane = os.environ.get("HERDR_PANE_ID")
    workspace = os.environ.get("HERDR_WORKSPACE_ID")
    if not pane or not workspace or worker_pane == pane:
        raise ValueError("missing dispatcher identity or worker is the dispatcher itself")
    data = json.loads(subprocess.check_output(["herdr", "agent", "list"], text=True, timeout=15))
    if data.get("error") or not isinstance(data.get("result", {}).get("agents"), list):
        raise ValueError("Herdr did not return a valid agent snapshot")
    agents = data["result"]["agents"]
    owners = [a for a in agents if a.get("pane_id") == pane and a.get("workspace_id") == workspace]
    workers = [a for a in agents if a.get("pane_id") == worker_pane]
    if len(owners) != 1 or len(workers) != 1 or workers[0].get("workspace_id") != workspace:
        raise ValueError("dispatcher/worker missing, ambiguous, or in different workspaces")
    owner_file, owner = session(owners[0])
    worker_file, worker = session(workers[0])
    if os.environ.get("PI_SESSION_ID") and os.environ["PI_SESSION_ID"] != owner["id"]:
        raise ValueError("dispatcher session changed; refusing a stale binding")
    if os.environ.get("PI_SESSION_FILE") and Path(os.environ["PI_SESSION_FILE"]).resolve() != owner_file:
        raise ValueError("dispatcher session path changed; refusing a stale binding")
    root = Path(owner.get("cwd", ""))
    if not root.is_absolute() or not root.is_dir() or owner["id"] == worker["id"]:
        raise ValueError("invalid dispatcher cwd or identical dispatcher/worker sessions")
    run = Path(run_dir).resolve(strict=True)
    if not run.is_dir() or worker_file != run / "session.jsonl":
        raise ValueError("worker must use the specified run directory's session.jsonl")
    name = workers[0].get("name", workers[0].get("agent_name", ""))
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", name):
        raise ValueError("worker must have a valid named-agent slug")
    binding = {
        "version": 1,
        "owner": {"sessionId": owner["id"], "workspaceId": workspace, "paneId": pane},
        "worker": {"name": name, "workspaceId": workspace, "paneId": worker_pane,
                   "sessionFile": str(worker_file), "sessionId": worker["id"]},
        "runDir": str(run),
    }
    directory = root / ".sci" / "herdr-watch" / owner["id"]
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{name}.json"
    # Publish complete JSON atomically without replacing a different dispatch identity.
    fd, temporary = tempfile.mkstemp(prefix=".binding-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(binding, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        try:
            os.link(temporary, target)
        except FileExistsError:
            if json.loads(target.read_text(encoding="utf-8")) != binding:
                raise ValueError("slug already bound to another dispatch; use a new worker slug")
    finally:
        os.unlink(temporary)
    print(json.dumps({"binding": str(target), "owner": binding["owner"], "worker": binding["worker"]}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("usage: bind-worker.py <worker-pane-id> <absolute-run-dir>")
        bind(sys.argv[1], sys.argv[2])
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Herdr watch binding failed: {error}", file=sys.stderr)
        sys.exit(1)
