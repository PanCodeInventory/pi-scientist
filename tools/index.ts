import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerImplementTool } from "./implement.js";
import { registerLogsTool } from "./logs.js";
import { registerPubmedTool } from "./pubmed.js";
import { registerReviewTool } from "./review.js";
import { registerScoutTool } from "./scout.js";

export function registerScientistWorkflowTools(pi: ExtensionAPI): void {
	registerScoutTool(pi);
	registerPubmedTool(pi);
	registerImplementTool(pi);
	registerReviewTool(pi);
	registerLogsTool(pi);
}
