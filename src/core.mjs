import { mkdir, readFile, writeFile, appendFile, unlink } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";

export const EXTENSION_NAME = "pi-remembrall";
export const CURRENT_STORE_VERSION = 1;
export const DOCUMENT_SCHEMA_VERSION = 1;

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

export const FRONT_MATTER_FIELDS = Object.freeze([
	"schema_version",
	"id",
	"title",
	"type",
	"scope",
	"topic_key",
	"status",
	"tags",
	"relations",
	"created_at",
	"updated_at",
	"revision",
	"hash",
	"branch_path",
	"created_session_file",
	"last_session_file",
	"last_leaf_id",
]);

export function defaultDataDir() {
	return process.env.PI_REMEMBRALL_DIR || join(homedir(), ".pi", "agent", "pi-remembrall");
}

export function stripPrivateTags(value) {
	return String(value ?? "").replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]").trim();
}

export function normalizeTopicKey(value) {
	const text = stripPrivateTags(value ?? "").toLowerCase();
	return (
		text
			.replace(/[^a-z0-9/_ -]+/g, "")
			.replace(/[ _]+/g, "-")
			.replace(/\/{2,}/g, "/")
			.replace(/-+/g, "-")
			.replace(/^[-/]+|[-/]+$/g, "") || undefined
	);
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

export function formatTimestamp(date = new Date()) {
	const value = date instanceof Date ? date : new Date(date);
	const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
	const year = value.getFullYear();
	const month = pad(value.getMonth() + 1);
	const day = pad(value.getDate());
	const hours = pad(value.getHours());
	const minutes = pad(value.getMinutes());
	const seconds = pad(value.getSeconds());
	const offsetMinutes = -value.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
	const offsetRemainder = pad(Math.abs(offsetMinutes) % 60);
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetRemainder}`;
}

function createId() {
	return `mem_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export function slugify(value, maxLength = 48) {
	const normalized = stripPrivateTags(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return (normalized || "entry").slice(0, maxLength).replace(/-+$/g, "") || "entry";
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

function normalizeForgetReason(value) {
	const text = stripPrivateTags(value ?? "");
	return text || undefined;
}

function toForgetTargetIds(input) {
	if (Array.isArray(input?.targetIds)) return input.targetIds.filter(Boolean);
	if (input?.id) return [input.id].filter(Boolean);
	return [];
}

function documentStatusFor(record, forgottenIds) {
	return forgottenIds.has(record.id) || record.status === "forgotten" ? "forgotten" : "active";
}

function applyEventToState(state, event) {
	if (!event || typeof event !== "object") return false;
	if (event.event === "save" && event.record?.id) {
		const existing = state.records.get(event.record.id);
		const incomingTime = String(event.record.updatedAt ?? event.record.createdAt ?? "");
		const existingTime = String(existing?.updatedAt ?? existing?.createdAt ?? "");
		if (!existing || incomingTime >= existingTime) {
			state.records.set(event.record.id, { ...existing, ...event.record, status: event.record.status ?? existing?.status ?? "active" });
			return true;
		}
		return false;
	}
	if (event.event === "forget") {
		let changed = false;
		for (const id of toForgetTargetIds(event)) {
			if (!state.forgottenIds.has(id)) {
				state.forgottenIds.add(id);
				const record = state.records.get(id);
				if (record) state.records.set(id, { ...record, status: "forgotten" });
				changed = true;
			}
		}
		return changed;
	}
	return false;
}

function yamlScalar(value) {
	if (value === undefined || value === null) return "null";
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	return JSON.stringify(String(value));
}

function yamlValue(value) {
	if (Array.isArray(value)) return `[${value.map((item) => yamlScalar(item)).join(", ")}]`;
	return yamlScalar(value);
}

function parseYamlValue(raw) {
	const value = String(raw ?? "").trim();
	if (!value || value === "null") return undefined;
	if (value === "true") return true;
	if (value === "false") return false;
	if (/^-?\d+$/.test(value)) return Number(value);
	if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}")) || (value.startsWith('"') && value.endsWith('"'))) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
}

function parseFrontMatter(frontMatterText) {
	const meta = {};
	for (const rawLine of String(frontMatterText ?? "").split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separator = line.indexOf(":");
		if (separator === -1) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		meta[key] = parseYamlValue(value);
	}
	return meta;
}

function splitFrontMatterDocument(text) {
	const normalized = String(text ?? "").replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) {
		return { frontMatter: {}, body: normalized };
	}
	const end = normalized.indexOf("\n---\n", 4);
	if (end === -1) return { frontMatter: {}, body: normalized };
	return {
		frontMatter: parseFrontMatter(normalized.slice(4, end)),
		body: normalized.slice(end + 5),
	};
}

function normalizeRecord(record) {
	if (!record?.id) return undefined;
	return {
		...record,
		status: record.status ?? "active",
		tags: Array.isArray(record.tags) ? record.tags.filter(Boolean) : [],
		relations: Array.isArray(record.relations) ? record.relations.filter(Boolean) : [],
		branchPath: Array.isArray(record.branchPath) ? record.branchPath.filter(Boolean) : [],
	};
}

function recordToFrontMatter(record, forgottenIds = new Set()) {
	return {
		schema_version: DOCUMENT_SCHEMA_VERSION,
		id: record.id,
		title: record.title,
		type: record.type,
		scope: record.scope,
		topic_key: record.topicKey,
		status: documentStatusFor(record, forgottenIds),
		tags: Array.isArray(record.tags) ? record.tags : [],
		relations: Array.isArray(record.relations) ? record.relations : [],
		created_at: record.createdAt,
		updated_at: record.updatedAt,
		revision: record.revision ?? 1,
		hash: record.hash,
		branch_path: Array.isArray(record.branchPath) ? record.branchPath : [],
		created_session_file: record.createdSessionFile,
		last_session_file: record.lastSessionFile,
		last_leaf_id: record.lastLeafId,
	};
}

export function serializeMemoryDocument(record, options = {}) {
	const frontMatter = recordToFrontMatter(normalizeRecord(record), options.forgottenIds ?? new Set());
	const lines = ["---"];
	for (const field of FRONT_MATTER_FIELDS) {
		if (frontMatter[field] === undefined) continue;
		lines.push(`${field}: ${yamlValue(frontMatter[field])}`);
	}
	lines.push("---", String(record.content ?? ""));
	return `${lines.join("\n")}\n`;
}

export function parseMemoryDocument(source, options = {}) {
	const { frontMatter, body } = splitFrontMatterDocument(source);
	const normalizedBody = String(body ?? "").replace(/\n$/, "");
	const record = normalizeRecord({
		id: frontMatter.id,
		title: frontMatter.title,
		type: frontMatter.type,
		scope: frontMatter.scope,
		topicKey: frontMatter.topic_key,
		status: frontMatter.status ?? "active",
		tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : [],
		relations: Array.isArray(frontMatter.relations) ? frontMatter.relations : [],
		createdAt: frontMatter.created_at,
		updatedAt: frontMatter.updated_at,
		revision: Number(frontMatter.revision ?? 1),
		hash: frontMatter.hash,
		branchPath: Array.isArray(frontMatter.branch_path) ? frontMatter.branch_path : [],
		createdSessionFile: frontMatter.created_session_file,
		lastSessionFile: frontMatter.last_session_file,
		lastLeafId: frontMatter.last_leaf_id,
		content: normalizedBody,
		docPath: options.path,
		version: CURRENT_STORE_VERSION,
		mutableKey: frontMatter.topic_key && frontMatter.scope && isMutableType(frontMatter.type) ? `${frontMatter.scope}:${frontMatter.topic_key}` : undefined,
	});
	return { frontMatter, body: normalizedBody, record };
}

export function documentDirectoryFor(scope, type, dataDir = defaultDataDir()) {
	return join(dataDir, "db", scope || "project", type || "unknown");
}

export function documentPathForRecord(record, dataDir = defaultDataDir()) {
	const dir = documentDirectoryFor(record.scope, record.type, dataDir);
	return join(dir, `${record.id}-${slugify(record.title)}.md`);
}

function enumerateMarkdownFiles(rootDir) {
	if (!existsSync(rootDir)) return [];
	const files = [];
	const stack = [rootDir];
	while (stack.length > 0) {
		const current = stack.pop();
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const fullPath = join(current, entry.name);
			if (entry.isDirectory()) stack.push(fullPath);
			else if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
		}
	}
	return files.sort();
}

