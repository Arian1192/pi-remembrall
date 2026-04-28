## 1. Configuration and defaults

- [x] 1.1 Add a local config loader with sane defaults for capsule, recall, privacy, scope toggles, and storage path.
- [x] 1.2 Wire environment variable overrides to take precedence over config file values.
- [x] 1.3 Add tests for default loading, env overrides, and disabled scopes.

## 2. Memory quality and metadata

- [x] 2.1 Extend persisted memory metadata to support tags, relations, source/origin, relevant files, and pin state.
- [x] 2.2 Add duplicate and near-duplicate detection hints during remember flows using existing hashes plus lightweight similarity checks.
- [x] 2.3 Add prune/archive behavior for stale work resumes and low-value memories.
- [x] 2.4 Add tests for metadata persistence, duplicate hints, pinning, and prune/archive flows.

## 3. Recall quality and ranking

- [x] 3.1 Add scope/type/tag filters and common phrase parsing for recall queries.
- [x] 3.2 Improve token normalization for accents and simple Spanish phrasing.
- [x] 3.3 Add a minimum score threshold so low-confidence results do not enter the memory capsule.
- [x] 3.4 Add tests for filtered recall, accent normalization, and thresholded capsule injection.

## 4. Operational commands and diagnostics

- [x] 4.1 Add `/remembrall status` to report counts, scope breakdowns, and storage health.
- [x] 4.2 Add export/import commands for portable memory snapshots.
- [x] 4.3 Add edit/revise, pin, explain, prune, and doctor command handlers.
- [x] 4.4 Add tests for command output, scoring explanation, and export/import round-trips.

## 5. Privacy and repo-aware routing

- [x] 5.1 Add opt-in secret redaction patterns for common keys/tokens.
- [x] 5.2 Allow the personal scope to be disabled entirely from config.
- [x] 5.3 Use repo identity and current git branch signals when available to route and rank project memories.
- [x] 5.4 Add tests for redaction, personal-scope disabling, and repo-aware ranking.

## 6. Storage hardening

- [x] 6.1 Make document writes atomic and keep the Markdown files as the durable source of truth.
- [x] 6.2 Add cache corruption recovery that rebuilds derived state from Markdown documents and/or the journal.
- [x] 6.3 Add journal compaction support that preserves durable memories while reducing log growth.
- [x] 6.4 Add tests for recovery and compaction behavior.

## 7. Markdown detail rendering

- [x] 7.1 Refactor the tree detail pane to preserve Markdown headings, bullets, and paragraph spacing.
- [x] 7.2 Render metadata separately from body content so the detail pane reads like a document card, not a flat dump.
- [x] 7.3 Add tests for rendered bullets, headings, and readable line breaks in the detail pane.
