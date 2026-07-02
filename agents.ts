/**
 * Agent discovery and configuration for the Scientist workflow system.
 *
 * Agent markdown files live in this extension's own agents/ directory.
 * Each file has YAML frontmatter with name, description, tools, model, and
 * a markdown body that serves as the agent's system prompt.
 *
 * Unlike superpower which discovers from user/project dirs, scientist
 * bundles its own specialized bioinformatics agents.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
}

function loadAgentsFromDir(dir: string): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source: "user",
			filePath,
		});
	}

	return agents;
}

/**
 * Discover scientist agents from this extension's bundled agents/ directory.
 * No project-scope discovery — all agents are self-contained.
 */
export function discoverScientists(): AgentDiscoveryResult {
	const dir = path.join(__dirname, "agents");
	return { agents: loadAgentsFromDir(dir) };
}