function readFrontMatterHeaderSync(path) {
	const fd = openSync(path, "r");
	const chunk = Buffer.alloc(4096);
	let text = "";
	try {
		for (;;) {
			const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
			if (bytesRead <= 0) break;
			text += chunk.toString("utf8", 0, bytesRead);
			const normalized = text.replace(/\r\n/g, "\n");
			if (!normalized.startsWith("---\n")) return {};
			const end = normalized.indexOf("\n---\n", 4);
			if (end !== -1) return parseFrontMatter(normalized.slice(4, end));
			if (text.length > 128 * 1024) break;
		}
		return {};
	} finally {
		closeSync(fd);
	}
}

function loadDocumentBodySync(path) {
	return parseMemoryDocument(readFileSync(path, "utf8"), { path }).record;
}

function baseLexicalScore(tokens, header) {
	const haystack = tokenize([
		header.title,
		header.type,
		header.scope,
		header.topicKey,
		...(header.tags ?? []),
	].filter(Boolean).join(" "));
	const hayset = new Set(haystack);
	return tokens.length === 0 ? 1 : tokens.reduce((score, token) => score + (hayset.has(token) ? 12 : haystack.some((h) => h.includes(token)) ? 4 : 0), 0);
}

function finalLexicalScore(tokens, record) {
	const haystack = tokenize([record.title, record.type, record.scope, record.topicKey, record.content].filter(Boolean).join(" "));
	const hayset = new Set(haystack);
	return tokens.length === 0 ? 1 : tokens.reduce((score, token) => score + (hayset.has(token) ? 12 : haystack.some((h) => h.includes(token)) ? 4 : 0), 0);
}

