## Context

Pi already has durable session storage, branchable conversation history, and extension hooks that can intercept lifecycle events and inject context. That makes it a strong host for a memory system, but the native primitives are session-oriented rather than memory-oriented. The goal of this change is to add Pi Remembrall: a lightweight, Pi-native memory extension inspired by Engram's selective save/search model, designed to remember only high-signal information, keep retrieval fast, and preserve continuity across compaction and restarts.

The change is cross-cutting because it touches lifecycle hooks, storage, retrieval policy, prompt injection, and session-summary behavior. It must remain local-first, low-noise, and safe under parallel tool execution.

## Goals / Non-Goals

**Goals:**
- Provide structured persistent memory for Pi agents in extension form.
- Preserve important decisions, bugfixes, preferences, discoveries, and summaries across restarts and compaction.
- Make recall fast enough for use on every turn without flooding the context window.
- Keep the memory layer branch-aware so the current conversation path is prioritized.
- Keep writes safe under parallel tool calls.

**Non-Goals:**
- Cloud sync or multi-device replication.
- Embeddings-based semantic memory for v1.
- A dashboard or interactive memory browser.
- Recording every tool call or message as memory.
- Replacing Pi's session system; this extension augments it.

## Decisions

### 1) Use Pi session history as the canonical memory journal
The extension should treat Pi's persisted session tree as the source of truth for memory records. Memory records are stored in the same persistence domain as the conversation, so branch structure, restart recovery, and compaction survival all come "for free" from Pi's existing model.

**Why this over a SQLite-only store?**
- Session history is already branch-aware and durable.
- Memory can be reconstructed from the active branch without needing a separate sync model.
- Keeping the journal close to the conversation makes the system easier to reason about.

**Alternatives considered:**
- **SQLite-only source of truth**: simpler search, but loses native branch semantics and makes session replay harder.
- **Dual-write with both SQLite and session files as truth**: introduces consistency risk and makes rollback harder.

### 2) Use a local search index as a cache, not as the source of truth
The extension should maintain a local search index for fast recall, but the index is a derived cache rebuilt from the journal when needed.

**Why this over scanning session history directly?**
- Search happens often and must stay cheap.
- A cache avoids repeated full-tree scans on every prompt.
- A derived index can be rebuilt if corrupted or deleted.

**Alternatives considered:**
- **Full session scans**: acceptable for tiny histories, but too slow and noisy as memory grows.
- **External search service**: unnecessary weight for a lightweight extension.
- **Embeddings**: more powerful, but too expensive and complex for the first version.

### 3) Split memory records into mutable topics and append-only facts
The extension should support two semantic families:
- **Mutable topics**: architecture, decision, preference, and pattern records may evolve over time.
- **Append-only facts**: bugfix, discovery, and session_summary records stay historical.

Same `topic_key` values should revise mutable topics in place, while append-only records must never overwrite earlier entries.

**Why this over upserting everything?**
- Living ideas need convergence, not duplication.
- Historical facts should remain auditable and unambiguous.
- This keeps the memory surface small without erasing history.

**Alternatives considered:**
- **Upsert everything**: compact, but risks losing important historical distinctions.
- **Append everything**: safe, but creates noisy duplicates and weak recall.

### 4) Inject a transient memory capsule, not a persistent memory message
The extension should inject a compact memory capsule into the active turn through transient context transformation, not by appending a persistent session message every turn.

**Why this over persistent message injection?**
- A persistent memory message would clutter session history.
- Transient injection keeps memory helpful without polluting the journal.
- A capsule can be regenerated per turn using the latest branch-aware ranking.

**Alternatives considered:**
- **Persistent injected message**: useful for auditability, but too noisy for a memory layer.
- **System prompt only**: good for policy reminders, but too static for turn-specific recall.

### 5) Make branch-local relevance the first ranking signal
The retrieval layer should prioritize the active branch, then project-scoped records, then personal preferences unless the query explicitly asks for another scope.

**Why this over project-only retrieval?**
- Pi sessions branch; memory should respect that topology.
- Current-branch context is usually the most actionable.
- Project-level recall still matters, but should not drown out the current thread.

