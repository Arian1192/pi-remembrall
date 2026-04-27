## ADDED Requirements

### Requirement: Knowledge entries are stored as Markdown documents
The system MUST persist each knowledge entry as a standalone Markdown document (`.md`) rather than as a single monolithic JSON blob.

#### Scenario: Save a knowledge entry
- **WHEN** the system saves a new knowledge entry
- **THEN** it writes one Markdown file containing structured metadata in front matter and narrative content in the body

#### Scenario: Update a mutable entry
- **WHEN** the system revises an existing mutable entry
- **THEN** it produces a new persisted document version or an equivalent deterministic replacement without losing the entry's metadata or body content

### Requirement: Markdown documents expose structured front matter metadata
The system MUST encode indexable metadata in YAML front matter at the top of each Markdown document.
The canonical recall-oriented schema MUST include at minimum: `id`, `title`, `scope`, `type`, `status`, `topic_key`, `tags`, `relations`, `created_at`, `updated_at`, `revision`, and `branch_path`.
The system MAY include auxiliary runtime metadata in front matter as long as serialization remains deterministic.
The system MUST store timestamps in a human-readable, timezone-aware format.

#### Scenario: Read document metadata
- **WHEN** the system reads a stored document header
- **THEN** it can extract the entry id, title, scope, type, status, topic key, tags, relations, timestamps, revision, and branch path without parsing the full Markdown body

#### Scenario: Interpret a stored timestamp
- **WHEN** the system reads created_at or updated_at from front matter
- **THEN** the value includes enough information to interpret the time without guessing the timezone

#### Scenario: Serialize the canonical schema deterministically
- **WHEN** the system writes a Markdown knowledge document
- **THEN** it emits the canonical front matter fields in a stable, deterministic structure so repeated writes do not create avoidable formatting drift

#### Scenario: Preserve human-readable content in the body
- **WHEN** the system stores narrative notes or summaries
- **THEN** it places them in the Markdown body so the content remains readable and editable by humans

### Requirement: Knowledge entries are organized by logical directory paths
The system MUST store Markdown documents in a directory structure that groups entries by logical dimensions such as scope and type so the agent can locate related files without relying on a heavy central index.

#### Scenario: Locate project decisions by path
- **WHEN** the agent needs project-scoped decision entries
- **THEN** it can resolve candidate files from the directory layout before loading document bodies

#### Scenario: Separate knowledge domains
- **WHEN** the system stores different categories of knowledge
- **THEN** it places them in distinct logical folders so related entries stay clustered on disk

### Requirement: Retrieval MUST support header-first filtering
The system MUST be able to scan and filter entries using only file paths and front matter before reading the full Markdown body.

#### Scenario: Filter by type and scope
- **WHEN** the agent searches for entries matching a type and scope
- **THEN** it can discard nonmatching files by reading only their front matter

#### Scenario: Avoid loading irrelevant bodies
- **WHEN** a query only needs metadata to reject most candidates
- **THEN** the system does not need to parse the full Markdown body for every file

### Requirement: Automated memory flows MUST serialize to Markdown consistently
The system MUST support automated remember and resume flows by generating Markdown documents from structured memory data without requiring manual formatting.

#### Scenario: Save a remembered decision
- **WHEN** the agent invokes the remember flow for a structured memory
- **THEN** the resulting persisted document contains normalized front matter and a readable Markdown body

#### Scenario: Save a session resume
- **WHEN** the system generates a work resume or session summary
- **THEN** it stores the resume as a Markdown document that can be read back and summarized later

### Requirement: Tree and detail views MUST render Markdown knowledge cleanly
The active tree browser MUST present Markdown-backed entries using structured metadata and readable body sections rather than a flat record dump.

#### Scenario: Inspect an entry in the detail pane
- **WHEN** the user selects a knowledge entry in the tree browser
- **THEN** the detail pane shows front matter-derived metadata separately from the Markdown body content

#### Scenario: Browse a long narrative entry
- **WHEN** the body contains headings, lists, or long text
- **THEN** the browser preserves document structure so the content is easier to scan than a plain raw string
