import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	DEFAULT_REMEMBRALL_CONFIG,
	MemoryStore,
	formatForgetCandidates,
	formatForgottenRecords,
	formatMemoryCapsule,
	formatTimestamp,
	formatWorkResume,
	loadRemembrallConfig,
	memoryRecordForSessionSummary,
	parseMemoryDocument,
	serializeMemoryDocument,
	stripPrivateTags,
} from "../src/core.mjs";
import { buildRemembrallTree, RemembrallTreeBrowser, renderTreeLines, renderTreePlainText } from "../src/tree.mjs";

async function withStore(fn) {
	const dir = await mkdtemp(join(tmpdir(), "pi-remembrall-"));
	try {
		const store = new MemoryStore({ dataDir: dir });
		await store.init();
		await fn(store, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function testTheme() {
	return {
		fg: (_color, value) => String(value),
		bold: (value) => String(value),
	};
}

test("mutable topic saves update the existing record", async () => {
	await withStore(async (store) => {
		const first = await store.saveMemory(
			{
				title: "Use SQLite cache",
				type: "architecture",
				content: "Use a local search cache for recall.",
				scope: "project",
				topicKey: "architecture/memory-index",
			},
			{ branchPath: ["root", "a"] },
		);
		const second = await store.saveMemory(
			{
				title: "Use derived cache",
				type: "architecture",
				content: "Use a derived local cache rebuilt from durable records.",
				scope: "project",
				topicKey: "architecture/memory-index",
			},
			{ branchPath: ["root", "a", "b"] },
		);

		assert.equal(second.updated, true);
		assert.equal(first.record.id, second.record.id);
		assert.equal(store.allRecords().length, 1);
		assert.equal(store.allRecords()[0].revision, 2);
	});
});

test("historical records with the same topic remain append-only", async () => {
	await withStore(async (store) => {
		await store.saveMemory({
			title: "Fixed compaction loss",
			type: "bugfix",
			content: "Session summary is saved before compaction.",
			scope: "project",
			topicKey: "bug/compaction-loss",
		});
		await store.saveMemory({
			title: "Fixed second compaction edge case",
			type: "bugfix",
			content: "Shutdown summary is saved when compaction did not run.",
			scope: "project",
			topicKey: "bug/compaction-loss",
		});

		assert.equal(store.allRecords().length, 2);
	});
});

test("forgotten memories are excluded from recall, capsules, and tree views", async () => {
	await withStore(async (store) => {
		const saved = await store.saveMemory({
			title: "Temporary branch note",
			type: "decision",
			content: "This should be forgotten.",
			scope: "branch-local",
			topicKey: "decision/temp-note",
		});
		await store.forgetMemory({ id: saved.record.id, reason: "test forget" });

		assert.equal(store.allRecords().length, 0);
		assert.equal(store.allRecords({ includeForgotten: true }).length, 1);
		assert.equal(store.recall("temporary forgotten", { branchPath: [] }).length, 0);
		assert.equal(formatMemoryCapsule(store.recall("temporary forgotten", { branchPath: [] })), "");

		const tree = buildRemembrallTree(store.allRecords(), []);
		const plain = renderTreePlainText(tree);
		assert.doesNotMatch(plain, /Temporary branch note/);
	});
});

test("forget tombstones survive restart and journal rebuild", async () => {
	await withStore(async (store, dir) => {
		const saved = await store.saveMemory({
			title: "Restart-safe memory",
			type: "decision",
			content: "Should stay forgotten after restart.",
			scope: "project",
		});
		await store.forgetMemory({ id: saved.record.id, reason: "restart test" });

		const reloaded = new MemoryStore({ dataDir: dir });
		await reloaded.init();
		assert.equal(reloaded.getRecord(saved.record.id), undefined);
		assert.equal(reloaded.allRecords().length, 0);

		await reloaded.rebuildFromJournal();
		assert.equal(reloaded.getRecord(saved.record.id), undefined);
		assert.equal(reloaded.allRecords().length, 0);
		assert.equal(reloaded.allRecords({ includeForgotten: true }).length, 1);
	});
});

test("saving a mutable topic after forgetting creates a fresh live record", async () => {
	await withStore(async (store) => {
		const first = await store.saveMemory({
			title: "Original preference",
			type: "preference",
			content: "Use compact prompts.",
			scope: "project",
			topicKey: "preference/prompt-style",
		});
		await store.forgetMemory({ id: first.record.id, reason: "preference changed" });
		const second = await store.saveMemory({
			title: "Updated preference",
			type: "preference",
			content: "Use explicit prompts.",
			scope: "project",
			topicKey: "preference/prompt-style",
		});

		assert.notEqual(first.record.id, second.record.id);
		assert.equal(second.record.revision, 1);
		assert.equal(store.allRecords().length, 1);
		assert.equal(store.allRecords({ includeForgotten: true }).length, 2);
	});
});

test("branch-local ranking and capsule formatting stay compact", async () => {
	await withStore(async (store) => {
		await store.saveMemory(
			{
				title: "Branch choice",
				type: "decision",
				content: "Current branch chose transient capsule injection.",
				scope: "branch-local",
				topicKey: "decision/capsule",
			},
			{ branchPath: ["root", "active"] },
		);
		await store.saveMemory(
			{
				title: "Project choice",
				type: "decision",
				content: "Project chose searchable memory records.",
				scope: "project",
				topicKey: "decision/capsule-project",
			},
			{ branchPath: ["root", "other"] },
		);

		const results = store.recall("capsule choice", { branchPath: ["root", "active"], limit: 2 });
		assert.equal(results[0].record.scope, "branch-local");
		const capsule = formatMemoryCapsule(results, { maxItems: 2, maxChars: 260 });
		assert.ok(capsule.startsWith("PI REMEMBRALL MEMORY CAPSULE"));
		assert.ok(capsule.length <= 260);
	});
});

test("formatForgetCandidates provides exact-id guidance for ambiguous matches", async () => {
	await withStore(async (store) => {
		await store.saveMemory({
			title: "Token policy",
			type: "decision",
			content: "Rotate tokens every 30 days.",
			scope: "project",
		});
		await store.saveMemory({
			title: "Token bugfix",
			type: "bugfix",
			content: "Fix stale token cache invalidation.",
			scope: "project",
		});
		const results = store.recall("token", { limit: 5 });
		const text = formatForgetCandidates(results, { query: "token" });
		assert.match(text, /Multiple memories match forget query/);
		assert.match(text, /id=/);
		assert.match(text, /exact id/);
	});
});

test("formatForgottenRecords yields command-friendly exact-id output", () => {
	const text = formatForgottenRecords([
		{ id: "mem_a", title: "First" },
		{ id: "mem_b", title: "Second" },
	]);
	assert.match(text, /Forgot memory/);
	assert.match(text, /mem_a: First/);
	assert.match(text, /mem_b: Second/);
});

test("tree browser helpers group by scope and topic", async () => {
	await withStore(async (store) => {
		await store.saveMemory({
			title: "Keep manual mode",
			type: "preference",
			content: "Manual mode stays available during bootstrap.",
			scope: "personal",
			topicKey: "preference/remembrall-mode",
		});
		await store.saveMemory({
			title: "Bootstrap workflow",
			type: "decision",
			content: "Save knowledge, explore features, and test the extension.",
			scope: "project",
			topicKey: "architecture/remembrall-bootstrap",
		});
		await store.saveMemory(
			{
				title: "Current branch note",
				type: "decision",
				content: "This branch is focused on the browser view.",
				scope: "branch-local",
				topicKey: "decision/tree-browser",
			},
			{ branchPath: ["root", "branch"] },
		);

		const tree = buildRemembrallTree(store.allRecords(), ["root", "branch"]);
		const plain = renderTreePlainText(tree);
		assert.match(plain, /Pi Remembrall Tree/);
		assert.match(plain, /branch-local/);
		assert.match(plain, /project/);
		assert.match(plain, /personal/);
	});
});

test("tree browser toggles sections with enter instead of drilling into children", () => {
	const records = [
		{
			id: "mem_collapse_1",
			title: "Collapsed record",
			type: "decision",
			scope: "project",
			content: "Child content.",
			revision: 1,
			createdAt: "2026-04-27T00:00:00.000Z",
			updatedAt: "2026-04-27T00:00:00.000Z",
		},
	];
	const browser = new RemembrallTreeBrowser(
		() => buildRemembrallTree(records, []),
		testTheme(),
		() => {},
	);
	browser.render(120);
	browser.handleInput("down");
	browser.handleInput("enter");
	const collapsed = browser.render(120).join("\n");
	assert.doesNotMatch(collapsed, /◦ Collapsed record/);
	browser.handleInput("enter");
	const expanded = browser.render(120).join("\n");
	assert.match(expanded, /◦ Collapsed record/);
});

test("tree browser renders split panes with a bounded viewport for large trees", () => {
	const colorTheme = {
		fg: (color, value) => `[${color}]${value}`,
		bold: (value) => `<b>${value}</b>`,
	};
	const records = Array.from({ length: 30 }, (_, index) => ({
		id: `mem_view_${index}`,
		title: `Item ${String(index).padStart(2, "0")}`,
		type: "decision",
		scope: "project",
		content: `Detail content ${index}`,
		revision: 1,
		createdAt: `2026-04-27T00:00:${String(index).padStart(2, "0")}.000Z`,
		updatedAt: `2026-04-27T00:00:${String(index).padStart(2, "0")}.000Z`,
	}));
	const tree = buildRemembrallTree(records, []);
	const renderedLines = renderTreeLines(tree, "mem_view_24", colorTheme, 100, { treeRows: 10, fixedWidth: 100, bodyRows: 14 }).lines;
	const rendered = renderedLines.join("\n");
	assert.equal(renderedLines.length, 22);
	assert.match(rendered, / Tree /);
	assert.match(rendered, / Details /);
	assert.match(rendered, /Focus: Tree/);
	assert.match(rendered, /\[success\]│/);
	assert.match(rendered, /\[success\]┌/);
	assert.match(rendered, /\[success\]/);
	assert.match(rendered, /Item 24/);
	assert.doesNotMatch(rendered, /Item 00/);
});

test("tree browser scrolls long details with j and k inside the fixed panel", () => {
	const content = Array.from({ length: 30 }, (_, index) => `detail line ${String(index).padStart(2, "0")}`).join("\n");
	const browser = new RemembrallTreeBrowser(
		() => buildRemembrallTree([
			{
				id: "mem_scroll_1",
				title: "Scrollable record",
				type: "decision",
				scope: "project",
				content,
				revision: 1,
				createdAt: "2026-04-27T00:00:00.000Z",
				updatedAt: "2026-04-27T00:00:00.000Z",
			},
		], []),
		testTheme(),
		() => {},
	);
	browser.render(120);
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("enter");
	const before = browser.render(120).join("\n");
	assert.equal(browser.render(120).length, 31);
	assert.match(before, /Focus: Details/);
	assert.match(before, /detail line 00/);
	for (let i = 0; i < 10; i += 1) browser.handleInput("j");
	const afterDown = browser.render(120).join("\n");
	assert.doesNotMatch(afterDown, /detail line 00/);
	assert.match(afterDown, /detail line 10/);
	browser.handleInput("k");
	const afterUp = browser.render(120).join("\n");
	assert.match(afterUp, /detail line 09/);
});

test("tree browser closes on symbolic escape and q", () => {
	let closed = 0;
	const browser = new RemembrallTreeBrowser(
		() => buildRemembrallTree([], []),
		testTheme(),
		() => {
			closed += 1;
		},
	);
	browser.handleInput("escape");
	browser.handleInput("q");
	assert.equal(closed, 2);
});

test("tree browser requires confirmation before forgetting", async () => {
	let records = [
		{
			id: "mem_tree_1",
			title: "Tree record",
			type: "decision",
			scope: "project",
			content: "Forget from browser.",
			revision: 1,
			createdAt: "2026-04-27T00:00:00.000Z",
			updatedAt: "2026-04-27T00:00:00.000Z",
		},
	];
	const forgotten = [];
	const browser = new RemembrallTreeBrowser(
		() => buildRemembrallTree(records, []),
		testTheme(),
		() => {},
		async (record) => {
			forgotten.push(record.id);
			records = records.filter((item) => item.id !== record.id);
		},
	);

	browser.render(120);
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("d");
	assert.match(browser.render(120).join("\n"), /Confirm forget/);
	browser.handleInput("n");
	assert.equal(forgotten.length, 0);
	assert.match(browser.render(120).join("\n"), /Forget canceled/);
	browser.handleInput("d");
	browser.handleInput("y");
	await Promise.resolve();
	assert.deepEqual(forgotten, ["mem_tree_1"]);
	const afterForget = browser.render(120).join("\n");
	assert.match(afterForget, /0 memory record\(s\)/);
	assert.doesNotMatch(afterForget, /◦ Tree record/);
	assert.match(afterForget, /Forgot memory/);
});

test("work resumes include stable checkpoint sections and can be persisted", async () => {
	await withStore(async (store) => {
		const entries = [
			{ type: "message", id: "u1", message: { role: "user", content: "Implement YOLO resume refresh in index.ts" } },
			{ type: "message", id: "a1", message: { role: "assistant", content: [{ type: "text", text: "Updated src/core.mjs and index.ts with checkpoint resume helpers." }] } },
		];
		const resume = formatWorkResume(entries, {
			checkpointRecord: {
				title: "YOLO resume refresh",
				type: "decision",
				content: "Save checkpoint resumes without user prompts.",
			},
			trigger: "explicit remember checkpoint",
		});

		for (const heading of ["## Goal", "## Completed", "## Changes", "## Open Questions", "## Next Steps", "## Relevant Files", "## Trigger"]) {
			assert.match(resume, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		}
		assert.match(resume, /index\.ts/);
		assert.match(resume, /src\/core\.mjs/);

		const saved = await store.saveMemory(memoryRecordForSessionSummary(resume, { title: "Work resume" }));
		assert.equal(saved.record.type, "session_summary");
		assert.match(saved.record.content, /explicit remember checkpoint/);
	});
});

test("private tags are stripped before persistence", async () => {
	await withStore(async (store) => {
		const saved = await store.saveMemory({
			title: "Configure API <private>secret-title</private>",
			type: "preference",
			content: "Use token <private>sk-test</private> only locally.",
			scope: "personal",
			topicKey: "preference/api-token",
		});

		assert.equal(stripPrivateTags("a <private>b</private> c"), "a [REDACTED] c");
		assert.match(saved.record.title, /\[REDACTED\]/);
		assert.doesNotMatch(saved.record.content, /sk-test/);
	});
});

test("markdown serialization is stable and round-trips front matter plus body", () => {
	const record = {
		id: "mem_doc_1",
		title: "Doc title",
		type: "decision",
		scope: "project",
		topicKey: "decision/doc-title",
		status: "active",
		tags: ["docs", "tree"],
		relations: ["mem_other"],
		createdAt: "2026-04-27T22:43:56-03:00",
		updatedAt: "2026-04-27T22:44:56-03:00",
		revision: 2,
		hash: "abc123",
		branchPath: ["root", "branch"],
		content: "# Heading\nBody paragraph.",
	};

	const first = serializeMemoryDocument(record);
	const second = serializeMemoryDocument(parseMemoryDocument(first).record);
	assert.equal(first, second);
	assert.match(first, /created_at: "2026-04-27T22:43:56-03:00"/);
	assert.match(first, /updated_at: "2026-04-27T22:44:56-03:00"/);
	assert.match(first, /# Heading/);
});

test("saveMemory writes one markdown document with timezone-aware front matter", async () => {
	await withStore(async (store) => {
		const saved = await store.saveMemory({
			title: "Markdown persisted note",
			type: "decision",
			content: "# Details\nStored on disk.",
			scope: "project",
			topicKey: "decision/markdown-persisted-note",
		});

		const docs = store.documentPaths();
		assert.equal(docs.length, 1);
		const text = await readFile(docs[0], "utf8");
		assert.match(text, /^---/);
		assert.match(text, /type: "decision"/);
		assert.match(text, /scope: "project"/);
		assert.match(text, /created_at: ".*[+-]\d\d:\d\d"/);
		assert.match(text, /updated_at: ".*[+-]\d\d:\d\d"/);
		assert.match(text, /# Details/);
		assert.equal(saved.record.id, parseMemoryDocument(text).record.id);
	});
});

test("recall scans headers first and only loads matched document bodies", async () => {
	await withStore(async (store) => {
		await store.saveMemory({
			title: "Alpha architecture",
			type: "architecture",
			content: "Shared body text.",
			scope: "project",
		});
		await store.saveMemory({
			title: "Bravo preference",
			type: "preference",
			content: "Other body text.",
			scope: "personal",
		});

		store.debugReads.headerReads = 0;
		store.debugReads.bodyReads = 0;
		const results = store.recall("alpha", { limit: 5 });
		assert.equal(results.length, 1);
		assert.equal(results[0].record.title, "Alpha architecture");
		assert.equal(store.debugReads.headerReads, 2);
		assert.equal(store.debugReads.bodyReads, 1);
	});
});

test("legacy journal data backfills into markdown documents on init", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-remembrall-legacy-"));
	try {
		const timestamp = formatTimestamp(new Date("2026-04-27T03:00:00.000Z"));
		const record = {
			id: "mem_legacy_1",
			version: 1,
			title: "Legacy journal entry",
			type: "decision",
			scope: "project",
			content: "Migrated from JSON journal.",
			createdAt: timestamp,
			updatedAt: timestamp,
			revision: 1,
			hash: "legacyhash",
			branchPath: [],
		};
		await writeFile(join(dir, "memories.v1.jsonl"), `${JSON.stringify({ version: 1, event: "save", savedAt: timestamp, record })}\n`, "utf8");
		const store = new MemoryStore({ dataDir: dir });
		await store.init();
		assert.equal(store.allRecords().length, 1);
		const docs = store.documentPaths();
		assert.equal(docs.length, 1);
		const markdown = await readFile(docs[0], "utf8");
		assert.match(markdown, /Legacy journal entry/);
		assert.match(markdown, /Migrated from JSON journal/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("tree detail rendering shows structured metadata and markdown body sections", () => {
	const browser = new RemembrallTreeBrowser(
		() => buildRemembrallTree([
			{
				id: "mem_doc_view",
				title: "Document view",
				type: "decision",
				scope: "project",
				status: "active",
				pinned: true,
				source: "remember",
				relevantFiles: ["src/core.mjs"],
				content: "# Summary\n\n## Decision\n- keep markdown details\n- preserve bullets",
				revision: 1,
				createdAt: "2026-04-27T22:43:56-03:00",
				updatedAt: "2026-04-27T22:43:56-03:00",
			},
		], []),
		testTheme(),
		() => {},
	);
	browser.render(120);
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("down");
	browser.handleInput("enter");
	const rendered = browser.render(120).join("\n");
	assert.match(rendered, /Status: active/);
	assert.match(rendered, /Pinned: yes/);
	assert.match(rendered, /Source: remember/);
	assert.match(rendered, /Files: src\/core\.mjs/);
	assert.match(rendered, /Body/);
	assert.match(rendered, /Summary/);
	assert.match(rendered, /Decision/);
	assert.match(rendered, /• keep markdown details/);
	assert.match(rendered, /• preserve bullets/);
});

test("config loader provides defaults and env overrides", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-remembrall-config-"));
	try {
		const configPath = join(dir, "config.json");
		await writeFile(configPath, JSON.stringify({ capsule: { maxItems: 9 }, scopes: { enabled: ["project"] } }, null, 2), "utf8");
		const loaded = loadRemembrallConfig({ dataDir: dir, configPath, env: { PI_REMEMBRALL_CAPSULE_MAX_ITEMS: "3", PI_REMEMBRALL_RECALL_MIN_SCORE: "12" } });
		assert.equal(loaded.capsule.maxItems, 3);
		assert.equal(loaded.recall.minScore, 12);
		assert.deepEqual(loaded.scopes.enabled, ["project"]);
		assert.equal(DEFAULT_REMEMBRALL_CONFIG.capsule.maxChars, 1200);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("disabled scopes are not saved or recalled", async () => {
	await withStore(async (_store, dir) => {
		const store = new MemoryStore({ dataDir: dir, config: { ...DEFAULT_REMEMBRALL_CONFIG, scopes: { enabled: ["project", "branch-local"] } } });
		await store.init();
		await assert.rejects(() => store.saveMemory({ title: "Personal secret", type: "preference", content: "Nope", scope: "personal" }), /Scope disabled/);
	});
});

test("richer metadata persists in markdown front matter", async () => {
	await withStore(async (store) => {
		const saved = await store.saveMemory({
			title: "Tagged memory",
			type: "decision",
			content: "Body",
			scope: "project",
			tags: ["ux", "tree"],
			relations: ["mem_other"],
			source: "remember",
			relevantFiles: ["src/tree.mjs"],
			pinned: true,
		});
		const text = await readFile(saved.record.docPath, "utf8");
		assert.match(text, /tags: \["ux", "tree"\]/);
		assert.match(text, /relations: \["mem_other"\]/);
		assert.match(text, /source: "remember"/);
		assert.match(text, /relevant_files: \["src\/tree\.mjs"\]/);
		assert.match(text, /pinned: true/);
	});
});

test("saveMemory returns duplicate hints for similar memories", async () => {
	await withStore(async (store) => {
		await store.saveMemory({ title: "Use markdown docs", type: "decision", content: "Persist memory as markdown documents.", scope: "project" });
		const saved = await store.saveMemory({ title: "Use markdown document store", type: "decision", content: "Persist memories as markdown docs for tree detail readability.", scope: "project" });
		assert.ok(Array.isArray(saved.duplicates));
		assert.ok(saved.duplicates.length >= 1);
	});
});

test("prune forgets stale session summaries", async () => {
	await withStore(async (store) => {
		const oldSummary = await store.saveMemory(memoryRecordForSessionSummary("old summary", { title: "Old summary" }));
		store.records.set(oldSummary.record.id, { ...store.records.get(oldSummary.record.id), updatedAt: "2020-01-01T00:00:00+00:00", createdAt: "2020-01-01T00:00:00+00:00" });
		await store.writeMarkdownDocument(store.records.get(oldSummary.record.id), { path: store.records.get(oldSummary.record.id).docPath });
		const pruned = await store.pruneMemories({ sessionSummaryDays: 1 });
		assert.equal(pruned.pruned.length, 1);
		assert.equal(store.getRecord(oldSummary.record.id), undefined);
	});
});

test("recall supports natural filters, tags, and accent normalization", async () => {
	await withStore(async (store) => {
		await store.saveMemory({ title: "Decisión de proyecto", type: "decision", content: "Arquitectura con acentos.", scope: "project", tags: ["arquitectura"] });
		await store.saveMemory({ title: "Preferencia personal", type: "preference", content: "Otra cosa.", scope: "personal", tags: ["preferencia"] });
		const filtered = store.recall("solo decisiones del proyecto #arquitectura", { limit: 5 });
		assert.equal(filtered.length, 1);
		assert.equal(filtered[0].record.type, "decision");
		const accented = store.recall("arquitectura", { limit: 5 });
		assert.equal(accented[0].record.title, "Decisión de proyecto");
	});
});

test("memory capsule respects minimum score threshold", async () => {
	await withStore(async (store) => {
		await store.saveMemory({ title: "Unrelated note", type: "decision", content: "Completely different topic.", scope: "project" });
		const results = store.recall("different", { limit: 5 });
		assert.equal(formatMemoryCapsule(results, { minScore: 999 }), "");
	});
});

test("snapshot export and import round-trip records and forgotten ids", async () => {
	await withStore(async (store, dir) => {
		const saved = await store.saveMemory({ title: "Roundtrip", type: "decision", content: "Export me.", scope: "project" });
		await store.forgetMemory({ id: saved.record.id, reason: "test" });
		const snapshot = store.exportSnapshot();
		const reloaded = new MemoryStore({ dataDir: join(dir, "imported") });
		await reloaded.init();
		await reloaded.importSnapshot(snapshot);
		assert.equal(reloaded.allRecords().length, 0);
		assert.equal(reloaded.allRecords({ includeForgotten: true }).length, 1);
	});
});

test("cache corruption rebuilds from durable markdown documents", async () => {
	await withStore(async (store, dir) => {
		await store.saveMemory({ title: "Recover me", type: "decision", content: "From docs.", scope: "project" });
		await writeFile(join(dir, "cache.v1.json"), "not-json", "utf8");
		const recovered = new MemoryStore({ dataDir: dir });
		await recovered.init();
		assert.equal(recovered.allRecords().length, 1);
		assert.equal(recovered.allRecords()[0].title, "Recover me");
	});
});

test("journal compaction preserves durable memories", async () => {
	await withStore(async (store, dir) => {
		await store.saveMemory({ title: "Compact me", type: "decision", content: "Still here.", scope: "project" });
		const before = statSync(join(dir, "memories.v1.jsonl")).size;
		await store.compactJournal();
		const after = statSync(join(dir, "memories.v1.jsonl")).size;
		assert.ok(after > 0);
		assert.ok(after <= before + 200);
		const reloaded = new MemoryStore({ dataDir: dir });
		await reloaded.init();
		assert.equal(reloaded.allRecords()[0].title, "Compact me");
	});
});
