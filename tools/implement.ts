import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runAgent } from "../core/runner.js";
import { registerTaskAgentTool } from "./delegate.js";

/** Optional worker only. Review is a separate, deliberate tool call. */
export function registerImplementTool(pi: ExtensionAPI, run = runAgent): void {
	registerTaskAgentTool(pi, "worker", run);
}
