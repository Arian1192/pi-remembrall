import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";

export const EXTENSION_NAME = "pi-remembrall";
export const CURRENT_STORE_VERSION = 1;

export const MEMORY_TYPES = Object.freeze([
	"architecture",
	"decision",
	"bugfix",
	"discovery",
	"pattern",
	"preference",
	"session_summary",
]);

export const MEMORY_SCOPES = Object.freeze(["branch-local", "project", "personal"]);
export const MUTABLE_TYPES = Object.freeze(["architecture", "decision", "preference", "pattern"]);
export const HISTORICAL_TYPES = Object.freeze(["bugfix", "discovery", "session_summary"]);

const TYPE_PRIORITY = Object.freeze({
	decision: 70,
	architecture: 65,
	preference: 60,
	bugfix: 50,
	discovery: 40,
	pattern: 35,
	session_summary: 20,
});

export function defaultDataDir() {
	return process.env.PI_REMEMBRALL_DIR || join(homedir(), ".pi", "agent", "pi-remembrall");
}

export function stripPrivateTags(value) {
	return String(value ?? "").replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]").trim();
}

export function normalizeTopicKey(value) {
	const text = stripPrivateTags(value ?? "").toLowerCase();
	return text
		.replace(/[^a-z0-9/_ -]+/g, "")
		.replace(/[ _]+/g, "-")
		.replace(/\/{2,}/g, "/")
		.replace(/-+/g, "-")
		.replace(/^[-/]+|[-/]+$/g, "") || undefined;
}

export function isMemoryType(value) {
	return MEMORY_TYPES.includes(value);
}

export function isMemoryScope(value) {
	return MEMORY_SCOPES.includes(value);
}

export function isMutableType(type) {
	return MUTABLE_TYPES.includes(type);
}

export function isHistoricalType(type) {
	return HISTORICAL_TYPES.includes(type);
}

export function validateMemoryInput(input) {
	const errors = [];
	const type = input?.type;
	const scope = input?.scope ?? "project";
	const title = stripPrivateTags(input?.title);
	const content = stripPrivateTags(input?.content);

	if (!title) errors.push("title is required");
	if (!content) errors.push("content is required");
	if (!isMemoryType(type)) errors.push(`type must be one of: ${MEMORY_TYPES.join(", ")}`);
	if (!isMemoryScope(scope)) errors.push(`scope must be one of: ${MEMORY_SCOPES.join(", ")}`);

	if (errors.length > 0) {
		const error = new Error(errors.join("; "));
		error.errors = errors;
		throw error;
	}

	return {
		title,
		type,
		content,
		scope,
		topicKey: normalizeTopicKey(input?.topicKey),
	};
}

export function tokenize(value) {
	return stripPrivateTags(value)
		.toLowerCase()
		.split(/[^a-z0-9_/-]+/g)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2);
}

function hashMemory(record) {
	return createHash("sha256")
		.update([record.scope, record.type, record.topicKey ?? "", record.title, record.content].join("\u0000"))
		.digest("hex")
		.slice(0, 16);
}

function nowIso() {
	return new Date().toISOString();
}

function createId() {
	return `mem_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export function branchPathFromEntries(entries = []) {
	return entries.map((entry) => entry?.id).filter(Boolean);
}

export function extractTextFromMessage(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (part?.type === "text") return part.text ?? "";
			if (part?.type === "toolCall") return `Tool ${part.name ?? "unknown"} called`;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

export function summarizeBranchEntries(entries = [], maxChars = 2200) {
	const sections = [];
	for (const entry of entries) {
		if (entry?.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = stripPrivateTags(extractTextFromMessage(entry.message));
		if (!text) continue;
		sections.push(`${role}: ${text}`);
	}
	const joined = sections.slice(-12).join("\n\n");
	if (!joined) return "Session had no summarizable user or assistant text.";
	return joined.length > maxChars ? `${joined.slice(0, maxChars)}...` : joined;
}

function lastTextByRole(entries = [], roleName) {
	for (const entry of [...entries].reverse()) {
		if (entry?.type !== "message" || entry.message?.role !== roleName) continue;
		const text = stripPrivateTags(extractTextFromMessage(entry.message));
		if (text) return text;
	}
	return "";
}

export function extractFileReferences(text) {
	const matches = new Set();
	const pattern = /(?:^|[\s`'"(])(@?[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs|json|md|yaml|yml|go|py|rs|css|html|sh|toml))(?:$|[\s`'"),.:;])/g;
	let match;
	while ((match = pattern.exec(String(text ?? ""))) !== null) {
		matches.add(match[1].replace(/^@/, ""));
	}
	return [...matches].slice(0, 12);
}

