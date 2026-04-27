import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import {
	EXTENSION_NAME,
	MEMORY_SCOPES,
	MEMORY_TYPES,
	MemoryStore,
	branchPathFromEntries,
	formatForgetCandidates,
	formatForgottenRecords,
	formatMemoryCapsule,
	formatRecallResults,
	memoryRecordForSessionSummary,
} from "./src/core.mjs";
import { buildRemembrallTree, renderTreePlainText, RemembrallTreeBrowser } from "./src/tree.mjs";

const store: any = new MemoryStore();
let sawAgentActivity = false;
let savedLifecycleSummary = false;
let activityVersion = 0;
let resumeVersion = 0;
let lastPrompt = "";

type MemoryType = (typeof MEMORY_TYPES)[number];
type MemoryScope = (typeof MEMORY_SCOPES)[number];

const memoryTypeEnum = StringEnum(MEMORY_TYPES as readonly MemoryType[]);
const memoryScopeEnum = StringEnum(MEMORY_SCOPES as readonly MemoryScope[]);

const RememberParams = Type.Object({
	title: Type.String({ description: "Short searchable title for the memory." }),
	type: memoryTypeEnum,
	content: Type.String({ description: "Structured memory content. Prefer What/Why/Where/Learned when applicable." }),
	scope: Type.Optional(memoryScopeEnum),
	topicKey: Type.Optional(Type.String({ description: "Stable topic key for evolving topics, e.g. architecture/memory-index." })),
});

const RecallParams = Type.Object({
	query: Type.String({ description: "Search query for saved memories." }),
	type: Type.Optional(memoryTypeEnum),
	scope: Type.Optional(memoryScopeEnum),
	limit: Type.Optional(Type.Number({ description: "Maximum number of compact results to return." })),
});

const SummaryParams = Type.Object({
	summary: Type.Optional(Type.String({ description: "Optional explicit session summary to persist." })),
	title: Type.Optional(Type.String({ description: "Optional title for the summary memory." })),
});

const ForgetParams = Type.Object({
	id: Type.Optional(Type.String({ description: "Exact memory id to forget." })),
	query: Type.Optional(Type.String({ description: "Search query used to resolve candidate memories before forgetting." })),
	type: Type.Optional(memoryTypeEnum),
	scope: Type.Optional(memoryScopeEnum),
	limit: Type.Optional(Type.Number({ description: "Maximum number of candidate memories to inspect." })),
	reason: Type.Optional(Type.String({ description: "Optional reason describing why the memory is being forgotten." })),
});

function metadataFromContext(ctx: ExtensionContext) {
	const branch = ctx.sessionManager.getBranch();
	return {
		sessionFile: ctx.sessionManager.getSessionFile(),
		leafId: ctx.sessionManager.getLeafId(),
		branchPath: branchPathFromEntries(branch),
	};
}

function memoryEventsFromSession(ctx: ExtensionContext) {
	return ctx.sessionManager
		.getEntries()
		.filter((entry: any) => entry.type === "custom" && entry.customType === EXTENSION_NAME)
		.map((entry: any) => entry.data)
		.map((data: any) => {
			if (data?.kind === "memory-record" && data.record?.id) {
				return { event: "save", record: data.record };
			}
			if (data?.kind === "memory-forget" && Array.isArray(data.targetIds)) {
				return {
					event: "forget",
					targetIds: data.targetIds,
					reason: data.reason,
					forgotAt: data.forgotAt,
				};
			}
			return undefined;
		})
		.filter(Boolean);
}

function memoryRecordsFromEvents(events: any[]) {
	return events.filter((event: any) => event?.event === "save" && event.record?.id).map((event: any) => event.record);
}

async function initializeFromSession(ctx: ExtensionContext) {
	await store.init();
	const events = memoryEventsFromSession(ctx);
	if (typeof store.importEvents === "function") {
		await store.importEvents(events);
		return;
	}
	if (typeof store.importRecords === "function") {
		await store.importRecords(memoryRecordsFromEvents(events));
		return;
	}
	throw new Error("MemoryStore must provide importEvents() or importRecords().");
}

async function saveMemoryThroughStore(pi: ExtensionAPI, ctx: ExtensionContext, input: Record<string, unknown>): Promise<any> {
	const saved = await store.saveMemory(input, metadataFromContext(ctx));
	pi.appendEntry(EXTENSION_NAME, {
		kind: "memory-record",
		record: saved.record,
		updated: saved.updated,
	});
	return saved;
}

