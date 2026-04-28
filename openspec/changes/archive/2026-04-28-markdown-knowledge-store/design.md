## Context

The current store is optimized around append-only JSONL events plus a JSON cache. That is fast for machine reads, but the tree browser detail pane shows raw record fields instead of a document-shaped view. The requested change moves knowledge entries toward Markdown documents with YAML front matter so the system can read metadata first, render cleaner details, and keep the narrative body readable for humans and RAG-style workflows.

## Goals / Non-Goals

**Goals:**
- Store knowledge entries as individual Markdown documents with structured YAML front matter.
- Make retrieval header-first so most queries can filter without reading full bodies.
- Improve tree-browser detail rendering by treating entries as documents, not flat records.
- Preserve automated remember/resume flows with deterministic serialization.
- Keep the store fast enough for agent use at moderate-to-large file counts.

**Non-Goals:**
- Replacing every existing JSON-backed runtime concern in one step.
- Solving search exhaustively; this change focuses on document storage and filtering.

## Decisions

### 1) Markdown document as the source of truth
Each entry will live as one `.md` file with YAML front matter and a Markdown body.

**Why:**
- Front matter gives structured metadata for filtering and indexing.
- The body stays readable, editable, and suitable for narrative summaries.
- Tree detail panes can show the entry as a document instead of a record dump.

**Canonical front matter schema**

**Required recall-oriented fields:**
- `id`: stable unique identifier
- `title`: human-readable searchable label
- `scope`: `branch-local` | `project` | `personal`
- `type`: memory category (`decision`, `architecture`, etc.)
- `status`: `active` | `forgotten`
- `topic_key`: stable conceptual key for mutable topics
- `tags`: lightweight classification labels
- `relations`: related memory ids
- `created_at`: canonical human-readable timestamp with timezone
- `updated_at`: canonical human-readable timestamp with timezone
- `revision`: current revision number
- `branch_path`: branch ancestry used for ranking branch-local recall

**Optional/auxiliary runtime fields:**
- `schema_version`
- `hash`
- `created_session_file`
- `last_session_file`
- `last_leaf_id`

**Intentionally excluded from the initial schema:**
- `keywords`
- `summary`
- any vector/embedding references

They can help retrieval in some systems, but for Remembrall the first cut should stay small, deterministic, and cheap to parse.

**Canonical example:**
```md
---
id: "mem_ab12cd34"
title: "Use markdown knowledge store"
scope: "project"
type: "decision"
status: "active"
topic_key: "architecture/markdown-knowledge-store"
tags: ["storage", "markdown"]
relations: ["mem_cd34ef56"]
created_at: "2026-04-27T22:43:56-03:00"
updated_at: "2026-04-27T22:50:10-03:00"
revision: 2
branch_path: ["root", "feature-remembrall"]
---
## Decision
...
```

**Alternatives considered:**
- **Single JSON blob**: fastest to parse in one shot, but poor for readability and RAG.
- **JSON per entry**: better than a monolith, but still not document-shaped for browsing.

### 2) Logical directory layout over a central heavy index
Store files under predictable paths grouped by scope and type (and optionally topic/date) so related entries cluster on disk.

**Why:**
- Lets the agent find candidates by path conventions before scanning bodies.
- Reduces dependence on a large central metadata file.
- Supports natural browsing and repository diffs.

**Alternatives considered:**
- **One global index only**: simpler at first, but becomes a bottleneck and a single failure point.
- **Flat file pool**: easy to write, harder to browse and partition.

### 3) Header-first retrieval path
Queries should inspect front matter first, then load the Markdown body only for candidates that survive filtering.

**Why:**
- Matches the RAG pattern: cheap metadata filter, expensive content read only when needed.
- Improves performance for broad queries that mostly reject files.

**Alternatives considered:**
- **Body-first scanning**: more expensive and unnecessary for metadata-driven filters.

### 4) Keep a lightweight manifest/cache layer
Even with Markdown documents, the runtime should maintain a small derived cache or manifest for hot paths like list, tree bootstrap, and mutation bookkeeping.

**Why:**
- Preserves current performance characteristics.
- Avoids rescanning the whole directory tree on every start.
- Gives a rollback path during migration.

**Alternatives considered:**
- **Pure filesystem scan every time**: simplest conceptually, but likely too slow as the store grows.

### 5) Render the detail pane as a document view
The tree browser should present metadata as a compact card/header and render the body in sections, preserving Markdown structure where possible.
Timestamps should be displayed in a human-readable, timezone-aware format so the user can trust what they are seeing.

**Why:**
- Fixes the “sucio” flat-detail feeling.
- Makes summaries, work resumes, and long notes much easier to scan.
- Avoids confusion from UTC/local time mismatches.

## Risks / Trade-offs

- **[Many small files increase filesystem overhead]** → Use scoped directories plus a lightweight manifest/cache for hot paths.
- **[YAML front matter can be brittle]** → Restrict the metadata schema, validate it before writing, and keep timestamp formatting canonical.
- **[Too many metadata fields can make recall noisier]** → Keep the canonical schema short and bias toward path + header-first routing before adding derived fields.
- **[Migration from JSONL to Markdown may break existing flows]** → Dual-write or backfill first, keep JSON cache/journal until parity is proven.
- **[Mutable topics may create versioning ambiguity]** → Define whether a revision replaces a file or creates a new versioned document.

## Migration Plan

1. Introduce Markdown document serialization alongside the current store.
2. Backfill existing memories into Markdown files using the new layout.
3. Keep a derived cache/manifest so current reads stay fast during transition.
4. Switch tree/recall/detail rendering to prefer Markdown documents.
5. Validate parity for remember, recall, forget, and resume flows.
6. Remove or de-emphasize JSON-specific paths only after the Markdown path is stable.

Rollback should keep the legacy JSONL/cache data intact until the new store proves equivalent in tests.

## Open Questions

- Should mutable topics rewrite the same Markdown file or create versioned document chains?
- What exact directory taxonomy is best: scope/type first, or scope/topic first?
- Should generated work resumes live inside the same file as the triggering memory or as separate documents?
- Is lexical + metadata filtering enough for this project, or do we need richer document partitioning later?
