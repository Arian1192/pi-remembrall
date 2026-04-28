## ADDED Requirements

### Requirement: Memory behavior is configurable without code changes
The system MUST load memory behavior from a local config file and allow environment variable overrides.
The system MUST support configuration for capsule sizing, recall limits, recall thresholds, enabled scopes, type priorities, privacy redaction, and storage location.

#### Scenario: Load default memory settings
- **WHEN** the system starts without a custom config file
- **THEN** it uses safe defaults for capsule size, recall limits, thresholds, scopes, and storage location

#### Scenario: Override memory behavior from environment variables
- **WHEN** the user defines environment overrides for capsule or recall settings
- **THEN** the overrides take precedence over the config file values

#### Scenario: Disable a scope from configuration
- **WHEN** the config disables the personal scope
- **THEN** the system excludes personal memories from recall and capsule injection

### Requirement: The system detects noisy or duplicate memories before storage gets cluttered
The system MUST detect exact or near-duplicate memories during remember flows and surface them as candidate duplicates.
The system MUST support pruning or archiving stale memories such as old work resumes or low-value entries.

#### Scenario: Save a memory similar to an existing one
- **WHEN** the user remembers a decision that is very similar to an existing live memory
- **THEN** the system surfaces the possible duplicate and suggests updating the existing topic instead of silently duplicating it

#### Scenario: Prune stale session summaries
- **WHEN** the user runs a prune or archive operation on old work resumes
- **THEN** the stale summaries are moved out of the active set while the system preserves their history

### Requirement: Memories expose richer organization and provenance metadata
The system MUST support structured metadata for tags, relations, source or origin, relevant files, and pin state.
The system MUST preserve that metadata in the persisted document so header-first recall can use it.

#### Scenario: Save tags and relations with a memory
- **WHEN** the user saves a memory with tags and related memory ids
- **THEN** the system persists both fields and makes them available to recall and tree browsing

#### Scenario: Record the origin of a memory
- **WHEN** a memory is created from a user action, agent action, compaction, or shutdown checkpoint
- **THEN** the system records the origin so later inspection can explain where the memory came from

#### Scenario: Pin a memory
- **WHEN** the user pins a memory
- **THEN** the memory remains eligible for higher-priority recall and is clearly marked as pinned in the metadata

### Requirement: Recall is smarter, thresholded, and aware of common filter phrases
The system MUST support structured recall filters for scope, type, and tags.
The system MUST normalize common language variations such as accents and simple stopword noise so recall is more forgiving.
The system MUST apply a minimum score threshold so low-confidence memories are not injected into the capsule.

#### Scenario: Recall only project decisions
- **WHEN** the user asks for project decisions only
- **THEN** the system returns memories matching that scope and type instead of unrelated entries

#### Scenario: Handle accented or Spanish recall queries
- **WHEN** the user searches using accented text or common Spanish phrasing
- **THEN** the recall matcher still finds the relevant memory when the meaning matches the stored text

#### Scenario: Suppress low-confidence capsule injection
- **WHEN** the best recall candidates score below the configured minimum threshold
- **THEN** the system omits the memory capsule instead of injecting noisy results

### Requirement: Operational commands expose control, diagnostics, and portability
The system MUST provide commands or equivalent tool surfaces for status, export, import, edit, revise, pin, explain, prune, and health diagnostics.

#### Scenario: Inspect memory health and counts
- **WHEN** the user runs a status or doctor command
- **THEN** the system reports memory counts, storage health, and any obvious cache or filesystem problems

#### Scenario: Export and import memories
- **WHEN** the user exports memories
- **THEN** the system produces a portable representation
- **AND WHEN** the user imports that representation
- **THEN** the memories are restored without manual file editing

#### Scenario: Explain ranking and pin a memory
- **WHEN** the user asks why a memory ranked highly or pins a memory
- **THEN** the system explains the main ranking signals and marks the memory as pinned

### Requirement: Privacy controls can redact secrets and disable personal memories
The system MUST support opt-in secret redaction rules for common token and key patterns.
The system MUST allow the personal scope to be disabled entirely.

#### Scenario: Redact a secret-like string
- **WHEN** the user saves content containing a recognized secret pattern and redaction is enabled
- **THEN** the persisted memory stores a redacted value instead of the raw secret

#### Scenario: Disable personal scope
- **WHEN** the config disables personal memories
- **THEN** the system does not store or inject personal-scope memories

### Requirement: Recall uses repo identity and branch signals when available
The system MUST use repo identity when available to keep project memories separated by repository.
The system MUST continue to use current branch context as a ranking signal for branch-local memories.

#### Scenario: Separate memories for different repos
- **WHEN** the user works in two different repositories
- **THEN** project memories from one repository do not dominate recall in the other repository

#### Scenario: Prefer the current branch for branch-local recall
- **WHEN** the current conversation branch overlaps with a branch-local memory
- **THEN** that memory ranks above unrelated branch-local memories from other branches

### Requirement: Storage remains recoverable and compactable
The system MUST write memory updates atomically, recover from cache corruption, and support safe journal compaction.
The system MUST keep the Markdown documents as the durable source of truth while derived caches remain rebuildable.

#### Scenario: Recover from a corrupted cache
- **WHEN** the cache file is unreadable or stale
- **THEN** the system rebuilds the cache from durable Markdown documents or the journal instead of failing permanently

#### Scenario: Compact the journal safely
- **WHEN** the journal grows large and compaction runs
- **THEN** the system preserves the durable memories and reduces journal bloat without losing recall history

### Requirement: Tree detail panes render Markdown as structured content
The tree browser MUST preserve Markdown structure in the detail pane, including headings, bullet lists, paragraph breaks, and readable spacing.
The tree browser MUST present metadata separately from the Markdown body so the content does not read like a flat raw string.

#### Scenario: Render headings and bullets clearly
- **WHEN** the selected memory body contains headings and bullet lists
- **THEN** the detail pane keeps that structure visible instead of collapsing everything into a single unformatted paragraph

#### Scenario: Keep paragraph breaks readable
- **WHEN** the selected memory body contains multiple paragraphs
- **THEN** the detail pane preserves spacing and line breaks so the document is easy to scan