async function forgetMemoryThroughStore(pi: ExtensionAPI, ctx: ExtensionContext, input: Record<string, unknown>): Promise<any> {
	const forgotten = await store.forgetMemory(input, metadataFromContext(ctx));
	if (!forgotten.alreadyForgotten && forgotten.event) {
		pi.appendEntry(EXTENSION_NAME, {
			kind: "memory-forget",
			targetIds: forgotten.targetIds,
			reason: forgotten.event.reason,
			forgotAt: forgotten.event.forgotAt,
		});
	}
	return forgotten;
}

function stripPrivate(value: unknown) {
	return String(value ?? "").replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]").trim();
}

function textFromMessage(message: any) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part: any) => {
			if (part?.type === "text") return part.text ?? "";
			if (part?.type === "toolCall") return `Tool ${part.name ?? "unknown"} called`;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function summarizeBranch(entries: any[], maxChars = 2200) {
	const sections = [];
	for (const entry of entries) {
		if (entry?.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = stripPrivate(textFromMessage(entry.message));
		if (text) sections.push(`${role}: ${text}`);
	}
	const joined = sections.slice(-12).join("\n\n");
	if (!joined) return "Session had no summarizable user or assistant text.";
	return joined.length > maxChars ? `${joined.slice(0, maxChars)}...` : joined;
}

function lastTextByRole(entries: any[], roleName: string) {
	for (const entry of [...entries].reverse()) {
		if (entry?.type !== "message" || entry.message?.role !== roleName) continue;
		const text = stripPrivate(textFromMessage(entry.message));
		if (text) return text;
	}
	return "";
}

function extractFileReferences(text: string) {
	const matches = new Set<string>();
	const pattern = /(?:^|[\s`'"(])(@?[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|cjs|json|md|yaml|yml|go|py|rs|css|html|sh|toml))(?:$|[\s`'"),.:;])/g;
	let match;
	while ((match = pattern.exec(String(text ?? ""))) !== null) {
		matches.add(match[1].replace(/^@/, ""));
	}
	return [...matches].slice(0, 12);
}

function formatRuntimeWorkResume(entries: any[], options: any = {}) {
	const recentContext = options.recentText || summarizeBranch(entries);
	const lastUser = lastTextByRole(entries, "user");
	const lastAssistant = lastTextByRole(entries, "assistant");
	const checkpoint = options.checkpointRecord;
	const trigger = options.trigger || "memory refresh";
	const goal = stripPrivate(options.goal || lastUser || checkpoint?.title || "Continue current task.");
	const completed = checkpoint
		? `Saved ${checkpoint.type} memory: ${checkpoint.title}`
		: stripPrivate(options.completed || "Captured recent work state for continuation.");
	const changes = stripPrivate(
		options.changes ||
			(lastAssistant ? lastAssistant.slice(0, 900) : recentContext.slice(0, 900)) ||
			"No detailed changes detected.",
	);
	const nextSteps = stripPrivate(options.nextSteps || "Continue from this checkpoint using the saved memories and current branch context.");
	const openQuestions = stripPrivate(options.openQuestions || "None detected.");
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

async function saveLifecycleSummary(pi: ExtensionAPI, ctx: ExtensionContext, explicitSummary?: string, title?: string, checkpointRecord?: any, trigger = "lifecycle checkpoint"): Promise<any> {
	const branch = ctx.sessionManager.getBranch();
	const summary = explicitSummary?.trim() || formatRuntimeWorkResume(branch, { checkpointRecord, trigger });
	const saved = await saveMemoryThroughStore(
		pi,
		ctx,
		memoryRecordForSessionSummary(summary, {
			title: title || "Work resume",
			topicKey: undefined,
		}),
	);
	savedLifecycleSummary = true;
	resumeVersion = Math.max(resumeVersion, activityVersion);
	return saved;
}

async function saveCheckpointResume(pi: ExtensionAPI, ctx: ExtensionContext, checkpointRecord: any, trigger: string): Promise<any> {
	const resume = formatRuntimeWorkResume(ctx.sessionManager.getBranch(), { checkpointRecord, trigger });
	const saved = await saveLifecycleSummary(pi, ctx, resume, `Work resume: ${checkpointRecord.title}`, checkpointRecord, trigger);
	resumeVersion = Math.max(resumeVersion, activityVersion + 1);
	return saved;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		await initializeFromSession(ctx);
		sawAgentActivity = false;
		savedLifecycleSummary = false;
		activityVersion = 0;
		resumeVersion = 0;
		if (ctx.hasUI) ctx.ui.setStatus(EXTENSION_NAME, `memories: ${store.allRecords().length}`);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await initializeFromSession(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		await initializeFromSession(ctx);
		lastPrompt = event.prompt;
		const results = store.recall(event.prompt, {
			branchPath: metadataFromContext(ctx).branchPath,
			limit: 4,
		});
		const capsule = formatMemoryCapsule(results, { maxItems: 4, maxChars: 1200 });
		if (!capsule) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${capsule}\n\nUse these memories only when relevant. Do not mention Pi Remembrall unless the user asks about memory.`,
		};
	});

	pi.on("agent_end", async (event) => {
		if (event.messages.length > 0) {
			sawAgentActivity = true;
			activityVersion += 1;
		}
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const messages = [...event.preparation.messagesToSummarize, ...event.preparation.turnPrefixMessages];
		const compactText = messages
			.map((message: any) => {
				const content = Array.isArray(message.content)
					? message.content.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n")
					: String(message.content ?? "");
				return `${message.role}: ${content}`;
			})
			.filter((line) => line.trim())
			.join("\n\n");
		const resume = formatRuntimeWorkResume(ctx.sessionManager.getBranch(), {
			recentText: compactText || event.preparation.previousSummary,
			trigger: "compaction checkpoint",
		});
		await saveLifecycleSummary(pi, ctx, resume, "Compaction work resume", undefined, "compaction checkpoint");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!sawAgentActivity || resumeVersion >= activityVersion) return;
		await saveLifecycleSummary(pi, ctx, undefined, "Shutdown work resume", undefined, "shutdown checkpoint");
	});

	pi.registerTool({
		name: "remember",
		label: "Remember",
		description:
			"Save a high-signal persistent memory. Use for decisions, architecture, bugfixes, discoveries, patterns, preferences, and session summaries. Do not save routine chatter or raw logs.",
		promptSnippet: "Save high-signal persistent memories for future Pi sessions.",
		promptGuidelines: [
			"Use remember after important decisions, bugfixes, discoveries, patterns, or user preferences. Do not use remember for routine tool output or transient brainstorming.",
			"Use a stable topicKey for evolving architecture, decision, preference, and pattern memories so Pi Remembrall can revise the living topic.",
		],
		parameters: RememberParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await initializeFromSession(ctx);
			const saved = await saveMemoryThroughStore(pi, ctx, params);
			const resume = saved.record.type === "session_summary" ? undefined : await saveCheckpointResume(pi, ctx, saved.record, "explicit remember checkpoint");
			const action = saved.updated ? "Updated" : "Saved";
			const topic = saved.record.topicKey ? ` topic=${saved.record.topicKey}` : "";
			const resumeText = resume ? `\nSaved work resume ${resume.record.id}: ${resume.record.title}` : "";
			return {
				content: [
					{
						type: "text",
						text: `${action} memory ${saved.record.id}${topic}: ${saved.record.title}${resumeText}`,
					},
				],
				details: { ...saved, resume },
			};
		},
	} as any);

	pi.registerTool({
		name: "recall",
		label: "Recall",
		description: "Search Pi Remembrall persistent memories and return compact ranked results.",
		promptSnippet: "Search persistent memories from prior Pi work.",
		promptGuidelines: [
			"Use recall when the user asks what was remembered, references prior work, or starts work that may overlap previous decisions.",
		],
		parameters: RecallParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await initializeFromSession(ctx);
			const results = store.recall(params.query, {
				type: params.type,
				scope: params.scope,
				limit: params.limit ?? 5,
				branchPath: metadataFromContext(ctx).branchPath,
			});
			return {
				content: [{ type: "text", text: formatRecallResults(results) }],
				details: { count: results.length, results },
			};
		},
	} as any);

	pi.registerTool({
		name: "forget",
		label: "Forget",
		description: "Hide a saved memory from future recall, capsules, and tree browsing. Prefer exact ids; query-based forgetting must resolve to exact candidates first.",
		promptSnippet: "Hide saved memories that should no longer be used.",
		promptGuidelines: [
			"Prefer forgetting by exact memory id when available.",
			"If a query returns multiple matches, present candidates and ask for an exact id instead of forgetting ambiguously.",
		],
		parameters: ForgetParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await initializeFromSession(ctx);
			if (params.id) {
				const forgotten = await forgetMemoryThroughStore(pi, ctx, params);
				const prefix = forgotten.alreadyForgotten ? "Memory already forgotten" : "Forgot memory";
				return {
					content: [{ type: "text", text: formatForgottenRecords(forgotten.records, { prefix }) }],
					details: forgotten,
				};
			}
			if (!params.query) {
				return {
					content: [{ type: "text", text: "Provide either an exact memory id or a query to resolve forget candidates." }],
					details: { count: 0, results: [] },
				};
			}
			const results = store.recall(params.query, {
				type: params.type,
				scope: params.scope,
				limit: params.limit ?? 5,
				branchPath: metadataFromContext(ctx).branchPath,
			});
			if (results.length === 0) {
				return {
					content: [{ type: "text", text: formatForgetCandidates(results, { query: params.query }) }],
					details: { count: 0, results },
				};
			}
			if (results.length === 1) {
				const forgotten = await forgetMemoryThroughStore(pi, ctx, { id: results[0].record.id, reason: params.reason });
				return {
					content: [{ type: "text", text: `Forgot memory ${results[0].record.id}: ${results[0].record.title}` }],
					details: { ...forgotten, resolvedFromQuery: params.query },
				};
			}
			return {
				content: [{ type: "text", text: formatForgetCandidates(results, { query: params.query }) }],
				details: { count: results.length, results },
			};
		},
	} as any);

	pi.registerTool({
		name: "memory_summary",
		label: "Memory Summary",
		description: "Persist an explicit or generated session summary to Pi Remembrall.",
		parameters: SummaryParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await initializeFromSession(ctx);
			const saved = await saveLifecycleSummary(pi, ctx, params.summary, params.title);
			return {
				content: [{ type: "text", text: `Saved session summary memory ${saved.record.id}: ${saved.record.title}` }],
				details: saved,
			};
		},
	} as any);

	pi.registerCommand("remembrall", {
		description: "Show Pi Remembrall memory status, recall memories, or manage forget candidates",
		handler: async (args, ctx) => {
			await initializeFromSession(ctx);
			const trimmed = args.trim();
			if (trimmed.startsWith("forget")) {
				const forgetArgs = trimmed.slice("forget".length).trim();
				if (!forgetArgs) {
					ctx.ui.notify("Usage: /remembrall forget <query> or /remembrall forget id:<memory-id>", "info");
					return;
				}
				if (forgetArgs.startsWith("id:")) {
					const id = forgetArgs.slice(3).trim();
					if (!id) {
						ctx.ui.notify("Provide a memory id after id: to forget an exact memory.", "info");
						return;
					}
					const forgotten = await forgetMemoryThroughStore(pi, ctx, { id, reason: "command forget" });
					const prefix = forgotten.alreadyForgotten ? "Memory already forgotten" : "Forgot memory";
					ctx.ui.notify(formatForgottenRecords(forgotten.records, { prefix }), "info");
					return;
				}
				const results = store.recall(forgetArgs, { branchPath: metadataFromContext(ctx).branchPath, limit: 5 });
				ctx.ui.notify(formatForgetCandidates(results, { query: forgetArgs }), "info");
				return;
			}
			const query = trimmed || lastPrompt;
			if (!query) {
				ctx.ui.notify(`Pi Remembrall has ${store.allRecords().length} memories.`, "info");
				return;
			}
			const results = store.recall(query, { branchPath: metadataFromContext(ctx).branchPath, limit: 5 });
			ctx.ui.notify(formatRecallResults(results), "info");
		},
	});

	pi.registerCommand("remembrall-tree", {
		description: "Open a tree browser for the current Pi Remembrall memory hierarchy",
		handler: async (_args, ctx) => {
			await initializeFromSession(ctx);
			const getTree = () => buildRemembrallTree(store.allRecords(), metadataFromContext(ctx).branchPath);
			if (!ctx.hasUI) {
				ctx.ui.notify(renderTreePlainText(getTree()), "info");
				return;
			}

			await ctx.ui.custom(
				(tui, theme, _kb, done) => {
					return new RemembrallTreeBrowser(
						getTree,
						theme,
						() => done(undefined),
						async (record: any) => {
							await forgetMemoryThroughStore(pi, ctx, { id: record.id, reason: "tree browser forget" });
						},
						() => tui.requestRender(),
					);
				},
				{
					overlay: true,
					overlayOptions: {
						width: 120,
						maxHeight: 31,
						anchor: "center",
						margin: 1,
					},
				},
			);
		},
	});
}
