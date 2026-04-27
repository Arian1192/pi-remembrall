## Context

Pi Remembrall currently stores high-signal memories in a local journal and cache, then reconstructs the live memory set on startup and injects a compact capsule into the agent turn. The extension is intentionally local-first and branch-aware, but it has no user-facing way to retract a memory once saved. Because the underlying session model is append-only, a forget feature must fit the same persistence constraints without relying on in-place deletion.

## Goals / Non-Goals

**Goals:**
- Let users hide saved memories from future recall, memory capsules, and tree browsing.
- Preserve an audit trail of forget actions without breaking the append-only session model.
- Support exact-ID forgetting and query-based selection with ambiguity resolution.
- Review and polish the user-facing forget UX before code implementation begins.
- Keep the behavior deterministic across reloads, compaction, and branch switches.
- Keep the implementation local-first and compatible with the current storage and browsing flow.

**Non-Goals:**
- Hard deletion of session history or guaranteed physical purging of all traces.
- Retroactive rewriting of past summaries, compaction output, or older agent turns.
- Branch-scoped forgetting semantics for v1.
- Cloud sync or cross-device erase semantics.
- Automatic restore/undo UI in the first version.

## Decisions

### 1) Model forget as an append-only tombstone event
The store should record a forget action as history rather than deleting a memory in place. On replay, the store folds save and forget events into a derived live view.

**Why this over direct deletion?**
- The session model is append-only and already used as the durable source of truth.
- Tombstones preserve an audit trail and make reload behavior deterministic.
- They leave room for future restore support.

**Alternatives considered:**
- **Hard delete from the journal/cache**: simpler conceptually, but inconsistent with append-only session history and harder to audit.
- **Filter only at recall time**: would let forgotten records leak into other surfaces such as capsules or the tree browser.

### 2) Use exact memory IDs as the irreversible target
Query-based forgetting should resolve to exact memory IDs before any tombstone is written.

**Why this over deleting by free-form query?**
- Exact IDs avoid accidental broad erasure.
- The UI can still support search, but the final mutation remains unambiguous.
- This makes the system easier to test and reason about.

**Alternatives considered:**
- **Delete by content match or topicKey directly**: convenient, but too easy to overmatch.
- **Topic-level forgetting only**: would be useful later, but too coarse for a first release.

### 3) Make forget global, not branch-scoped
A forgotten memory should disappear from future live views everywhere, not just on the branch where the request originated.

**Why this over branch-local forget?**
- Users usually mean “do not use this memory anymore,” not “hide it only on this branch.”
- It matches the privacy and control intent of the feature.
- Branch-aware ranking can remain a retrieval signal without changing the meaning of forget.

**Alternatives considered:**
- **Branch-scoped tombstones**: more nuanced, but harder to explain and likely surprising.
- **Scope-specific forget rules**: possible later, but unnecessary for v1.

### 4) Build a derived live-set cache from the event stream
Recall, capsule formatting, and tree browsing should all consume the same filtered live memory set.

**Why this over per-surface filtering?**
- A single live set reduces the chance of forgotten records leaking through one path.
- It keeps ranking and presentation aligned.
- It is easier to rebuild after corruption or restart.

**Alternatives considered:**
- **Late filtering in each caller**: brittle and likely to drift.
- **A separate physical delete store**: conflicts with the current journal-centric architecture.

### 5) Keep restore possible later, but not user-facing in v1
Tombstones should remain reversible in the data model even if the first release does not expose a restore command.

**Why this over making forget one-way by design?**
- It avoids painting the system into a corner.
- It allows future undo/debug flows without changing the storage format again.

**Alternatives considered:**
- **One-way forget only**: simpler today, but it raises the cost of adding undo later.

### 6) Replace the stacked tree browser with a split overlay browser
The tree browser should open as a floating overlay and render as a split panel with a tree pane on the left and a details pane on the right. The tree pane should show a bounded viewport around the selected node instead of rendering the entire flattened tree on screen at once.

**Why this over the current stacked renderer?**
- Large trees currently push the details section off-screen and make the browser hard to use.
- A split panel keeps the selected node context and record details visible at the same time.
- A bounded viewport scales to large trees without requiring the user to page through an enormous flat render.

**Alternatives considered:**
- **Keep the full-screen stacked layout**: simplest, but it does not scale once the tree grows.
- **Floating overlay without split panes**: improves focus, but still loses usability if the tree content pushes details downward.
- **Search-only browser**: useful later, but it does not solve the navigation and visibility problem by itself.

## Risks / Trade-offs

- **Historical summaries may still mention forgotten memories** → Document the limitation; future provenance tracking can improve retractability.
- **Ambiguous query matches could hide the wrong thing** → Require candidate selection before tombstoning.
- **Reload bugs could resurrect forgotten memories** → Rebuild the live set from the full event history on startup and after integrity checks.
- **The current turn may already have seen a stale capsule** → Make the forget guarantee apply from the next memory refresh onward.
- **Tree browser deletion is destructive** → Require confirmation before applying a forget action.
- **A custom overlay layout can become harder to maintain** → Keep the pane rendering logic simple, deterministic, and covered by focused tests.

## Migration Plan

1. Add a tombstone-aware event shape and replay path to the memory store.
2. Rebuild the cache/index from the event log on startup so forgotten records stay hidden.
3. Route recall, capsules, and tree browsing through the live memory set only.
4. Add the forget tool, command, and tree-browser action on top of the derived live view.
5. Backfill tests to verify that forgetting survives restart and does not leak into active views.
6. Refactor the tree browser into a split overlay with a bounded tree viewport and an always-visible details pane.

## Open Questions

- Should a restore/undo command ship in a later version, or remain internal until needed?
- Should the tree browser expose a debug mode for viewing forgotten records?
- Should the command surface support bulk forget by query, or stay exact-selection only in v1?
- Should the split overlay eventually support search, pane focus switching, or detail scrolling beyond the first viewport?
