## ADDED Requirements

### Requirement: Forgotten memories stay hidden from live memory views
The system MUST treat forgotten memories as hidden from future recall, memory capsule generation, and active tree browsing. Forgotten memories MUST remain hidden regardless of branch or scope.

#### Scenario: Forget a saved memory and search again
- **WHEN** the user forgets a saved memory record
- **THEN** future recall and memory capsule generation omit that record
- **AND** the active tree browser does not show it

#### Scenario: Forgetting applies across branches
- **WHEN** the user switches to another branch after forgetting a memory
- **THEN** the forgotten memory still does not appear in recall results
- **AND** the live memory browser continues to hide it

### Requirement: Users can forget exact memories and resolve ambiguous search matches
The system MUST support forgetting a memory by exact identifier. The system MUST support forgetting by search query only after candidate memories have been resolved, and MUST require selection when a query matches multiple memories.

#### Scenario: Forget by exact identifier
- **WHEN** the user provides a specific memory identifier to forget
- **THEN** the system forgets that memory without requiring a search match step
- **AND** the memory is hidden from future live views

#### Scenario: Resolve an ambiguous query before forgetting
- **WHEN** the user asks to forget memories matching a query that returns multiple candidates
- **THEN** the system shows the matching memories for selection
- **AND** only the selected memory is forgotten

### Requirement: Forget actions survive restarts and compaction
The system MUST persist forget actions so forgotten memories remain hidden after restart, reload, and compaction. Forget actions MUST be recorded as append-only history rather than in-place deletion of existing records.

#### Scenario: Reload after forgetting a memory
- **WHEN** the system restarts or reloads the session history
- **THEN** previously forgotten memories remain hidden from recall and browsing
- **AND** the forget action is still represented in the history

### Requirement: The tree browser supports forgetting the selected memory
The `/remembrall-tree` browser MUST allow the user to forget the currently selected memory record. The browser MUST confirm the action before applying it.

#### Scenario: Forget a selected record from the tree browser
- **WHEN** the user selects a memory record in `/remembrall-tree` and confirms forgetting it
- **THEN** the record is hidden from the active tree view
- **AND** future recall excludes it

### Requirement: The tree browser keeps tree navigation and details visible at large sizes
The `/remembrall-tree` browser MUST present the memory tree in a floating overlay with a split layout: a tree pane on the left and a details pane on the right. The tree pane MUST render a bounded viewport around the current selection so large memory hierarchies remain navigable. The details pane MUST stay visible while navigating the tree.

#### Scenario: Browse a large tree without losing the details pane
- **WHEN** the memory tree contains more nodes than fit comfortably on screen
- **THEN** the browser shows a bounded tree viewport instead of rendering the full flattened tree at once
- **AND** the details pane remains visible beside the tree

#### Scenario: Open the browser as a floating panel
- **WHEN** the user runs `/remembrall-tree` in the interactive UI
- **THEN** the browser opens in a floating overlay panel
- **AND** the panel shows the tree on the left and details on the right
