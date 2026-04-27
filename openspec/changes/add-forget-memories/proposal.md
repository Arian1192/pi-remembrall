## Why

Pi Remembrall can save and recall high-signal memories, but it currently lacks a way to retract mistakes, stale decisions, or sensitive information once captured. Without a forgetting path, the memory layer behaves like permanent storage and can keep surfacing records the user no longer wants the agent to use.

## What Changes

- Add a forget capability for saved memories so users can hide records from future recall, memory injection, and tree browsing while preserving an append-only audit trail.
- Persist forget actions as append-only tombstone history so forgotten memories stay hidden after restart, compaction, and reload.
- Support forgetting by exact memory ID and by search-driven selection when a query matches multiple candidates.
- Add a forget path for both the `/remembrall-tree` browser and user-facing command/tool flows so users can select an exact memory to hide from the active view.
- Keep the feature local-first and aligned with the existing memory store, branch-aware ranking, and tree browsing workflow.

## Capabilities

### New Capabilities
- `forget-memories`: user-controlled forgetting for saved memories, including tombstone persistence, exact selection, query resolution, and tree-browser/command/tool forget actions.

### Modified Capabilities
- None.

## Impact

- Memory storage and replay logic in `src/core.mjs` will need a tombstone-aware live view.
- Recall, memory capsule formatting, and tree browsing must consume only the live memory set.
- The extension entrypoint in `index.ts` will need a forget tool, a forget command, and lifecycle wiring for hidden memories.
- The tree browser in `src/tree.mjs` will need a forget action and hidden-record handling.
- Tests must cover replay, ambiguity resolution, exact-ID forgetting, hidden live views, and tree-browser confirmation behavior.
- Docs will need updates for the new forget workflow and its limitations.
