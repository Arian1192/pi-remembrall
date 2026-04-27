## ADDED Requirements

### Requirement: Pi Remembrall structured memory records
The system MUST allow the agent to save memory records with a title, memory type, content, scope, and optional topic key. The system MUST persist saved records across restarts and session compaction.

#### Scenario: Save a high-signal memory
- **WHEN** the agent saves a decision, bugfix, preference, or discovery
- **THEN** the system stores a durable record that can be retrieved in a later session

### Requirement: Search returns compact ranked results
The system MUST allow the agent to search saved memories and return a compact ranked list of matches. Each result MUST include enough metadata to identify the record and decide whether to open it.

#### Scenario: Recall a prior architecture decision
- **WHEN** the agent searches for "memory index"
- **THEN** the system returns the most relevant matching memories first
- **AND** each result includes the title, type, scope, and identifier

### Requirement: Evolving topics update in place
The system MUST treat records with the same topic key as the same evolving topic when the memory type is architecture, decision, preference, or pattern. Saving a new record for that topic key MUST revise the existing topic rather than create a duplicate record in the same scope.

#### Scenario: Revise an architecture decision
- **WHEN** the agent saves a new architecture record with the same topic key as an existing architecture record
- **THEN** the system updates the existing topic record
- **AND** the latest revision becomes the one returned by search and recall

### Requirement: Historical memories remain append-only
The system MUST store bugfix, discovery, and session summary records as append-only historical entries. A matching topic key MUST NOT overwrite an earlier historical record.

#### Scenario: Capture two related bugfixes
- **WHEN** the agent saves two bugfix records with the same topic key
- **THEN** the system stores both records as separate historical entries
- **AND** neither record is lost

### Requirement: Branch-aware relevance and scope
The system MUST support branch-local, project, and personal scopes. When retrieving memory for a turn, the system MUST prioritize branch-local memory for the active branch, then project-scoped memory, then personal memory unless the query explicitly asks for another scope.

#### Scenario: Recall in a forked branch
- **WHEN** the agent switches to a different branch and asks for relevant memory
- **THEN** the system prioritizes memories from the current branch
- **AND** memories from other branches are ranked lower unless directly relevant

### Requirement: Compact capsules and session summaries
The system MUST inject only a small memory capsule into agent context and MUST persist a session summary before compaction and shutdown when important work has occurred. The capsule MUST be small enough to avoid crowding out active conversation context.

#### Scenario: Preserve context through compaction
- **WHEN** the session is about to compact
- **THEN** the system saves a session summary
- **AND** the next session can recover the summarized context without replaying the full history

### Requirement: Remembrall tree browser
The system MUST provide a `/remembrall-tree` command that opens a tree-style browser for inspecting the current memory hierarchy. The browser MUST show branch-local, project, and personal memory groups and MUST let the user inspect topic groupings and individual memory records.

#### Scenario: Open the tree browser
- **WHEN** the user runs `/remembrall-tree`
- **THEN** the system opens a browser view of the current memory tree
- **AND** the tree shows scope groupings and memory records for the active session branch

#### Scenario: Inspect a topic chain
- **WHEN** the user selects a topic group in the tree browser
- **THEN** the browser shows the memory records associated with that topic
- **AND** the user can inspect the current record details without leaving the browser

### Requirement: Work resumes preserve recent task state
The system MUST generate a structured work resume whenever a meaningful memory refresh is triggered, including explicit `remember` saves and automatic checkpoint refreshes. The resume MUST capture the goal, completed work, changes made, open questions, next steps, and relevant files. The system MUST save the resume as a session summary record or equivalent high-signal summary record so later sessions can recover the task state quickly. The system MUST NOT prompt the user before generating or saving a checkpoint resume when automatic or YOLO refresh behavior is active.

#### Scenario: Resume after a meaningful checkpoint
- **WHEN** the agent finishes a meaningful chunk of work and the memory refresh workflow triggers
- **THEN** the system generates a work resume from the recent branch activity
- **AND** the resume includes goal, completed work, changes, open questions, next steps, and relevant files

#### Scenario: Resume after explicit remember
- **WHEN** the user or agent triggers `remember` after an important change
- **THEN** the system produces a compact work resume for that checkpoint without asking for confirmation
- **AND** the resume is stored so the next session can continue the same task thread

#### Scenario: YOLO refresh does not interrupt the user
- **WHEN** an automatic checkpoint determines that a work resume is needed
- **THEN** the system saves the resume silently
- **AND** the user is not interrupted with a save or resume confirmation prompt
