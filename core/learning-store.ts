/** Project-local topic skills. Independent atomic publications, no model writes. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";

export const HOME = ".sci/learning";
export const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const textResult = (text: string) => ({ content: [{ type: "text" as const, text }], details: undefined });
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const TopicSchema = Type.String({ pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", minLength: 1, maxLength: 40 });
const ChangeSchema = Type.Object({
    oldText: Type.String({ maxLength: 8000 }),
    newText: Type.String({ maxLength: 8000 }),
    reason: text(2000),
    disposition: Type.Union([Type.Literal("eligible"), Type.Literal("hold")]),
    changesScientificDecision: Type.Boolean(),
    evidence: Type.Array(Type.Object({ path: text(500), quote: text(2000) }, { additionalProperties: false }), { minItems: 1, maxItems: 8 }),
}, { additionalProperties: false });
export const ProposalSchema = Type.Object({
    summary: text(2000),
    skills: Type.Array(Type.Object({
        topic: TopicSchema,
        description: text(1024),
        changes: Type.Array(ChangeSchema, { minItems: 1, maxItems: 8 }),
    }, { additionalProperties: false }), { maxItems: 8 }),
}, { additionalProperties: false });
export type Proposal = Static<typeof ProposalSchema>;
export interface Config { enabled: boolean }
export interface SkillSnapshot { topic: string; path: string; description: string; content: string; body: string; writable: boolean }
export interface SkillPublication { topic: string; status: "published" | "no_change" | "hold" | "failed"; error?: string; target?: string; baseline?: string | null; next?: string }
export interface Evidence { path: string; digest: string; content: string }

/** Reject symlinks in managed paths, including existing parents, rather than trusting prefix checks. */
export function managed(root: string, relative: string): string {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === "..")) throw new Error("Unsafe managed path");
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error("Path outside project");
    let current = root;
    for (const part of path.relative(root, target).split(path.sep)) {
        current = path.join(current, part);
        if (fs.existsSync(current) || (() => { try { return fs.lstatSync(current).isSymbolicLink(); } catch { return false; } })()) {
            if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink not allowed: ${current}`);
        }
    }
    return target;
}
export function readManaged(root: string, relative: string): string | null {
    const file = managed(root, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
export function atomic(root: string, relative: string, content: string) {
    const file = managed(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temp, content, { flag: "wx", mode: 0o600 });
        managed(root, relative);
        fs.renameSync(temp, file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
// Prefixes are used only to recognize old files/configs/publication records, never for new names.
export function legacyNamespace(root: string) { return `sci-project-${hash(root).slice(0, 10)}`; }
export function legacySkillPath(root: string) { return `.pi/skills/${legacyNamespace(root)}/SKILL.md`; }
export function skillPath(_root: string, topic: string) {
    if (!Check(TopicSchema, topic) || topic === "legacy") throw new Error("Invalid or reserved skill topic");
    return `.pi/skills/${topic}/SKILL.md`;
}
export function config(root: string): Config {
    const raw = readManaged(root, `${HOME}/config.json`);
    if (raw === null) return { enabled: true }; // Default on; explicit project opt-out still wins.
    const value = JSON.parse(raw);
    // Accept old configs without changing their files. New configs have no path-derived namespace.
    if (!value || typeof value.enabled !== "boolean" || (value.namespace !== undefined && value.namespace !== legacyNamespace(root)) || (value.skill !== undefined && value.skill !== legacySkillPath(root)))
        throw new Error("Invalid learning config; inspect/remove .sci/learning/config.json before re-enabling at the intended root");
    return { enabled: value.enabled };
}
export function header(root: string, topic: string, description: string): string {
    const name = path.basename(path.dirname(skillPath(root, topic)));
    return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  scientist-learning: "2"\n---\n\n# ${topic}\n\nPaths below are relative to the analysis project root (../../.. from this skill directory), not to this skill directory.\n\n`;
}
export function snapshotSkills(root: string): SkillSnapshot[] {
    const dir = managed(root, ".pi/skills");
    const prefix = legacyNamespace(root) + "-";
    const catalog: SkillSnapshot[] = [];
    if (fs.existsSync(dir)) for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue; // Do not follow linked skills or claim their ownership.
        const name = entry.name;
        const oldName = name.startsWith(prefix);
        const topic = oldName ? name.slice(prefix.length) : name;
        if (!Check(TopicSchema, topic) || topic === "legacy" || name === legacyNamespace(root)) continue;
        const file = `.pi/skills/${name}/SKILL.md`, content = readManaged(root, file);
        if (content === null) continue;
        let description = "Existing non-managed skill; read-only, choose another topic or request manual reconciliation.";
        let writable = false, body = content;
        try {
            const parsed = JSON.parse(content.match(/^description: (.+)$/m)?.[1] ?? "null");
            if (!oldName && typeof parsed === "string" && parsed.trim() && parsed.length <= 1024 && content.startsWith(header(root, topic, parsed))) {
                description = parsed; writable = true; body = content.slice(header(root, topic, parsed).length);
            }
        } catch { /* A human-authored/corrupted file is visible but not automatically adopted. */ }
        if (oldName) description = `Old prefixed skill for ${topic} (read-only). Rename its directory and frontmatter name to ${topic} after checking for collisions; do not duplicate it.`;
        catalog.push({ topic, path: file, content, body, description, writable });
    }
    for (const skill of catalog) if (catalog.filter(s => s.topic === skill.topic).length > 1) {
        skill.writable = false;
        skill.description += " Conflicting short/prefixed paths exist; reconcile manually before updating this topic.";
    }
    const legacy = readManaged(root, legacySkillPath(root));
    if (legacy !== null) catalog.push({ topic: "legacy", path: legacySkillPath(root), description: "Legacy mixed project skill (read-only). Consult before adding overlapping topical knowledge; manual splitting only.", content: legacy, body: legacy, writable: false });
    return catalog;
}
export function setEnabled(root: string, enabled: boolean) {
    config(root); // Validate old configuration before replacing it; manual skills remain read-only.
    atomic(root, `${HOME}/config.json`, JSON.stringify({ enabled }, null, 2));
}

