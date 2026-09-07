/** User-owned output conventions. Do not weaken these when changing orchestration. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = [path.resolve(here, ".."), path.resolve(here, "../..")]
	.find((candidate) => fs.existsSync(path.join(candidate, "skills"))) ?? path.resolve(here, "..");
export const FIGURE_STANDARDS_PATH = path.join(root, "skills/visualization/shared/figure-standards.md");

export const SCIENTIST_CONVENTIONS = `

<scientist-conventions>
These are the user's delivery conventions, not workarounds for model limitations.
Preserve them unless the user explicitly requests a different convention.

- Use the user's established/confirmed analysis parent directory. For a new analysis
  whose output location has not been confirmed, obtain it before writing deliverables;
  do not repeatedly ask for an already explicit directory.
- Analysis outputs live in sibling <NN>_ModuleName/ directories: scripts/stages/ for
  numbered scripts, scripts/config/ for YAML configs, scripts/utils/ for utilities,
  results/data/, results/tables/, results/plots/ for data, tables and final figures.
  Never put analysis outputs in Task/. Do not create per-module README.md, logs/
  directories or 99_Report/. Preserve prior modules; follow-ups use the next free NN.
- A persistent plan, when useful, lives at Task/TaskN-YYYYMMDD.md. The plan is optional;
  the output layout is not. Do not create empty scaffolding unrelated to the task.
- Long-running analysis uses the tmux-runner wrapper, with logs/status under
  <Module>/tmux/ and append-only manifest.jsonl. This applies equally to the main
  agent and optional workers. Quick commands can run directly.
- Final figure quality follows this single source of truth:
  ${FIGURE_STANDARDS_PATH}
  Read it when producing/reviewing figures. Preserve its exact palette, fonts,
  labels and layout: PNG (>=300 DPI) AND PDF, no JPEG. Exploratory plots go to
  project-root tmp/, not results/plots/.
- For plot-ready standalone tables and supported plot types, use the visualization
  skill's R path with theme_elegant(base_size=9) and get_palette_values(); otherwise
  Python is allowed but must satisfy the same figure standards.
- Formal reports are requested explicitly, live at Report/<TaskID>-<topic>-<YYYYMMDD>.html,
  and are self-contained Chinese HTML with embedded images, methods/rationale,
  conclusions, figure interpretation and reproduction index. Without a Task, use
  a descriptive topic in place of TaskID; do not invent a plan just for naming.
- Publication requests use Publication/: one reproducible notebook per figure,
  relative data paths, one image (PDF + PNG) per notebook, no panel assembly or
  large embedded/copied datasets. Execute from a clean kernel to verify reproduction.
- Never fabricate or substitute simulated/mock data for an analysis, missing inputs
  or failed retrieval. Report the missing evidence instead. Do not commit or push
  without the user's request.
</scientist-conventions>
`;

export function injectScientistConventions(prompt: string): string {
	return prompt.includes("<scientist-conventions>") ? prompt : prompt + SCIENTIST_CONVENTIONS;
}
