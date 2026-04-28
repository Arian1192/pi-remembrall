## 1. Markdown document format

- [x] 1.1 Define the YAML front matter schema for knowledge entries (id, type, scope, tags, status, relations, created_at, updated_at) using a human-readable, timezone-aware timestamp format.
- [x] 1.2 Implement deterministic Markdown serialization for metadata + body content.
- [x] 1.3 Implement Markdown parsing helpers that can read front matter without loading the full body.

## 2. File layout and storage access

- [x] 2.1 Define the directory layout for scope/type-organized documents and stable filename generation.
- [x] 2.2 Implement write/read helpers for one-entry-per-file Markdown persistence.
- [x] 2.3 Add header-first candidate scanning so queries can filter by metadata before parsing bodies.
- [x] 2.4 Add a lightweight manifest or cache layer for fast startup and tree/bootstrap reads.

## 3. Migration and compatibility

- [x] 3.1 Add a backfill path that converts existing JSON-backed memories into Markdown documents.
- [x] 3.2 Keep legacy data readable during migration so the store can roll back safely if needed.
- [x] 3.3 Add tests proving migrated entries preserve ids, metadata, and content.

## 4. Agent flows and tree browser UX

- [x] 4.1 Update remember and memory-summary flows to persist Markdown documents automatically.
- [x] 4.2 Update recall/tree lookup paths to resolve entries from Markdown metadata first.
- [x] 4.3 Refactor the tree detail pane to render structured metadata and Markdown body sections cleanly.
- [x] 4.4 Add tests for document-shaped detail rendering and resume/remember automation.

## 5. Validation and regression coverage

- [x] 5.1 Add tests for header-only filtering, directory resolution, and body loading only on matched candidates.
- [x] 5.2 Add tests for write/read round-trips and stable serialization output.
- [x] 5.3 Verify the implementation still supports forget semantics, tree browsing, and compact recall results.