function enrichScore(record, lexical, options = {}) {
	const scopeFilter = options.scope;
	const currentBranchPath = new Set(options.branchPath ?? []);
	const explicitScope = Boolean(scopeFilter);
	const now = Date.now();
	const branchOverlap = (record.branchPath ?? []).filter((id) => currentBranchPath.has(id)).length;
	const branchBoost = record.scope === "branch-local" ? 30 + Math.min(branchOverlap * 4, 30) : Math.min(branchOverlap * 2, 15);
	const scopeBoost = explicitScope ? 10 : record.scope === "project" ? 8 : record.scope === "personal" ? 6 : 0;
	const typeBoost = TYPE_PRIORITY[record.type] ?? 0;
	const ageMs = Math.max(0, now - Date.parse(record.updatedAt ?? record.createdAt ?? new Date(0).toISOString()));
	const recency = Math.max(0, 20 - ageMs / 86_400_000);
	return lexical + branchBoost + scopeBoost + typeBoost + recency;
}

export class MemoryStore {
	constructor(options = {}) {
		this.dataDir = options.dataDir || defaultDataDir();
		this.journalPath = options.journalPath || join(this.dataDir, "memories.v1.jsonl");
		this.cachePath = options.cachePath || join(this.dataDir, "cache.v1.json");
		this.documentsDir = options.documentsDir || join(this.dataDir, "db");
		this.records = new Map();
		this.forgottenIds = new Set();
		this.mutationQueue = Promise.resolve();
		this.initialized = false;
		this.debugReads = { headerReads: 0, bodyReads: 0 };
	}

	async init() {
		await mkdir(this.dataDir, { recursive: true });
		await mkdir(this.documentsDir, { recursive: true });
		await this.loadCache();
		if (this.records.size === 0 && existsSync(this.documentsDir) && enumerateMarkdownFiles(this.documentsDir).length > 0) {
			await this.rebuildFromDocuments();
		}
		if (this.records.size === 0 && this.forgottenIds.size === 0 && existsSync(this.journalPath)) {
			await this.rebuildFromJournal();
		}
		if (this.records.size > 0) await this.ensureMarkdownBackfill();
		this.initialized = true;
	}

