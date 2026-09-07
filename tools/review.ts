import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runAgent } from "../core/runner.js";
import { registerTaskAgentTool } from "./delegate.js";

/** Optional independent review; no plan mutations or automatic execution. */
export function registerReviewTool(pi: ExtensionAPI, run = runAgent): void {
	registerTaskAgentTool(pi, "reviewer", run);
}
