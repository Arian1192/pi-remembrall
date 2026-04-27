## 1. UX review and polish

- [x] 1.1 Review the forget UX across tool, command, and tree-browser flows before code implementation.
- [x] 1.2 Capture any UX wording and interaction refinements in the change artifacts before starting code changes.

## 2. Memory store and replay

- [x] 2.1 Add tombstone-aware forget records to the memory store replay path.
- [x] 2.2 Ensure the derived live set excludes forgotten records after restart and cache rebuild.
- [x] 2.3 Make mutable topic upserts skip tombstoned records so forgotten topics are not resurrected.
- [x] 2.4 Add tests for replaying forget tombstones, cache rebuild behavior, and mutable-topic resurrection prevention.

## 3. Forget tool and command surfaces

- [x] 3.1 Add a `forget` tool that accepts exact IDs and query-based requests with candidate resolution.
- [x] 3.2 Add a `/remembrall forget` command that lists matches and only applies forgetting after exact selection.
- [x] 3.3 Update recall and capsule generation paths to consume only live, non-forgotten records.
- [x] 3.4 Add tests covering exact-ID forgetting, ambiguous query resolution, and live-view exclusion in recall and capsule output.

## 4. Tree browser integration

- [x] 4.1 Add a forget action for the selected record in `/remembrall-tree`.
- [x] 4.2 Require confirmation before applying a forget action in the tree browser.
- [x] 4.3 Hide forgotten records from the active tree rendering and selection flow.
- [x] 4.4 Add tests for tree-browser forget interaction, confirmation handling, and hidden-record rendering.

## 5. Validation and documentation

- [x] 5.1 Add end-to-end tests proving forgotten records do not appear in recall, capsules, command output, or tree views.
- [x] 5.2 Update README and usage notes to explain the forget workflow and limitations.

## 6. Split overlay tree browser

- [x] 6.1 Refactor `/remembrall-tree` to open as a floating overlay panel in the interactive UI.
- [x] 6.2 Replace the stacked tree/details renderer with a split layout: tree pane on the left, details pane on the right.
- [x] 6.3 Add a bounded tree viewport so large trees remain navigable while keeping the details pane visible.
- [x] 6.4 Add tests for split-layout rendering and large-tree viewport behavior.