/** Small, text-only, project-scoped reader. No shell, directory crawling, or arbitrary tool forwarding. */
export function readEvidence(root: string, relative: string, observed: Map<string, Evidence>): Evidence {
    if (observed.size >= 16 && !observed.has(relative)) throw new Error("Evidence budget: at most 16 files");
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === ".." || p === ".git" || p === ".pi" || p === ".sci" || p === ".env" || p === ".ssh"))
        throw new Error("Evidence must be a project-relative non-private artifact path");
    const resolved = fs.realpathSync(path.join(root, relative));
    if (!resolved.startsWith(root + path.sep)) throw new Error("Evidence outside project");
    if (path.relative(root, resolved).split(path.sep).some(p => [".git", ".pi", ".sci", ".env", ".ssh"].includes(p))) throw new Error("Private evidence path");
    const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let content: string;
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 128 * 1024) throw new Error("Evidence must be a text file <=128 KiB; provide a small existing validation artifact");
        content = fs.readFileSync(fd, "utf8");
        if (content.includes("\0")) throw new Error("Binary evidence is not supported");
    } finally { fs.closeSync(fd); }
    const value = { path: relative, digest: hash(content), content };
    const prior = observed.get(relative);
    if (prior && prior.digest !== value.digest) throw new Error("Evidence changed during reflection");
    observed.set(relative, value);
    return value;
}

export function parseProposal(raw: string): Proposal {
    const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1"));
    if (!Check(ProposalSchema, value)) throw new Error("Invalid reflection proposal schema");
    return value;
}

/** Patches are all matched against the original body. Empty oldText means append. */
export function applyChanges(body: string, proposal: { changes: Static<typeof ChangeSchema>[] }): string {
    const replacements: { start: number; end: number; text: string }[] = [];
    const additions: string[] = [];
    for (const change of proposal.changes) {
        if (!change.oldText) { if (change.newText && !body.includes(change.newText) && !additions.includes(change.newText)) additions.push(change.newText); continue; }
        const start = body.indexOf(change.oldText);
        if (start < 0 || body.indexOf(change.oldText, start + 1) >= 0) throw new Error("Patch must match one unique original passage");
        const end = start + change.oldText.length;
        if (replacements.some(r => start < r.end && end > r.start)) throw new Error("Overlapping patches");
        replacements.push({ start, end, text: change.newText });
    }
    for (const r of replacements.sort((a, b) => b.start - a.start)) body = body.slice(0, r.start) + r.text + body.slice(r.end);
    if (additions.length) body += "\n" + additions.join("\n\n") + "\n";
    if (body.length > 24000) throw new Error("Skill budget exceeded; consolidate instead of appending");
    return body;
}