export function formatWorkResume(entries = [], options = {}) {
	const recentContext = options.recentText || summarizeBranchEntries(entries);
	const lastUser = lastTextByRole(entries, "user");
	const lastAssistant = lastTextByRole(entries, "assistant");
	const checkpoint = options.checkpointRecord;
	const trigger = options.trigger || "memory refresh";
	const goal = stripPrivateTags(options.goal || lastUser || checkpoint?.title || "Continue current task.");
	const completed = checkpoint
		? `Saved ${checkpoint.type} memory: ${checkpoint.title}`
		: stripPrivateTags(options.completed || "Captured recent work state for continuation.");
	const changes = stripPrivateTags(
		options.changes ||
			(lastAssistant ? lastAssistant.slice(0, 900) : recentContext.slice(0, 900)) ||
			"No detailed changes detected.",
	);
	const nextSteps = stripPrivateTags(options.nextSteps || "Continue from this checkpoint using the saved memories and current branch context.");
	const openQuestions = stripPrivateTags(options.openQuestions || "None detected.");
	const files = extractFileReferences(`${recentContext}\n${checkpoint?.content ?? ""}`);
	const fileLines = files.length > 0 ? files.map((file) => `- ${file}`).join("\n") : "- None detected";

	return [
		"## Goal",
		goal,
		"",
		"## Completed",
		completed,
		"",
		"## Changes",
		changes,
		"",
		"## Open Questions",
		openQuestions,
		"",
		"## Next Steps",
		nextSteps,
		"",
		"## Relevant Files",
		fileLines,
		"",
		"## Trigger",
		trigger,
	].join("\n");
}

function mutableTopicKeyFor(input) {
	if (!input.topicKey || !isMutableType(input.type)) return undefined;
	return `${input.scope}:${input.topicKey}`;
}

export class MemoryStore {
	constructor(options = {}) {
		this.dataDir = options.dataDir || defaultDataDir();
		this.journalPath = options.journalPath || join(this.dataDir, "memories.v1.jsonl");
		this.cachePath = options.cachePath || join(this.dataDir, "cache.v1.json");
		this.records = new Map();
		this.mutationQueue = Promise.resolve();
		this.initialized = false;
	}

	async init() {
		await mkdir(this.dataDir, { recursive: true });
		await this.loadCache();
		if (this.records.size === 0 && existsSync(this.journalPath)) {
			await this.rebuildFromJournal();
		}
		this.initialized = true;
	}

	async loadCache() {
		try {
			const raw = await readFile(this.cachePath, "utf8");
			const parsed = JSON.parse(raw);
			if (parsed?.version !== CURRENT_STORE_VERSION || !Array.isArray(parsed.records)) return;
			this.records = new Map(parsed.records.map((record) => [record.id, record]));
		} catch {
			this.records = new Map();
		}
	}

