import * as fs from "node:fs";
import * as path from "node:path";

export interface ScriptRun {
	module: string;
	session: string;
	script: string;
	exitCode: number;
	duration_s?: number;
	ts?: string;
	startTs?: number;
	endTs?: number;
	logFile: string;
	statusFile: string;
	manifestPath: string;
}

/** Scan an analysis root for every <Module>/tmux/manifest.jsonl. */
export function collectScriptRuns(root: string): ScriptRun[] {
	const runs: ScriptRun[] = [];
	let modules: string[];
	try {
		modules = fs.readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => fs.existsSync(path.join(root, name, "tmux", "manifest.jsonl")));
	} catch {
		return [];
	}

	for (const moduleName of modules) {
		const manifest = path.join(root, moduleName, "tmux", "manifest.jsonl");
		let content: string;
		try {
			content = fs.readFileSync(manifest, "utf-8");
		} catch {
			continue;
		}
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const record = JSON.parse(trimmed);
				runs.push({
					module: String(record.module ?? moduleName),
					session: String(record.session ?? ""),
					script: String(record.script ?? ""),
					exitCode: Number(record.exitCode),
					duration_s: record.duration_s,
					ts: record.ts,
					startTs: record.startTs,
					endTs: record.endTs,
					logFile: String(record.logFile ?? ""),
					statusFile: String(record.statusFile ?? ""),
					manifestPath: path.join(moduleName, "tmux", "manifest.jsonl"),
				});
			} catch {
				// Ignore malformed manifest lines.
			}
		}
	}
	return runs;
}

export function fmtDuration(seconds: number | undefined): string {
	if (seconds == null) return "-";
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
	return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}