/** Each topic is independent: all-or-hold within a skill, no cross-skill transaction or automatic moves. */
export function publish(root: string, run: string, catalog: SkillSnapshot[], proposal: Proposal, observed: Map<string, Evidence>, readTopics = new Set<string>()) {
    if (!Check(ProposalSchema, proposal)) throw new Error("Invalid proposal");
    if (new Set(proposal.skills.map(s => s.topic)).size !== proposal.skills.length) throw new Error("Duplicate topics in proposal");
    if (!proposal.skills.length) return "no_change";
    const records: SkillPublication[] = [];
    const save = () => atomic(root, `${run}/publication.json`, JSON.stringify({ skills: records }, null, 2));
    const lock = managed(root, `${HOME}/publish.lock`);
    const fd = fs.openSync(lock, "wx", 0o600);
    try {
        if (!config(root).enabled) throw new Error("Learning disabled before publication");
        for (const skill of proposal.skills) {
            const record: SkillPublication = { topic: skill.topic, status: "failed" };
            records.push(record);
            try {
                if (skill.changes.some(c => c.disposition !== "eligible" || c.changesScientificDecision)) {
                    record.status = "hold"; continue;
                }
                const target = skillPath(root, skill.topic);
                const prior = catalog.find(s => s.topic === skill.topic);
                if (prior && (!prior.writable || !readTopics.has(skill.topic))) throw new Error("Existing skill must be managed and read via skill_read before editing");
                const baseline = prior?.content ?? null;
                const current = readManaged(root, target);
                if (current !== baseline) throw new Error("Skill baseline changed; reflect again against the new version");
                for (const change of skill.changes) for (const evidence of change.evidence) {
                    const seen = observed.get(evidence.path);
                    if (!seen || !seen.content.includes(evidence.quote)) throw new Error("Evidence quote was not read or does not match");
                    const fresh = readEvidence(root, evidence.path, new Map());
                    if (fresh.digest !== seen.digest) throw new Error("Evidence changed before publication");
                }
                if (!skill.description.trim()) throw new Error("Skill description must explain its analysis type and trigger conditions");
                const prefix = header(root, skill.topic, skill.description);
                const next = prefix + applyChanges(prior?.body ?? "", skill);
                if (next === baseline || (baseline === null && next === prefix)) { record.status = "no_change"; continue; }
                Object.assign(record, { target, baseline, next, error: "Prepared; verify target content if interrupted before completion" });
                save(); // Before/after images precede this topic's atomic rename; other topics are independent.
                atomic(root, target, next);
                record.status = "published"; delete record.error;
            } catch (error) { record.error = String(error); }
            finally { save(); }
        }
        const changed = records.some(r => r.status === "published");
        const blocked = records.some(r => r.status === "hold" || r.status === "failed");
        return changed ? (blocked ? "partial" : "published") : records.some(r => r.status === "failed") ? "failed" : blocked ? "hold" : "no_change";
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

export function rollback(root: string, runId: string, topic?: string) {
    if (!/^[a-f0-9]{24}$/.test(runId)) throw new Error("Invalid run id");
    const run = `${HOME}/runs/${runId}`;
    const raw = readManaged(root, `${run}/publication.json`);
    if (!raw) throw new Error("No publication record");
    const ledger = JSON.parse(raw);
    // Preserve rollback for v1 publications without migrating or rewriting their files.
    const records = Array.isArray(ledger.skills) ? ledger.skills : [{ ...ledger, topic: "legacy" }];
    const candidates = records.filter((r: SkillPublication) => typeof r.next === "string");
    const record = topic ? candidates.find((r: SkillPublication) => r.topic === topic) : candidates.length === 1 ? candidates[0] : undefined;
    if (!record) throw new Error("Specify one published topic: /sci-learn rollback <run-id> <topic>");
    const shortTarget = record.topic === "legacy" ? legacySkillPath(root) : skillPath(root, record.topic);
    const oldTarget = record.topic === "legacy" ? legacySkillPath(root) : `.pi/skills/${legacyNamespace(root)}-${record.topic}/SKILL.md`;
    if (![shortTarget, oldTarget].includes(record.target) || typeof record.next !== "string" || !(record.baseline === null || typeof record.baseline === "string")) throw new Error("Invalid publication record");
    const target = record.target;
    const lock = managed(root, `${HOME}/publish.lock`);
    const fd = fs.openSync(lock, "wx", 0o600);
    try {
        if (readManaged(root, target) !== record.next) throw new Error("Skill has newer/manual changes; refusing rollback");
        if (record.baseline === null) fs.unlinkSync(managed(root, target));
        else atomic(root, target, record.baseline);
        atomic(root, `${run}/rollback-${record.topic}.json`, JSON.stringify({ topic: record.topic, at: new Date().toISOString() }));
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