	async rebuildFromJournal() {
		this.records = new Map();
		try {
			const raw = await readFile(this.journalPath, "utf8");
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				const event = JSON.parse(line);
				if (event?.event === "save" && event.record?.id) {
					this.records.set(event.record.id, event.record);
				}
			}
			await this.writeCache();
		} catch {
			await this.writeCache();
		}
	}

	async writeCache() {
		const payload = {
			version: CURRENT_STORE_VERSION,
			updatedAt: nowIso(),
			records: [...this.records.values()],
		};
		await mkdir(dirname(this.cachePath), { recursive: true });
		await writeFile(this.cachePath, JSON.stringify(payload, null, 2), "utf8");
	}

	async appendJournal(event) {
		await mkdir(dirname(this.journalPath), { recursive: true });
		await appendFile(this.journalPath, `${JSON.stringify(event)}\n`, "utf8");
	}

	async withMutation(fn) {
		const run = this.mutationQueue.then(fn, fn);
		this.mutationQueue = run.catch(() => undefined);
		return run;
	}

	async saveMemory(input, metadata = {}) {
		if (!this.initialized) await this.init();
		return this.withMutation(async () => {
			const clean = validateMemoryInput(input);
			const currentBranchPath = metadata.branchPath ?? [];
			const mutableKey = mutableTopicKeyFor(clean);
			const existing = mutableKey
				? [...this.records.values()].find((record) => record.mutableKey === mutableKey)
				: undefined;
			const timestamp = nowIso();

			const record = existing
				? {
						...existing,
						title: clean.title,
						type: clean.type,
						content: clean.content,
						scope: clean.scope,
						topicKey: clean.topicKey,
						mutableKey,
						updatedAt: timestamp,
						revision: (existing.revision ?? 1) + 1,
						hash: hashMemory(clean),
						lastSessionFile: metadata.sessionFile,
						lastLeafId: metadata.leafId,
						branchPath: currentBranchPath,
					}
				: {
						id: createId(),
						version: CURRENT_STORE_VERSION,
						title: clean.title,
						type: clean.type,
						content: clean.content,
						scope: clean.scope,
						topicKey: clean.topicKey,
						mutableKey,
						createdAt: timestamp,
						updatedAt: timestamp,
						revision: 1,
						hash: hashMemory(clean),
						createdSessionFile: metadata.sessionFile,
						lastSessionFile: metadata.sessionFile,
						lastLeafId: metadata.leafId,
						branchPath: currentBranchPath,
					};

			this.records.set(record.id, record);
			await this.appendJournal({ version: CURRENT_STORE_VERSION, event: "save", savedAt: timestamp, record });
			await this.writeCache();
			return { record, updated: Boolean(existing), historical: isHistoricalType(record.type) };
		});
	}

	recall(query, options = {}) {
		const tokens = tokenize(query);
		const scopeFilter = options.scope;
		const typeFilter = options.type;
		const currentBranchPath = new Set(options.branchPath ?? []);
		const explicitScope = Boolean(scopeFilter);
		const now = Date.now();

		const results = [...this.records.values()]
			.filter((record) => !scopeFilter || record.scope === scopeFilter)
			.filter((record) => !typeFilter || record.type === typeFilter)
			.map((record) => {
				const haystack = tokenize([record.title, record.type, record.scope, record.topicKey, record.content].filter(Boolean).join(" "));
				const hayset = new Set(haystack);
				const lexical = tokens.length === 0 ? 1 : tokens.reduce((score, token) => score + (hayset.has(token) ? 12 : haystack.some((h) => h.includes(token)) ? 4 : 0), 0);
				const branchOverlap = (record.branchPath ?? []).filter((id) => currentBranchPath.has(id)).length;
				const branchBoost = record.scope === "branch-local" ? 30 + Math.min(branchOverlap * 4, 30) : Math.min(branchOverlap * 2, 15);
				const scopeBoost = explicitScope ? 10 : record.scope === "project" ? 8 : record.scope === "personal" ? 6 : 0;
				const typeBoost = TYPE_PRIORITY[record.type] ?? 0;
				const ageMs = Math.max(0, now - Date.parse(record.updatedAt ?? record.createdAt ?? new Date(0).toISOString()));
				const recency = Math.max(0, 20 - ageMs / 86_400_000);
				return { record, lexical, score: lexical + branchBoost + scopeBoost + typeBoost + recency };
			})
			.filter((result) => tokens.length === 0 || result.lexical > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, options.limit ?? 5);

		return results;
	}

	async importRecords(records = []) {
		if (!this.initialized) await this.init();
		let changed = false;
		for (const record of records) {
			if (!record?.id) continue;
			const existing = this.records.get(record.id);
			if (!existing || String(record.updatedAt ?? "") > String(existing.updatedAt ?? "")) {
				this.records.set(record.id, record);
				changed = true;
			}
		}
		if (changed) await this.writeCache();
		return changed;
	}

	allRecords() {
		return [...this.records.values()];
	}
}

export function formatRecallResults(results) {
	if (!results.length) return "No matching memories found.";
	return results
		.map(({ record, score }, index) => {
			const topic = record.topicKey ? ` topic=${record.topicKey}` : "";
			const revision = record.revision > 1 ? ` rev=${record.revision}` : "";
			return `${index + 1}. [${record.type}/${record.scope}] ${record.title} (id=${record.id}${topic}${revision}, score=${score.toFixed(1)})\n${record.content}`;
		})
		.join("\n\n");
}

export function formatMemoryCapsule(results, options = {}) {
	const maxItems = options.maxItems ?? 4;
	const maxChars = options.maxChars ?? 1200;
	const lines = [];
	for (const { record } of results.slice(0, maxItems)) {
		const topic = record.topicKey ? `${record.topicKey}: ` : "";
		const line = `- [${record.type}/${record.scope}] ${topic}${record.title} — ${record.content.replace(/\s+/g, " ")}`;
		lines.push(line.length > 260 ? `${line.slice(0, 257)}...` : line);
	}
	if (!lines.length) return "";
	const capsule = `PI REMEMBRALL MEMORY CAPSULE\n${lines.join("\n")}`;
	return capsule.length > maxChars ? `${capsule.slice(0, maxChars - 3)}...` : capsule;
}

export function memoryRecordForSessionSummary(summary, metadata = {}) {
	return {
		title: metadata.title || "Session summary",
		type: "session_summary",
		content: summary,
		scope: metadata.scope || "branch-local",
		topicKey: metadata.topicKey,
	};
}
