# Pi Remembrall

Pi Remembrall is a lightweight persistent-memory extension for Pi agents, inspired by Engram's selective memory model.

It saves high-signal memories such as decisions, architecture notes, bugfixes, discoveries, patterns, preferences, and session summaries. It avoids storing raw transcript noise.

## What it provides

- `remember` tool for structured persistent memory saves plus YOLO work-resume checkpoints
- `recall` tool for compact ranked memory search
- `memory_summary` tool for explicit session-summary persistence
- `/remembrall [query]` command for status or quick recall
- `/remembrall-tree` command for browsing the memory hierarchy
- transient memory capsule injection before agent turns
- branch-aware ranking using the current Pi session branch
- topic-key upserts for mutable topics
- append-only storage for historical records
- silent structured work resumes at meaningful checkpoints
- privacy stripping for `<private>...</private>` spans

## Memory types

Supported memory types:

- `architecture`
- `decision`
- `bugfix`
- `discovery`
- `pattern`
- `preference`
- `session_summary`

Mutable types with the same `topicKey` are revised in place:

- `architecture`
- `decision`
- `preference`
- `pattern`

Historical types remain append-only:

- `bugfix`
- `discovery`
- `session_summary`

## Scopes

- `branch-local` — memory tied to the active conversation branch
- `project` — memory for the current workspace/repository
- `personal` — durable user preference across projects

## Storage

By default, Pi Remembrall stores its local journal and cache under:

```text
~/.pi/agent/pi-remembrall/
```

Override this with:

```sh
PI_REMEMBRALL_DIR=/path/to/memory pi
```

The extension also appends Pi custom session entries so memories remain connected to session history.

## Usage examples

Ask the agent to remember something important, or let it call the tool proactively:

```text
Remember that we chose transient memory capsule injection instead of persistent custom messages.
```

Recall memories:

```text
What do you remember about the memory index design?
```

Use the command directly:

```text
/remembrall memory index
```

Browse the memory tree:

```text
/remembrall-tree
```

## Work resumes

When `remember` saves a non-summary memory, Pi Remembrall also saves a structured work resume without prompting the user. Compaction and shutdown checkpoints also save work resumes when needed.

Resume sections:

- Goal
- Completed
- Changes
- Open Questions
- Next Steps
- Relevant Files
- Trigger

## Development

```sh
npm run check
npm test
```

## Reloading

After installing or updating this extension in `~/.pi/agent/extensions/remembrall`, reload Pi with:

```text
/reload
```
