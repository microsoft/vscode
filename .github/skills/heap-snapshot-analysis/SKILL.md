---
name: heap-snapshot-analysis
description: "Analyze V8 heap snapshots to investigate memory leaks and retention issues. Use when given .heapsnapshot files, asked to compare before/after snapshots, asked to find what retains objects, or investigating why objects survive GC. Provides snapshot parsing, comparison, retainer-path helpers, and scratchpad scripts."
---

# Heap Snapshot Analysis

Investigate memory leaks from V8 heap snapshots (`.heapsnapshot` files). This skill starts when snapshots already exist: either the user provided them, DevTools exported them, or another workflow produced them. Use the helpers here to compare snapshots, group object deltas, and trace retainer paths.

## IGNORE Prior Investigations

**Start every investigation fresh.** Do NOT read, consult, or be influenced by prior investigations found in:

- `/memories/` (user, session, or repo memory)
- `.github/skills/heap-snapshot-analysis/scratchpad/` (previous dated subfolders and their `findings.md` files)
- Any other notes from earlier sessions

Previous findings can bias the analysis toward suspects that are no longer relevant, or cause the agent to skip steps and jump to conclusions. Let the current snapshots speak for themselves. Only reference prior work if the user explicitly asks you to.

## When to Use

- User provides `.heapsnapshot` files (before/after a workflow)
- User has heap snapshots captured by another skill or script
- Need to find what retains disposed objects (retainer path analysis)
- Comparing object counts/sizes between two snapshots
- Investigating why particular objects survive GC

## Workflow

If the user needs the agent to launch VS Code, drive a scenario, and capture snapshots first, use the VS Code performance workflow skill before returning here for low-level snapshot analysis.

### 1. Parse Snapshots

Use the helpers in [parseSnapshot.ts](./helpers/parseSnapshot.ts) to load snapshots. The files are often >500MB and too large for `JSON.parse` as a string — the helpers use Buffer-based extraction. In scratchpad scripts, import helpers from `../helpers/*.ts`.

For very large snapshots, the helper may still be too eager. Node cannot create a Buffer larger than roughly 2 GiB, so snapshots above that size can fail with `ERR_FS_FILE_TOO_LARGE` even before parsing. In that case, do not try to raise `--max-old-space-size` and retry the same full-file read. Switch to a streaming script.

```typescript
import { parseSnapshot, buildGraph } from '../helpers/parseSnapshot.ts';

const data = parseSnapshot('/path/to/snapshot.heapsnapshot');
const graph = buildGraph(data);
```

#### Snapshots Larger Than 2 GiB

When a snapshot is too large to load into a single Buffer, write scratchpad scripts that scan and parse only the sections needed for the question. Use [streamSnapshot.mjs](./helpers/streamSnapshot.mjs) for the common streaming primitives instead of copying them between scratch scripts.

Useful tricks:

- Find top-level section offsets first. Scan the file as bytes for markers like `"nodes":`, `"edges":`, `"strings":`, and `"trace_function_infos":`. This lets follow-up scripts jump directly to the large arrays instead of searching the whole file repeatedly.
- Parse `snapshot.meta` separately from the small header at the start of the file. Use `meta.node_fields`, `meta.node_types`, `meta.edge_fields`, and `meta.edge_types` to avoid hard-coding tuple widths.
- Stream numeric arrays in chunks. For `nodes` and `edges`, keep a small carryover string between chunks, split on commas, and process complete numeric tokens as they arrive.
- Avoid materializing the full `strings` table unless the investigation truly needs it. If you only need suspicious names, collect string indexes from matching nodes/edges first, then resolve only those indexes in a second streaming pass.
- If you do need many strings, store only short previews and category counters. Full source strings, ref-listing strings, and prompt payloads can dominate memory and make the analyzer become the leak.
- Write intermediate outputs to files in the scratchpad. Large heap analysis is iterative and slow; cached node ids, offsets, and retainer traces save repeated multi-minute passes.
- Prefer self-size attribution and field-level ownership for huge graphs. Full retained-size walks can wildly overcount shared services, roots, maps, and singleton caches.
- When quantifying a suspected owner, count obvious owned fields separately: wrapper object, key arrays, array elements, direct strings, and parent strings of sliced/concatenated strings. This often gives a better lower-bound than a single direct string bucket.
- Be explicit about approximation boundaries. A field-level subtotal usually undercounts listeners/watchers/back-references but avoids the much worse problem of attributing the whole runtime to one object.

Example large-snapshot workflow:

```javascript
import { findArrayStart, findTokenOffsets, parseMeta, streamNumberTuples } from '../../helpers/streamSnapshot.mjs';

const { size, offsets } = findTokenOffsets(snapshotPath);
const meta = parseMeta(snapshotPath);
const nodeFieldCount = meta.node_fields.length;
const nodesStart = findArrayStart(snapshotPath, offsets.get('"nodes"'));

streamNumberTuples(snapshotPath, nodesStart, offsets.get('"edges"'), nodeFieldCount, (node, nodeIndex) => {
    // node is reused for speed; copy it before storing.
});
```

```bash
cd .github/skills/heap-snapshot-analysis
node --max-old-space-size=24576 scratchpad/YYYY-MM-DD-topic/findOffsets.mjs /path/to/Heap.heapsnapshot
node --max-old-space-size=24576 scratchpad/YYYY-MM-DD-topic/streamAnalyze.mjs /path/to/Heap.heapsnapshot > scratchpad/YYYY-MM-DD-topic/streamAnalyze.out
node --max-old-space-size=24576 scratchpad/YYYY-MM-DD-topic/traceNodes.mjs /path/to/Heap.heapsnapshot 12345 67890 > scratchpad/YYYY-MM-DD-topic/traceNodes.out
```