**Alternatives considered:**
- **Project-only ranking**: simpler, but ignores Pi's actual conversation structure.
- **Personal-first ranking**: useful for preferences, but wrong for technical work.

### 6) Serialize all memory writes through a single mutation queue
Memory mutations should be serialized so parallel tool calls do not race to update the same memory record or index entry.

**Why this over optimistic concurrent writes?**
- Pi can execute tool calls in parallel.
- Memory writes are infrequent but stateful; correctness matters more than raw throughput.
- A queue is simple, debuggable, and compatible with local persistence.

**Alternatives considered:**
- **Per-file locks only**: workable, but easier to get wrong across journal and index updates.
- **Optimistic concurrency**: more complex than necessary for this use case.

### 7) Persist session summaries on compaction and shutdown
The extension should create a session summary record before compaction and again at shutdown if important work occurred and no summary has yet been saved.

**Why this over relying on the agent to remember?**
- Compaction is exactly where context is most at risk.
- Automated summaries provide a stable bridge into the next session.
- The summary becomes a compact, searchable record instead of lost transient text.

**Alternatives considered:**
- **Manual-only summaries**: brittle and easy to forget.
- **Every-turn summaries**: too noisy and redundant.

### 8) Expose a tree browser inside the same capability
The extension should include a `/remembrall-tree` command that renders the current memory hierarchy as a tree-style browser without splitting memory into a separate capability.

**Why this stays inside the existing capability:**
- The browser is a view over the same memory records and scope rules.
- It adds discoverability without changing the memory contract.
- Keeping it in the same capability avoids spec fragmentation while the system is still being shaped.

**Alternatives considered:**
- **Separate capability/spec**: cleaner if the browser becomes a large feature, but unnecessary for the current scope.
- **No browser at all**: keeps the surface small, but makes the memory system harder to inspect while bootstrapping.

### 9) Generate structured work resumes when memory refresh triggers
The extension should produce a concise work resume whenever memory refresh is triggered for a meaningful checkpoint, whether the trigger is explicit (`remember`) or automatic (idle / compaction / shutdown). In YOLO refresh mode, this must happen silently without asking the user whether to save or resume. The resume should use a stable resume template so later sessions can reconstruct the recent task state without replaying the full conversation.

**Why this over saving only atomic memories?**
- Atomic memories preserve facts, but not the working state of the task.
- A resume gives the agent a compact checkpoint for continuation.
- It lets Remembrall remember both the important facts and the shape of the recent work.

**Alternatives considered:**
- **Save only facts**: loses the thread of active work.
- **Generate resumes on every turn**: too noisy and repetitive.
- **Ask before each resume**: safer, but interrupts the user and conflicts with the desired YOLO workflow.
- **Separate resume type**: possible, but unnecessary while `session_summary` already captures the checkpoint concept.

## Risks / Trade-offs

- **[Journal/index divergence]** → Rebuild the cache from the journal on startup or when an integrity check fails.
- **[Over-saving noisy memories]** → Keep the save surface small and require explicit high-signal triggers.
- **[Topic-key misuse]** → Make upsert rules type-aware so only mutable topics converge.
- **[Branch ambiguity after forks]** → Rank by active branch lineage and expose scope-aware retrieval.
- **[Prompt bloat]** → Cap the capsule to a small number of items and a strict token budget.
- **[Concurrent writes]** → Route all persistence through a single serialized mutation path.
- **[Privacy leakage]** → Strip private tags before persistence and keep the capsule minimal.

## Migration Plan

This change should not require a user-facing data migration because it is introduced as an extension.

1. Ship the extension with a versioned local cache.
2. On first start, rebuild the cache from existing journal/session history.
3. Continue appending new records and refreshing the cache incrementally.
4. If the cache becomes invalid, rebuild it from the journal.
5. Roll back by disabling the extension; the underlying Pi session history remains intact.

## Open Questions

- Should a `forget` action exist in v1, or should memory remain append-only except for mutable topics?
- Should `branch-local` be a persisted scope or a derived retrieval label?
- Should the memory capsule be visible in UI for debugging, or remain fully invisible?
- How configurable should ranking weights be across models or use cases?
- Should the extension support export/import in the first release, or defer that to later?
