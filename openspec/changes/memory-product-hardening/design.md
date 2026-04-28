## Context

Remembrall now stores memories as Markdown documents with front matter, which solves persistence and document shape, but the product still needs more control and less noise to be usable every day. The current behavior still has hardcoded limits, limited diagnostics, minimal quality control, and tree rendering that can feel too flat when the body is long. This change hardens the product layer without introducing a vector database or a heavier storage model.

## Goals / Non-Goals

**Goals:**
- Make memory behavior configurable without code changes.
- Reduce noise with duplicate detection, pruning, and thresholds.
- Improve recall quality and usability with better ranking signals and filters.
- Add operational commands for status, export/import, edit/revise, pin, explain, prune, and doctor.
- Improve privacy, repo-aware routing, storage resilience, and Markdown rendering.

**Non-Goals:**
- Adding a vector database or semantic index.
- Replacing the Markdown document store.
- Building a remote sync/collaboration system.

## Decisions

### 1) Use a small JSON config file with environment overrides
A local config file keeps defaults explicit, while env vars remain the highest-priority override for deployments and ad-hoc tuning.

**Why:**
- Simple to parse and debug.
- Easy to layer on top of existing `PI_REMEMBRALL_DIR` behavior.
- Keeps performance overhead negligible.

**Alternatives considered:**
- **YAML config**: human friendly, but adds another parser and more ambiguity.
- **Only env vars**: fast, but too opaque and hard to organize for real use.

### 2) Keep recall lexical and deterministic, then add quality signals
Recall should stay lightweight: tokenization, scope/type filters, thresholds, and ranking boosts. Duplicate detection and stale-prune hints can use the existing hash and a small similarity check rather than embeddings.

**Why:**
- Preserves speed and predictability.
- Avoids extra infrastructure.
- Keeps ranking explainable to the user.

**Alternatives considered:**
- **Semantic embeddings**: powerful, but too much complexity for this stage.

### 3) Extend metadata only with fields that improve recall and inspection
The persisted document should stay compact, but it can carry enough metadata to support provenance and organization: tags, relations, origin/source, relevant files, pin state, and optional expiry/usage signals.

**Why:**
- Better tree inspection.
- More explainable recall.
- Helps pruning and duplicate detection.

**Alternatives considered:**
- **Keep metadata minimal forever**: simpler, but makes the product harder to use.
- **Add many derived fields**: richer, but risks turning front matter into a second database.

### 4) Add explicit operational commands instead of hidden behavior
Commands such as status, export/import, edit/revise, pin, explain, prune, and doctor make the system observable and debuggable without exposing internals.

**Why:**
- Users need control when memory gets noisy.
- A command surface is easier to test than implicit heuristics.

**Alternatives considered:**
- **Silent automation only**: convenient, but hard to trust.

### 5) Keep privacy controls opt-in and scope-based
Redaction should be enabled by config and scope selection should be explicit. Personal memories must be easy to disable entirely.

**Why:**
- Privacy defaults matter.
- Users should be able to keep personal memory out of a repo-focused workflow.

**Alternatives considered:**
- **Always redact everything**: safer, but too lossy.
- **Encrypt by default**: secure, but adds friction and key management complexity.

### 6) Treat repo identity and git branch as routing signals, not as storage keys
Repo/branch context should influence ranking and partitioning, but the underlying document store should remain scoped by stable identifiers rather than branch names alone.

**Why:**
- Prevents accidental reshuffling of files.
- Keeps routing simple and stable.

**Alternatives considered:**
- **Store by branch path only**: too volatile and hard to maintain.

### 7) Preserve Markdown structure in the detail pane with a lightweight renderer
The detail view should render headings, bullets, paragraph spacing, and simple block structure. It does not need a full Markdown engine; it needs readable structure.

**Why:**
- Fixes the “flat text dump” feeling.
- Keeps rendering fast and predictable.

**Alternatives considered:**
- **Raw text wrapping only**: fastest, but visually noisy.
- **Full Markdown AST renderer**: richer, but more complexity than needed.

### 8) Keep the Markdown files durable and rebuildable caches secondary
Markdown documents remain the durable source of truth. Derived caches and journals are there for speed and recovery, not as the canonical source.

**Why:**
- Easier rollback and corruption recovery.
- Clear source-of-truth story.

## Risks / Trade-offs

- **[More knobs can overwhelm users]** → Ship sane defaults and expose only the highest-value settings first.
- **[Duplicate detection may produce false positives]** → Surface suggestions without blocking saves.
- **[Prune rules can accidentally remove useful history]** → Prefer archiving over deletion and make the prune command conservative.
- **[Privacy redaction can miss unusual secrets]** → Keep it opt-in but extensible with pattern sets.
- **[Markdown rendering may still miss edge cases]** → Support a limited, readable subset instead of full Markdown complexity.
- **[Storage recovery logic can become brittle]** → Keep caches rebuildable from Markdown and journal data.

## Migration Plan

1. Add config loading and defaults without changing existing memory behavior.
2. Extend memory metadata and command surfaces behind the current store.
3. Add thresholded recall and duplicate/prune hints.
4. Introduce privacy and repo-aware routing controls.
5. Improve tree/detail rendering to preserve Markdown structure.
6. Add recovery/compaction safeguards and verify with tests.
7. Keep rollback possible by preserving the Markdown store as the durable source of truth and rebuilding derived caches when needed.

## Open Questions

- Should pinning be a hard priority override or just a strong ranking boost?
- What secret-pattern set should ship by default?
- Should prune move memories to an archive scope or keep them as tombstoned history?
- How aggressively should usage counts influence ranking versus recency and topic matches?
