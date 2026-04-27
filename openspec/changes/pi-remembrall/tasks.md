## 1. Extension scaffold and memory model

- [x] 1.1 Create the memory extension package structure and entrypoint in Pi extension format.
- [x] 1.2 Define the memory record schema, including type, scope, title, content, and optional topic key.
- [x] 1.3 Add versioned storage paths and initialization logic for the journal and local cache.

## 2. Persistence and indexing

- [x] 2.1 Implement serialized writes for memory saves so parallel tool calls cannot race.
- [x] 2.2 Implement cache rebuild from persisted memory history on startup.
- [x] 2.3 Implement incremental index refresh for new and updated memory records.

## 3. Save and recall tools

- [x] 3.1 Implement the `remember` tool with validation and structured save behavior.
- [x] 3.2 Implement topic-key upsert behavior for mutable memory types and append-only behavior for historical types.
- [x] 3.3 Implement the `recall` tool with ranked search and compact result formatting.

## 4. Context injection and lifecycle hooks

- [x] 4.1 Implement branch-aware memory selection and memory capsule formatting.
- [x] 4.2 Hook memory injection into the agent turn lifecycle so the capsule is available before model calls.
- [x] 4.3 Save session summaries during compaction and shutdown when important work needs to survive.

## 5. Validation and documentation

- [x] 5.1 Add tests for mutable-topic upserts versus append-only historical records.
- [x] 5.2 Add tests for branch-aware ranking and capsule size limits.
- [x] 5.3 Add tests for privacy stripping on saved memory and session summaries.
- [x] 5.4 Update documentation and examples to show how to use the memory extension.

## 6. Tree browser

- [x] 6.1 Add the `/remembrall-tree` command and tree browser UI for inspecting scope and topic hierarchy.
- [x] 6.2 Build tree snapshot helpers that group records by scope, type, and topic for browser rendering.
- [x] 6.3 Add tests for tree snapshot grouping and browse-ready formatting.
- [x] 6.4 Document the tree browser command and how it relates to the existing memory model.

## 7. Work resumes

- [x] 7.1 Define the structured work-resume template and the checkpoint trigger rules for explicit and automatic refreshes.
- [x] 7.2 Implement resume generation so meaningful checkpoints persist a resume alongside memory records.
- [x] 7.3 Add tests for the resume fields, save triggers, and checkpoint persistence behavior.
- [x] 7.4 Update documentation and examples to explain manual saves versus automatic resume refreshes.
