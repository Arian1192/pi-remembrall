import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	MemoryStore,
	formatMemoryCapsule,
	formatWorkResume,
	memoryRecordForSessionSummary,
	stripPrivateTags,
} from "../src/core.mjs";
import { buildRemembrallTree, renderTreePlainText } from "../src/tree.mjs";

async function withStore(fn) {
	const dir = await mkdtemp(join(tmpdir(), "pi-remembrall-"));
	try {
		const store = new MemoryStore({ dataDir: dir });
		await store.init();
		await fn(store);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
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
		await store.saveMemory({
			title: "Current branch note",
			type: "decision",
			content: "This branch is focused on the browser view.",
			scope: "branch-local",
			topicKey: "decision/tree-browser",
		}, { branchPath: ["root", "branch"] });

		const tree = buildRemembrallTree(store.allRecords(), ["root", "branch"]);
		const plain = renderTreePlainText(tree);
		assert.match(plain, /Pi Remembrall Tree/);
		assert.match(plain, /branch-local/);
		assert.match(plain, /project/);
		assert.match(plain, /personal/);
	});
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