### 2. Compare Before/After

Use [compareSnapshots.ts](./helpers/compareSnapshots.ts) to diff two snapshots:

```typescript
import { compareSnapshots } from '../helpers/compareSnapshots.ts';

const result = compareSnapshots('/path/to/before.heapsnapshot', '/path/to/after.heapsnapshot');
// result.topBySize, result.topByCount, result.newObjectGroups, result.summary
```

### 3. Find Retainer Paths

Use [findRetainers.ts](./helpers/findRetainers.ts) to trace why an object is alive:

```typescript
import { findRetainerPaths } from '../helpers/findRetainers.ts';

// Find what keeps ChatModel instances alive (skipping weak edges)
findRetainerPaths(graph, 'ChatModel', { maxPaths: 5, maxDepth: 25, maxAttempts: 200 });
```

### 4. Write Investigation Scripts

Write investigation-specific scripts in the [scratchpad](./scratchpad/) directory. This folder is gitignored — use it freely for one-off analysis.

Organize scratchpad work into **dated subfolders** named `YYYY-MM-DD-short-description/` (e.g., `2026-04-09-chat-model-retainers/`). Each subfolder should contain:

- The analysis scripts (`.mjs`, `.mts`, etc.)
- A **`findings.md`** file documenting the full investigation: all ideas considered, which ones led to changes and which were rejected (and why), before/after measurements, and a summary of the outcome. This lets the user review the agent's reasoning, decide which changes to keep, and follow up on deferred ideas.

Scripts can import the helpers:

```bash
cd .github/skills/heap-snapshot-analysis
node --max-old-space-size=16384 scratchpad/2026-04-09-chat-model-retainers/analyze.mjs
```

## Key Concepts

### V8 Heap Snapshot Format

The `.heapsnapshot` file is JSON with these key sections:
- **`snapshot.meta`**: Field definitions for nodes and edges
- **`nodes`**: Flat array, every N values = one node (N = `meta.node_fields.length`, typically 6: `type, name, id, self_size, edge_count, detachedness`)
- **`edges`**: Flat array, every M values = one edge (M = `meta.edge_fields.length`, typically 3: `type, name_or_index, to_node`)
- **`strings`**: String table indexed by `name` fields in nodes/edges

### Edge Types That Matter

| Type | Meaning | Prevents GC? |
|------|---------|-------------|
| `property` | Named JS property | Yes |
| `element` | Array index | Yes |
| `context` | Closure variable | Yes |
| `internal` | V8 internal reference | Yes |
| `hidden` | V8 hidden reference | Yes |
| **`weak`** | WeakRef/WeakMap key | **No** |
| `shortcut` | Convenience link | Depends |

**Always skip `weak` edges when tracing retainer paths.** WeakMap entries show up as edges from key → backing array, but they don't prevent collection — they're red herrings.

### Common VS Code Retention Patterns

1. **RowCache templates**: ListView's `RowCache` stores template rows. Templates have `currentElement` pointing to old viewmodel items. If not cleared on session switch, retains entire model chains.

2. **Resource pools**: `pool.clear()` only disposes idle items. If `_onDidUpdateViewModel.fire()` runs AFTER `pool.clear()`, released items re-enter the empty pool and are never disposed. Fire event first, then clear.

3. **`autorunIterableDelta` lastValues**: The closure captures a `Map` of previous iteration values. Values stay until the autorun re-runs. Async disposal delays keep models in observable stores longer than expected.

4. **`HoverService._delayedHovers`**: Global singleton Map retaining disposed objects via `show` closure → `resolveHoverOptions` closure → `this`. If hover cleanup disposable doesn't fire, the entire object tree is retained.

5. **`ObjectMutationLog._previous`**: The incremental serializer keeps a full snapshot of the last-serialized state. Every loaded ChatModel holds 2x its data: live + `_previous`.

6. **`_previousModelRef` pattern**: `MutableDisposable` setter disposes the old value. Reading `.value` and storing it elsewhere, then setting `.value = undefined`, disposes the stored reference. Use `clearAndLeak()` to extract without disposing.

### Defensive Nulling

Null heavy fields in `dispose()` to break retention chains even when something retains the disposed object:

```typescript
override dispose() {
    super.dispose();
    this._requests.length = 0;      // conversation data
    this.dataSerializer = undefined;  // serialization snapshot
    this._editingSession = undefined; // editing session + TextModels
    this._session = undefined!;       // back-reference cycles
}
```

**Caveat**: Don't null fields on viewmodel items (`ChatResponseViewModel._model`). The tree's `diffIdentityProvider` accesses them after the parent viewmodel is disposed but before `setChildren` replaces them.

### False Retainers to Watch For

- **DevTools debugger global handles**: If the snapshot was captured after opening DevTools, large source strings, compiled scripts, preview data, inspected objects, or debugger bookkeeping can be retained by paths like `DevTools debugger(internal)` → `synthetic::(Global handles)` → GC roots. Treat these as debugger-induced until proven otherwise. They may not exist in the app before DevTools opens, and they should not be confused with application-owned leaks.
- **`DevToolsLogger._aliveInstances`** (Map): Enabled by `VSCODE_DEV_DEBUG_OBSERVABLES` env var. Retains ALL observed observables. Check if this is active before investigating observable-rooted paths.
- **`GCBasedDisposableTracker` (FinalizationRegistry)**: If `register(target, held, target)` is used (target === unregister token), creates a strong self-reference preventing GC. Currently commented out in production.
- **WeakMap backing arrays**: Show up in retainer paths but don't prevent collection.

## Running Analysis

All helper scripts use ESM and need Node with extra memory:

```bash
node --max-old-space-size=16384 scratchpad/analyze.mjs
```

Typical analysis takes 30-120 seconds per snapshot depending on size.
