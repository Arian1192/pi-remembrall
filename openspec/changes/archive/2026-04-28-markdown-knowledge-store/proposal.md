## Why

The current knowledge store is optimized for append-only JSON events and a JSON cache, which works well for machine reads but makes documents harder to inspect, organize, and render cleanly in the tree browser. Moving high-signal memories to Markdown with YAML front matter would improve readability, simplify header-first filtering, and make the detail pane feel like a structured document rather than a raw record.

## What Changes

- Introduce a Markdown + YAML front matter persistence format for knowledge entries.
- Separate structured metadata (id, type, scope, tags, dates, relations, status) from narrative content.
- Organize entries into logical directories so the agent can locate documents without a heavy central index.
- Support header-first reads for fast filtering before loading full content.
- Preserve fast lookup and automated resume/remember flows by keeping metadata extraction deterministic.

## Capabilities

### New Capabilities
- `markdown-knowledge-store`: Persist and retrieve knowledge entries as Markdown documents with YAML front matter, optimized for header-first filtering, clean tree rendering, and agent-friendly document structure.

### Modified Capabilities
- None

## Impact

Affected areas include storage format, tree-browser detail rendering, resume/remember generation, retrieval/filtering paths, and new file layout conventions under the data directory and new parsing requirements for Markdown and YAML.
