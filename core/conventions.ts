/** User-owned coding and output conventions. Do not weaken these when changing orchestration. */

export const SCIENTIST_CONVENTIONS = `

<scientist-conventions>
These are the user's coding and delivery conventions, not workarounds for model limitations.
Preserve them unless the user explicitly requests a different convention.
These are defaults, not overrides of explicit project instructions in AGENTS.md.
Within the applicable instruction hierarchy, follow the current user request, then
explicit project conventions, then these defaults. Surface unresolved conflicts;
do not silently choose a rule or infer permission to commit/push.

- Use the user's established/confirmed analysis parent directory. For a new analysis
  whose output location has not been confirmed, obtain it before writing deliverables;
  do not repeatedly ask for an already explicit directory.
- Analysis outputs live in sibling <NN>_ModuleName/ directories: scripts/stages/ for
  numbered scripts, scripts/config/ for YAML configs, scripts/utils/ for utilities,
  results/data/, results/tables/, results/plots/ for data, tables and final figures.
  Never put analysis outputs in Task/. Do not create per-module README.md, logs/
  directories or 99_Report/. Preserve prior modules; follow-ups use the next free NN.
- Write analysis scripts and notebooks in linear imperative research scripting style,
  closer to a Stata do-file or traditional research script than an engineered Python
  project. Execute naturally from top to bottom, with visible intermediate variables
  and clear steps so the user can understand and change the data processing line by line.
- Prefer basic, direct commands and built-in data operations. Minimize function
  wrappers, abstraction layers, loops and speculative defensive code. Add a helper
  or loop only when it materially clarifies necessary repetition; do not introduce
  classes, generic pipelines or utility modules merely for architectural neatness.
  Keep checks needed for scientific correctness and data integrity. Verify configured
  module/input paths after renames; declare table ID columns and check uniqueness/alignment.
  Avoid script names that shadow the standard library (e.g. inspect.py).
- Keep code compact: simple calls, variable lists, column selections, merge, rename
  and read_excel operations should normally stay on one line. Allow long single
  lines when the logic is simple. Wrap only when a line is clearly too long, contains
  nested logic or becomes hard to understand; do not split simple commands merely
  for visual formatting or impose Black/PEP 8-style forced multiline expansion.
  Prioritize readability, editability and clear steps over engineering conventions
  and abstraction design. These preferences also apply to code examples in responses.
- A persistent plan, when useful, lives at Task/TaskN-YYYYMMDD.md. The plan is optional;
  the output layout is not. Do not create empty scaffolding unrelated to the task.
- Long-running analysis uses the tmux-runner wrapper, with logs/status under
  <Module>/tmux/ and append-only manifest.jsonl. This applies equally to the main
  agent and collaborators. Quick commands can run directly. Launch success is not
  completion: gate dependent steps on this run's exit status and validated artifacts.
  Write large/final outputs to same-directory temporary files, validate, then rename;
  never overwrite the only good copy in place.
- All deliverable figures must be produced via the visualization skill; do not
  hand-roll plotting code outside it — its internal standards are the single
  source of truth. Quick exploratory plots are exempt and go to project-root
  tmp/, not results/plots/.
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