	async loadCache() {
		try {
			const raw = await readFile(this.cachePath, "utf8");
			const parsed = JSON.parse(raw);
			if (parsed?.version !== CURRENT_STORE_VERSION || !Array.isArray(parsed.records)) return;
			this.records = new Map(parsed.records.map((record) => [record.id, normalizeRecord(record)]));
			this.forgottenIds = new Set(Array.isArray(parsed.forgottenIds) ? parsed.forgottenIds.filter(Boolean) : []);
		} catch {
			this.records = new Map();
			this.forgottenIds = new Set();
		}
	}

	async rebuildFromJournal() {
		this.records = new Map();
		this.forgottenIds = new Set();
		try {
			const raw = await readFile(this.journalPath, "utf8");
			for (const line of raw.split("\n")) {
				if (!line.trim()) continue;
				applyEventToState(this, JSON.parse(line));
			}
			await this.ensureMarkdownBackfill();
			await this.writeCache();
		} catch {
			await this.writeCache();
		}
	}

	async rebuildFromDocuments() {
		this.records = new Map();
		this.forgottenIds = new Set();
		for (const path of enumerateMarkdownFiles(this.documentsDir)) {
			const parsed = loadDocumentBodySync(path);
			if (!parsed?.id) continue;
			this.records.set(parsed.id, parsed);
			if (parsed.status === "forgotten") this.forgottenIds.add(parsed.id);
		}
		await this.writeCache();
	}

