import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { collectScriptRuns, fmtDuration, stubDetails } from "./shared.js";

export function registerLogsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "sci_logs",
		label: "Sci Logs",
		description: [
			"Query the script-run manifests produced by tmux executions across all analysis modules.",
			"Every long-running script run is auto-recorded in <Module>/tmux/manifest.jsonl (timestamp, duration, exit code, script, log path).",
			"Use this to answer: which scripts ran, which succeeded/failed, how long they took, and where their logs are — without grepping the filesystem manually.",
			"Actions: 'list' (all runs), 'failed' (exitCode!=0), 'latest' (last run per module/session — the runs that produced final results), 'log' (dump a specific log's tail).",
		].join(" "),
		promptSnippet: "Query tmux script-run manifests to see which scripts ran / failed / produced final results",
		promptGuidelines: [
			"Use sci_logs to answer questions about script execution history, costs in time, or failures — it reads the per-module manifest.jsonl files, not agent memory.",
			"'latest' shows the last run of each script — these are the runs that produced the final/current results.",
			"'failed' shows every run that exited non-zero — useful for diagnosing what went wrong before a successful re-run.",
			"For the full stdout/stderr of a specific run, use action 'log' with the session name, or read the <Module>/tmux/<session>.log file directly.",
		],
		parameters: Type.Object({
			cwd: Type.String({ description: "Analysis parent directory (the root containing <NN>_ModuleName/ module folders)." }),
			action: StringEnum(["list", "failed", "latest", "log"] as const, {
				description: "'list' = all runs; 'failed' = non-zero exit; 'latest' = last run per session; 'log' = tail of a specific log.",
				default: "list",
			}),
			module: Type.Optional(Type.String({ description: "Restrict to one module (e.g. '03_DEG')." })),
			session: Type.Optional(Type.String({ description: "For action 'log': the tmux session name whose log to tail (e.g. 'sci_deg_p03')." })),
			lines: Type.Optional(Type.Number({ description: "For action 'log': number of trailing lines to show. Default 40.", default: 40 })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			let runs = collectScriptRuns(root);
			if (params.module) runs = runs.filter((r) => r.module === params.module);

			const action = (params.action as string) || "list";

			// action: log — tail a specific log file
			if (action === "log") {
				if (!params.session) {
					return { content: [{ type: "text", text: "action 'log' requires 'session'." }], details: stubDetails("sci_logs", "log"), isError: true };
				}
				const mod = params.module || runs.find((r) => r.session === params.session)?.module;
				if (!mod) {
					return { content: [{ type: "text", text: `No manifest entry found for session '${params.session}'. Pass --module or check sci_logs list.` }], details: stubDetails("sci_logs", "log"), isError: true };
				}
				const logPath = path.join(root, mod, "tmux", `${params.session}.log`);
				try {
					const content = fs.readFileSync(logPath, "utf-8");
					const n = params.lines ?? 40;
					const allLines = content.split("\n");
					const tail = allLines.slice(Math.max(0, allLines.length - n)).join("\n");
					return {
						content: [{ type: "text", text: `tail -n ${n} ${mod}/tmux/${params.session}.log\n${"─".repeat(40)}\n${tail}` }],
						details: stubDetails("sci_logs", "log"),
					};
				} catch {
					return { content: [{ type: "text", text: `Log not found: ${mod}/tmux/${params.session}.log` }], details: stubDetails("sci_logs", "log"), isError: true };
				}
			}

			if (runs.length === 0) {
				return { content: [{ type: "text", text: `No script-run manifests found under ${root}. Run a long-running script via sci_implement first (manifests are written to <Module>/tmux/manifest.jsonl).` }], details: stubDetails("sci_logs", action) };
			}

			// Sort newest-first by endTs (fall back to ts string, then manifest order)
			runs.sort((a, b) => (b.endTs ?? 0) - (a.endTs ?? 0) || String(b.ts ?? "").localeCompare(String(a.ts ?? "")));

			let selected = runs;
			if (action === "failed") {
				selected = runs.filter((r) => r.exitCode !== 0);
				if (selected.length === 0) {
					return { content: [{ type: "text", text: `All ${runs.length} run(s) succeeded (exitCode 0). No failures recorded.` }], details: stubDetails("sci_logs", "failed") };
				}
			} else if (action === "latest") {
				// Keep only the last run per (module, session)
				const seen = new Set<string>();
				selected = [];
				for (const r of runs) { // runs is newest-first
					const key = `${r.module}/${r.session}`;
					if (seen.has(key)) continue;
					seen.add(key);
					selected.push(r);
				}
			}

			const lines = selected.map((r) => {
				const mark = r.exitCode === 0 ? "✓" : "✗";
				return `[${r.module}] ${mark} ${r.session}  exit=${r.exitCode}  ${fmtDuration(r.duration_s)}  ${r.ts ?? ""}  ${r.script}`;
			});
			const header = `sci_logs ${action} — ${selected.length} run(s)` +
				(params.module ? ` in ${params.module}` : "") +
				`\n(root: ${root})`;
			return { content: [{ type: "text", text: `${header}\n${"─".repeat(40)}\n${lines.join("\n")}` }], details: stubDetails("sci_logs", action) };
		},

		renderCall(args, theme, _context) {
			const action = (args.action as string) || "list";
			const cwd = (args.cwd as string) || "...";
			return new Text(
				theme.fg("toolTitle", theme.bold("sci_logs ")) + theme.fg("accent", action) + `\n  ${theme.fg("dim", cwd)}`,
				0, 0,
			);
		},

		renderResult(result, _opts, theme, _context) {
			return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
		},
	});
}
