# Chat Editing Session Attribution - Implementation Summary

## Overview

This document summarizes the implementation of session-specific attribution filtering and file change detection for the VS Code chat editing system. The goal is to:

1. Only save/restore attribution ranges belonging to the current session (not other sessions' edits)
2. Detect external file changes when restoring a session and rebase stored offsets accordingly
3. Handle conflicts with Git-style conflict markers when rebasing fails

## Key Concepts

### Attribution Tracking

The chat editing system tracks which agent/request made which edits at a fine-grained level using:
- `IAttributedRangeDTO` - Serializable offset-based ranges with telemetry info
- `AgentAttribution` / `CombinedAttribution` - Runtime attribution data that survives edit composition/rebasing
- `_originalToModifiedEdit: AttributedStringEdit` - Tracks all edits from original to modified document

### Session Isolation

Each session's edits are filtered by `telemetryInfo.sessionResource` when saving snapshots, so restoring Session A won't clobber Session B's attribution data.

---

## Files Modified

### 1. `chatEditingService.ts` (Interface definitions)

**Changes:**
- Added `notebookCellAttributions` field to `ISnapshotEntry` - Cell content attributions keyed by cell internalId
- Added `notebookStructureAttributions` field to `ISnapshotEntry` - Structure edit attributions for notebooks
- Added `INotebookStructureAttributionDTO` interface

**Note:** Removed `currentContentHash` field (originally added then removed - content comparison is done directly since `current` already stores the full content).

### 2. `chatEditingAttribution.ts` (Helper functions)

**New exports:**
- `filterRangesBySession(ranges, sessionResource)` - Filters attributed ranges by session
- `rebaseAttributedRanges(ranges, storedContent, currentContent, externalEdit)` - Rebases ranges when content changed
- `IRebaseResult` / `IRebaseConflict` - Interfaces for rebase outcomes
- `generateConflictMarkers(conflict)` - Creates Git-style conflict markers

### 3. `chatEditingTextModelChangeService.ts`

**New method:**
- `mergeAttributedEdits(attributedRanges)` - Merges restored attributions INTO existing state (doesn't overwrite)
  - Handles case where another session is already active
  - Existing ranges take precedence over restored ones
  - Non-overlapping ranges are merged in sorted order

### 4. `chatEditingModifiedDocumentEntry.ts` (Text files)

**Changes to `createSnapshot()`:**
- Filters `attributedRanges` to only include ranges from the current session

**Changes to `restoreFromSnapshot()`:**
- Compares `snapshot.current` vs current content to detect external changes
- If changed: computes diff, rebases ranges, inserts conflict markers for failures
- Uses `mergeAttributedEdits()` instead of replacing existing attributions
- Only resets original model if it differs (first session to restore)

**New private methods:**
- `_rebaseAttributedRangesForExternalChanges()` - Computes diff and rebases ranges
- `_insertConflictMarkers()` - Inserts Git conflict markers for unresolvable conflicts

### 5. `chatEditingModifiedNotebookEntry.ts` (Notebooks)

**New tracking:**
- `_structureEditAttributions: INotebookStructureEditAttribution[]` - Tracks insert/delete/move cell operations
- `_currentEditContext` - Holds telemetry info during streaming edits

**Implemented methods:**
- `wasModifiedByRequest(requestId)` - Checks both structure and cell content attributions
- `participatingSessions` - Aggregates sessions from all sources
- `_getNotifySessionTelemetryInfo()` - Returns all telemetry infos
- `acceptStreamingEditsStart/End()` - Sets/clears edit context

**Changes to `acceptNotebookEdit()`:**
- Records structure attributions when cells are inserted/deleted

**Changes to `createSnapshot()`:**
- Collects cell content attributions from all cell entries (filtered by session)
- Includes structure edit attributions (filtered by session)
- Keys cell attributions by `internalId` for stable identification

**Changes to `restoreFromSnapshot()`:**
- Restores structure attributions (merge, don't replace)
- Restores cell content attributions by matching `internalId`
- Handles missing cells gracefully

**New private method:**
- `_restoreAttributionsFromSnapshot()` - Handles attribution restoration

### 6. `chatEditingNotebookCellEntry.ts`

**New methods exposed:**
- `getUniqueAgentAttributions()` - Delegates to text model change service
- `getAttributedRangesDTO()` - Gets ranges for serialization
- `mergeAttributedEdits()` - Merges restored attributions

---

## Key Design Decisions

### 1. Merge vs Replace Semantics

When restoring a session, attributions are **merged** into existing state rather than replacing it. This allows multiple sessions to coexist on the same file entry.

### 2. Content Change Detection

For text files, we compare `snapshot.current` directly against current model content. If different, we compute a diff using `IEditorWorkerService.computeStringEditFromDiff()` and rebase all attributed ranges through the diff.

### 3. Conflict Handling

When `StringEdit.tryRebase()` returns `undefined` (conflict), we generate Git-style conflict markers:
```
<<<<<<< Current (External Changes)
... current content ...
=======
... stored content ...
>>>>>>> AgentName (Session Edit)
```

The editor's merge conflict UI will automatically present resolution options.

### 4. Notebook Cell Identification

Notebooks use `cell.internalMetadata.internalId` (a hash of cell URI) for stable identification across serialization, rather than cell URI or index which can change.

### 5. Deferred Notebook Content Rebasing

Cell content rebasing for external changes is NOT implemented for notebooks yet. This would require per-cell diff computation which is more complex. The current implementation restores cell attributions directly without rebasing.

---

## Testing

All existing tests pass:
- `chatEditingTextModelChangeService.test.ts` - 27 tests passing

---

## Future Work / TODOs

1. **Notebook cell content rebasing** - Implement per-cell diff computation and rebasing when cell content changes externally

2. **Better conflict markers** - Consider adding more context to conflict markers (line numbers, request info)

3. **Performance** - For very large files, diff computation during restore could be slow. Consider adding progress indication or async loading.

4. **Test coverage** - Add tests for:
   - Session-specific filtering
   - External change detection and rebasing
   - Conflict marker generation
   - Multi-session merge scenarios

---

## Code Flow Diagrams

### Snapshot Save Flow (Text File)
```
createSnapshot(sessionResource)
  ├── Get all attributed ranges from _textModelChangeService
  ├── filterRangesBySession(ranges, sessionResource)
  └── Return ISnapshotEntry with filtered attributedRanges
```

### Snapshot Restore Flow (Text File)
```
restoreFromSnapshot(snapshot)
  ├── Compare snapshot.current vs current content
  ├── If changed:
  │   ├── computeStringEditFromDiff(stored, current)
  │   ├── rebaseAttributedRanges(ranges, stored, current, diff)
  │   ├── If conflicts: insertConflictMarkers()
  │   └── mergeAttributedEdits(rebasedRanges)
  └── If unchanged:
      └── mergeAttributedEdits(snapshot.attributedRanges)
```

### Notebook Attribution Flow
```
acceptStreamingEditsStart(responseModel)
  └── Set _currentEditContext with telemetry info

acceptNotebookEdit(edit)
  ├── Apply edit to model
  └── If _currentEditContext && CellEditType.Replace:
      └── Record structure attribution (insert/delete)

acceptStreamingEditsEnd()
  └── Clear _currentEditContext
```