	async writeCache() {
		const payload = {
			version: CURRENT_STORE_VERSION,
			updatedAt: formatTimestamp(),
			records: [...this.records.values()].map((record) => ({ ...record, status: documentStatusFor(record, this.forgottenIds) })),
			forgottenIds: [...this.forgottenIds.values()],
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

	isForgotten(id) {
		return this.forgottenIds.has(id);
	}

	getRecord(id, options = {}) {
		const record = this.records.get(id);
		if (!record) return undefined;
		if (!options.includeForgotten && this.isForgotten(id)) return undefined;
		return { ...record, status: documentStatusFor(record, this.forgottenIds) };
	}

	allRecords(options = {}) {
		const includeForgotten = Boolean(options.includeForgotten);
		return [...this.records.values()]
			.filter((record) => includeForgotten || !this.isForgotten(record.id))
			.map((record) => ({ ...record, status: documentStatusFor(record, this.forgottenIds) }));
	}

	documentPaths(options = {}) {
		const scope = options.scope;
		const type = options.type;
		const base = scope ? join(this.documentsDir, scope) : this.documentsDir;
		if (scope && type) return enumerateMarkdownFiles(join(base, type));
		if (scope) return enumerateMarkdownFiles(base);
		if (type) {
			const files = [];
			for (const candidateScope of MEMORY_SCOPES) files.push(...enumerateMarkdownFiles(join(this.documentsDir, candidateScope, type)));
			return files;
		}
		return enumerateMarkdownFiles(this.documentsDir);
	}

	readDocumentHeader(path) {
		this.debugReads.headerReads += 1;
		const frontMatter = readFrontMatterHeaderSync(path);
		return normalizeRecord({
			id: frontMatter.id,
			title: frontMatter.title,
			type: frontMatter.type,
			scope: frontMatter.scope,
			topicKey: frontMatter.topic_key,
			status: frontMatter.status ?? "active",
			tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : [],
			relations: Array.isArray(frontMatter.relations) ? frontMatter.relations : [],
			createdAt: frontMatter.created_at,
			updatedAt: frontMatter.updated_at,
			revision: Number(frontMatter.revision ?? 1),
			hash: frontMatter.hash,
			branchPath: Array.isArray(frontMatter.branch_path) ? frontMatter.branch_path : [],
			createdSessionFile: frontMatter.created_session_file,
			lastSessionFile: frontMatter.last_session_file,
			lastLeafId: frontMatter.last_leaf_id,
			docPath: path,
			mutableKey: frontMatter.topic_key && frontMatter.scope && isMutableType(frontMatter.type) ? `${frontMatter.scope}:${frontMatter.topic_key}` : undefined,
		});
	}

	loadDocumentBody(path) {
		this.debugReads.bodyReads += 1;
		return loadDocumentBodySync(path);
	}

	async writeMarkdownDocument(record, options = {}) {
		const normalized = normalizeRecord(record);
		const nextPath = options.path || documentPathForRecord(normalized, this.dataDir);
		const oldPath = options.oldPath && options.oldPath !== nextPath ? options.oldPath : undefined;
		await mkdir(dirname(nextPath), { recursive: true });
		await writeFile(nextPath, serializeMemoryDocument({ ...normalized, docPath: nextPath }, { forgottenIds: this.forgottenIds }), "utf8");
		if (oldPath) {
			try {
				await unlink(oldPath);
			} catch {}
		}
		this.records.set(normalized.id, { ...normalized, docPath: nextPath, status: documentStatusFor(normalized, this.forgottenIds) });
		return nextPath;
	}

	async ensureMarkdownBackfill() {
		for (const record of this.records.values()) {
			const desiredPath = documentPathForRecord(record, this.dataDir);
			if (!record.docPath || record.docPath !== desiredPath || !existsSync(record.docPath)) {
				await this.writeMarkdownDocument({ ...record, docPath: desiredPath }, { path: desiredPath, oldPath: record.docPath });
			} else if (this.isForgotten(record.id)) {
				await this.writeMarkdownDocument(record, { path: record.docPath });
			}
		}
	}

	async backfillMarkdownDocuments() {
		if (!this.initialized) await this.init();
		await this.ensureMarkdownBackfill();
		await this.writeCache();
		return this.documentPaths().length;
	}

	async saveMemory(input, metadata = {}) {
		if (!this.initialized) await this.init();
		return this.withMutation(async () => {
			const clean = validateMemoryInput(input);
			const currentBranchPath = metadata.branchPath ?? [];
			const mutableKey = mutableTopicKeyFor(clean);
			const existing = mutableKey
				? this.allRecords().find((record) => record.mutableKey === mutableKey)
				: undefined;
			const timestamp = formatTimestamp();
			const record = normalizeRecord(
				existing
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
						status: "active",
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
						tags: [],
						relations: [],
						status: "active",
					}
			);
			record.docPath = documentPathForRecord(record, this.dataDir);

			this.records.set(record.id, record);
			await this.writeMarkdownDocument(record, { path: record.docPath, oldPath: existing?.docPath });
			const event = { version: CURRENT_STORE_VERSION, event: "save", savedAt: timestamp, record };
			await this.appendJournal(event);
			await this.writeCache();
			return { record, updated: Boolean(existing), historical: isHistoricalType(record.type), event };
		});
	}

	async forgetMemory(input, metadata = {}) {
		if (!this.initialized) await this.init();
		return this.withMutation(async () => {
			const targetIds = [...new Set(toForgetTargetIds(input))];
			if (targetIds.length === 0) throw new Error("id or targetIds is required");
			const records = targetIds.map((id) => this.records.get(id)).filter(Boolean);
			if (records.length === 0) throw new Error(`No memory found for id(s): ${targetIds.join(", ")}`);
			const newTargetIds = targetIds.filter((id) => !this.forgottenIds.has(id));
			if (newTargetIds.length === 0) {
				return { records, targetIds, alreadyForgotten: true, event: undefined };
			}
			const timestamp = formatTimestamp();
			for (const id of newTargetIds) {
				this.forgottenIds.add(id);
				const record = this.records.get(id);
				if (record) {
					const updated = { ...record, status: "forgotten", updatedAt: timestamp };
					this.records.set(id, updated);
					await this.writeMarkdownDocument(updated, { path: updated.docPath || documentPathForRecord(updated, this.dataDir) });
				}
			}
			const event = {
				version: CURRENT_STORE_VERSION,
				event: "forget",
				forgotAt: timestamp,
				targetIds: newTargetIds,
				reason: normalizeForgetReason(input?.reason),
				sessionFile: metadata.sessionFile,
				leafId: metadata.leafId,
				branchPath: metadata.branchPath ?? [],
			};
			await this.appendJournal(event);
			await this.writeCache();
			return { records: records.map((record) => ({ ...record, status: "forgotten", updatedAt: timestamp })), targetIds: newTargetIds, alreadyForgotten: false, event };
		});
	}

	recall(query, options = {}) {
		const tokens = tokenize(query);
		const scopeFilter = options.scope;
		const typeFilter = options.type;
		const limit = options.limit ?? 5;
		const paths = this.documentPaths({ scope: scopeFilter, type: typeFilter });
		if (paths.length === 0) {
			return this.allRecords()
				.filter((record) => !scopeFilter || record.scope === scopeFilter)
				.filter((record) => !typeFilter || record.type === typeFilter)
				.map((record) => {
					const lexical = finalLexicalScore(tokens, record);
					return { record, lexical, score: enrichScore(record, lexical, options) };
				})
				.filter((result) => tokens.length === 0 || result.lexical > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, limit);
		}

		const headers = [];
		for (const path of paths) {
			const header = this.readDocumentHeader(path);
			if (!header?.id) continue;
			if (!options.includeForgotten && header.status === "forgotten") continue;
			if (scopeFilter && header.scope !== scopeFilter) continue;
			if (typeFilter && header.type !== typeFilter) continue;
			const lexical = baseLexicalScore(tokens, header);
			if (tokens.length > 0 && lexical === 0) continue;
			headers.push({ header, lexical, score: enrichScore(header, lexical, options) });
		}

		const candidateCount = Math.max(limit, Math.min(headers.length, limit * 4));
		const candidates = headers.sort((a, b) => b.score - a.score).slice(0, candidateCount);
		const full = candidates
			.map(({ header }) => {
				const record = this.loadDocumentBody(header.docPath);
				const lexical = finalLexicalScore(tokens, record);
				return { record, lexical, score: enrichScore(record, lexical, options) };
			})
			.filter((result) => tokens.length === 0 || result.lexical > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
		return full;
	}

	async importRecords(records = []) {
		if (!this.initialized) await this.init();
		let changed = false;
		for (const inputRecord of records) {
			const record = normalizeRecord(inputRecord);
			if (!record?.id) continue;
			const existing = this.records.get(record.id);
			if (!existing || String(record.updatedAt ?? "") > String(existing.updatedAt ?? "")) {
				record.docPath = record.docPath || documentPathForRecord(record, this.dataDir);
				this.records.set(record.id, record);
				if (record.status === "forgotten") this.forgottenIds.add(record.id);
				await this.writeMarkdownDocument(record, { path: record.docPath, oldPath: existing?.docPath });
				changed = true;
			}
		}
		if (changed) await this.writeCache();
		return changed;
	}

	async importEvents(events = []) {
		if (!this.initialized) await this.init();
		let changed = false;
		for (const event of events) {
			changed = applyEventToState(this, event) || changed;
		}
		if (changed) {
			await this.ensureMarkdownBackfill();
			await this.writeCache();
		}
		return changed;
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

export function formatForgetCandidates(results, options = {}) {
	const queryText = stripPrivateTags(options.query ?? "");
	if (!results.length) return queryText ? `No matching memories found for forget query: ${queryText}` : "No matching memories found to forget.";
	const header = queryText
		? `Multiple memories match forget query: ${queryText}`
		: "Multiple memories match the forget request.";
	const lines = results.map(({ record }, index) => `${index + 1}. [${record.type}/${record.scope}] ${record.title} (id=${record.id})`);
	return `${header}\n${lines.join("\n")}\nRerun the forget action with an exact id to hide one memory.`;
}

export function formatForgottenRecords(records, options = {}) {
	const prefix = options.prefix || "Forgot memory";
	if (!records?.length) return `${prefix}: none`;
	return `${prefix}:\n${records.map((record) => `${record.id}: ${record.title}`).join("\n")}`;
}

export function formatMemoryCapsule(results, options = {}) {
	const maxItems = options.maxItems ?? 4;
	const maxChars = options.maxChars ?? 1200;
	const lines = [];
	for (const { record } of results.slice(0, maxItems)) {
		const topic = record.topicKey ? `${record.topicKey}: ` : "";
		const line = `- [${record.type}/${record.scope}] ${topic}${record.title} — ${String(record.content ?? "").replace(/\s+/g, " ")}`;
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
