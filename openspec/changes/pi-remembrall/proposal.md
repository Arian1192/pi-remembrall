## Why

Pi already has strong session persistence, but it lacks a lightweight, structured memory layer that can preserve high-signal decisions, bugfixes, preferences, and discoveries across compaction and restarts without storing raw transcript noise. Pi Remembrall takes inspiration from Engram's selective saves, topic keys, local search, and compact recall.

## What Changes

- Add the Pi Remembrall extension that provides structured persistent memory for agents.
- Add explicit memory tools for saving and recalling high-signal information.
- Persist memory locally in a branch-aware, searchable form.
- Inject a small relevant memory capsule into the agent context before turns.
- Save session summaries before compaction and shutdown so important context survives compression.
- Generate structured work resumes at meaningful checkpoints so the agent can recover recent task state quickly.
- Add a `/remembrall-tree` browser command to inspect the memory hierarchy and revision chains.
- Support topic-key-based upserts for evolving topics like architecture and preferences.
- Keep the system local-first and lightweight; no cloud dependency in the initial rollout.
- **BREAKING**: none expected for existing Pi behavior.

## Capabilities

### New Capabilities
- `pi-remembrall`: Structured save/recall for decisions, bugfixes, discoveries, patterns, and preferences; branch-aware retrieval; topic-key upserts; compact memory capsule injection; session-summary persistence.

### Modified Capabilities
- None.

## Impact

- New extension package in the Pi extension format.
- Local persistence layer for memory records and indexing.
- Prompt injection during agent startup/turn preparation.
- Session lifecycle integration for compaction and shutdown.
- Work-resume template and checkpoint-trigger workflow for automatic refresh modes.
- Potential future docs and examples for memory-oriented agent behavior.
