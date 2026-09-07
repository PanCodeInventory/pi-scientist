import * as fs from "node:fs";
import * as path from "node:path";
import { truncateTail, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
			"Actions: 'list' (all runs), 'failed' (exitCode!=0), 'latest' (last recorded run per module/session, not proof of authoritative results), 'log' (a log tail). Output is bounded to 50KB/2000 lines; read the referenced manifests/log for more.",
		].join(" "),
		promptSnippet: "Inspect tmux execution history and logs",
		promptGuidelines: [
			"Use sci_logs to answer questions about script execution history, costs in time, or failures — it reads the per-module manifest.jsonl files, not agent memory.",
			"sci_logs 'latest' shows the last recorded run per module/session, which may have failed. Exit zero does not imply scientific validation or authoritative results.",
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
			lines: Type.Optional(Type.Integer({ description: "For action 'log': trailing lines; default 40.", default: 40, minimum: 1, maximum: 2000 })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const root = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
			let runs = collectScriptRuns(root);
			if (params.module) runs = runs.filter((r) => r.module === params.module);

			const action = (params.action as string) || "list";

			// action: log — tail a specific log file
			if (action === "log") {
				if (!params.session) {
					throw new Error("action 'log' requires 'session'.");
				}
				const mod = params.module || runs.find((r) => r.session === params.session)?.module;
				if (!mod) {
					throw new Error(`No manifest entry found for session '${params.session}'. Specify module or check sci_logs list.`);
				}
				const logPath = path.join(root, mod, "tmux", `${params.session}.log`);
				try {
					const content = fs.readFileSync(logPath, "utf-8");
					const n = params.lines ?? 40;
					const allLines = content.split("\n");
					const tail = truncateTail(allLines.slice(Math.max(0, allLines.length - n)).join("\n"));
					return {
						content: [{ type: "text", text: `tail -n ${n} ${logPath}\n${"─".repeat(40)}\n${tail.content}${tail.truncated ? `\n[Truncated; full log: ${logPath}]` : ""}` }],
						details: stubDetails("sci_logs", "log"),
					};
				} catch {
					throw new Error(`Cannot read log: ${logPath}`);
				}
			}

			if (runs.length === 0) {
				return { content: [{ type: "text", text: `No script-run manifests found under ${root}. Only tmux-runner jobs create <Module>/tmux/manifest.jsonl; direct main-agent execution is supported. Do not run a job just to populate logs.` }], details: stubDetails("sci_logs", action) };
			}

			// Sort newest-first by endTs (fall back to ts string, then manifest order)
			runs.reverse().sort((a, b) => (b.endTs ?? 0) - (a.endTs ?? 0) || String(b.ts ?? "").localeCompare(String(a.ts ?? "")));

			let selected = runs;
			if (action === "failed") {
				selected = runs.filter((r) => r.exitCode !== 0);
				if (selected.length === 0) {
					return { content: [{ type: "text", text: `All ${runs.length} recorded run(s) exited zero. No non-zero exits recorded; scientific validation is not implied.` }], details: stubDetails("sci_logs", "failed") };
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
			const body = truncateTail(lines.join("\n"));
			return { content: [{ type: "text", text: `${header}\n${"─".repeat(40)}\n${body.content}${body.truncated ? `\n[Truncated; read <Module>/tmux/manifest.jsonl under ${root}]` : ""}` }], details: stubDetails("sci_logs", action) };
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
