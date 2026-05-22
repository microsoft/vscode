---
name: cpu-profile-analysis
description: "Analyze V8/Chrome CPU profiles (.cpuprofile) and DevTools trace files (Trace-*.json). Use when: profiling performance, investigating slow functions, comparing code paths, finding bottlenecks, analyzing timeToRequest, understanding call trees from sampling profiler data, analyzing layout/paint/rendering, investigating user timing marks."
---

# Analyze Performance Profiles

Analyze `.cpuprofile` files (V8 sampling profiler) and DevTools trace files (`Trace-*.json`, Chrome Trace Event Format) to find performance bottlenecks, compare code paths, and understand timing.

## When to Use
- User provides a `.cpuprofile` or `Trace-*.json` file and wants to understand performance
- Investigating why one code path is slower than another
- Finding what functions consume the most time
- Comparing "before/after" or "old/new" implementations in a single profile
- Investigating layout thrashing, long tasks, or rendering bottlenecks (trace files)
- Analyzing VS Code user timing marks like `code/didResolveTextFileEditorModel` (trace files)
- Understanding multi-process behavior (Browser, Renderer, GPU processes in trace files)

## Detecting File Type

- **`.cpuprofile`**: Top-level JSON with `nodes`, `samples`, `timeDeltas` keys. Created by the VS Code profiler.
- **`Trace-*.json`**: Top-level JSON with `traceEvents` array (and optional `metadata`). Created by Chrome/Electron DevTools (Performance tab). These are richer than `.cpuprofile` -- they contain CPU samples, layout/paint events, user timing marks, GC events, input events, and multi-process data.

## Key Concepts

- **Sampling profiler**: The profiler periodically snapshots the call stack. Not every function appears -- only those on the stack when the profiler sampled. Don't expect exact function names; look for patterns and nearby activity.
- **Self time**: Time spent in the function itself (the leaf/innermost frame).
- **Total time**: Time the function was anywhere on the stack (includes callees).
- **Idle samples**: Frames labeled `(idle)`, `(program)`, or `(garbage collector)` represent no user code running.

---

## Part 1: `.cpuprofile` Files

### Profile Format

A `.cpuprofile` is JSON with these top-level keys:
- `nodes`: Array of call frame nodes forming a tree (each has `id`, `callFrame`, `children`)
- `samples`: Array of node IDs -- one per profiler tick, referencing the leaf (innermost) frame
- `timeDeltas`: Array of microsecond deltas between consecutive samples
- `startTime` / `endTime`: Absolute timestamps in microseconds
- `$vscode`: Optional VS Code metadata

### Procedure

### 1. Check File Size and Parse

Profile and trace files can exceed V8's string limit (~512MB). Always check the file size first and choose the right parsing strategy:

```javascript
import { readFileSync, statSync } from 'fs';

const stat = statSync(profilePath);
const sizeMB = stat.size / (1024 * 1024);
console.log(`File size: ${sizeMB.toFixed(0)}MB`);

let data;
if (sizeMB < 400) {
    // Small enough for JSON.parse
    data = JSON.parse(readFileSync(profilePath, 'utf8'));
} else {
    // Too large -- use Buffer-based extraction (see "Handling Huge Files" section)
    data = parseProfileFromBuffer(readFileSync(profilePath));
}
```

For files under ~400MB, `JSON.parse(readFileSync(..., 'utf8'))` works fine. For larger files, see the **Handling Huge Files** section below.

### 2. Reformat the File (small files only)

Profiles are often single-line JSON. Reformat for inspection (only if small enough):

```javascript
if (sizeMB < 400) {
    const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
}
```

### 3. Build Data Structures

Write a Node.js analysis script. Build these structures:

```javascript
// Node lookup
const nodeMap = new Map();       // id -> node
const parentMap = new Map();     // id -> parent id

// Absolute timestamps from deltas
const timestamps = [data.startTime];
for (let i = 0; i < data.timeDeltas.length; i++) {
    timestamps.push(timestamps[i] + data.timeDeltas[i]);
}

// Stack walker (leaf to root)
function getStack(sampleNodeId) {
    const stack = [];
    let id = sampleNodeId;
    while (id !== undefined) {
        const node = nodeMap.get(id);
        if (node) stack.push(node.callFrame.functionName);
        id = parentMap.get(id);
    }
    return stack; // [leaf, ..., root]
}
```

### 4. Identify Activity Regions

Split the timeline into buckets (e.g. 500ms) and find which contain relevant function names. Use marker functions related to the user's question to detect activity windows. Allow small gaps (1-2 empty buckets) when merging regions.

**Important**: Because this is a sampling profiler, don't require exact function names. Use sets of related marker functions and look for the broader flow.

### 5. Measure Timing Between Milestones

For questions like "time from X to Y":
1. Find the first non-idle sample containing a marker for X on the stack
2. Find the first sample containing a marker for Y on the stack
3. The gap in absolute timestamps is the approximate duration
4. List all non-idle samples between these points to see what work happens in the gap

### 6. Compare Code Paths

When comparing two implementations:
1. Identify the activity region for each
2. For each region, compute self-time per function (time attributed to the leaf frame)
3. Sort by self-time descending to find the top cost centers
4. Show the first N non-idle stacks in each region to visualize the startup sequence

### 7. Report Findings

Present results as:
- **Timeline**: When each activity region occurred relative to profile start
- **Duration**: How long each region lasted
- **Top functions by self-time**: Where CPU time was actually spent
- **Comparison table**: Side-by-side metrics when comparing paths
- **Stack traces**: Key sample stacks showing the critical path

---

## Part 2: DevTools Trace Files (`Trace-*.json`)

DevTools traces are the future of perf tracing for VS Code. They are created from the built-in Electron/Chrome DevTools Performance tab and contain far more information than `.cpuprofile` files.

### Trace Format

A `Trace-*.json` file has these top-level keys:
- `traceEvents`: Array of trace event objects (hundreds of thousands of entries)
- `metadata`: Object with `source`, `startTime`, `dataOrigin`, and optional DevTools state (breadcrumbs, annotations)

### Trace Event Structure

Each event in `traceEvents` follows the Chrome Trace Event Format:

```javascript
{
  "pid": 3406,           // Process ID
  "tid": 7534980,        // Thread ID
  "ts": 200420830729,    // Timestamp in microseconds
  "ph": "X",             // Phase (event type)
  "cat": "devtools.timeline",  // Category
  "name": "EventDispatch",     // Event name
  "dur": 9,              // Duration in microseconds (for complete events)
  "tdur": 8,             // Thread duration (excludes time thread was suspended)
  "args": { ... },       // Event-specific arguments
  "tts": 7078808         // Thread timestamp
}
```

### Phase Types (`ph`)

| Phase | Name | Meaning |
|-------|------|---------|
| `X` | Complete | Event with duration (`dur` field). Most common. |
| `B` | Begin | Start of a duration event (paired with `E`). |
| `E` | End | End of a duration event (paired with `B`). |
| `I` | Instant | Point-in-time event (no duration). |
| `P` | Sample | CPU profiler sample. |
| `R` | Mark | Navigation timing mark. |
| `M` | Metadata | Process/thread name metadata. |
| `N` | Object Created | Object lifecycle tracking. |
| `D` | Object Destroyed | Object lifecycle tracking. |
| `s` | Flow Start | Async flow connection start. |
| `f` | Flow End | Async flow connection end. |
| `b` | Async Begin | Async event begin. |
| `e` | Async End | Async event end. |
| `n` | Async Instant | Async event instant. |

### Key Categories and What They Contain

| Category | What it captures |
|----------|-----------------|
| `disabled-by-default-devtools.timeline` | `RunTask`, `EvaluateScript`, `TracingStartedInBrowser` -- core task scheduling |
| `devtools.timeline` | `FunctionCall`, `EventDispatch`, `TimerInstall/Fire`, `PrePaint`, `Paint` -- main thread activity |
| `blink.user_timing` | VS Code performance marks (e.g. `code/willResolveTextFileEditorModel`, `code/didResolveTextFileEditorModel`) |
| `blink,devtools.timeline` | `UpdateLayoutTree`, `HitTest`, `IntersectionObserver`, `ParseAuthorStyleSheet` -- layout/rendering |
| `disabled-by-default-v8.cpu_profiler` | `Profile`, `ProfileChunk` -- embedded CPU profile data (same as `.cpuprofile` but chunked) |
| `v8` | `v8.callFunction`, `v8.newInstance`, `V8.DeoptimizeCode` -- V8 engine events |
| `v8,devtools.timeline` | `v8.compile` -- script compilation |
| `devtools.timeline,v8` | `MinorGC`, `MajorGC` -- garbage collection |
| `cppgc` | C++ GC events (Blink garbage collection) |
| `loading` | `LayoutShift`, `URLLoader` -- resource loading and layout shifts |
| `cc,benchmark,disabled-by-default-devtools.timeline.frame` | Frame pipeline events (`PipelineReporter`, `Commit`, etc.) |
| `__metadata` | `process_name`, `thread_name` -- process/thread identification |

### Processes and Threads

Trace files contain events from multiple processes:

| Process | Role | Key Thread |
|---------|------|------------|
| **Renderer** (pid varies) | VS Code's renderer process -- where JS runs | `CrRendererMain` (main thread) |
| **Browser** (pid varies) | Electron's main/browser process | `CrBrowserMain` |
| **GPU Process** (pid varies) | GPU compositing and rendering | `CrGpuMain`, `VizCompositorThread` |

Identify processes/threads via metadata events:
```javascript
const procNames = events.filter(e => e.name === 'process_name');
// => [{args: {name: 'Renderer'}, pid: 3406}, {args: {name: 'Browser'}, pid: 3348}, ...]

const threadNames = events.filter(e => e.name === 'thread_name');
// => [{args: {name: 'CrRendererMain'}, pid: 3406, tid: 7534980}, ...]
```

For VS Code perf analysis, focus on the **Renderer process, CrRendererMain thread** -- this is where JavaScript execution, layout, and painting happen.

### Procedure

#### 1. Check File Size and Parse

Trace files are typically 50-200MB but can exceed V8's string limit (~512MB). Always check first:

```javascript
import { readFileSync, statSync } from 'fs';

const stat = statSync(tracePath);
const sizeMB = stat.size / (1024 * 1024);
console.log(`File size: ${sizeMB.toFixed(0)}MB`);

let data;
if (sizeMB < 400) {
    data = JSON.parse(readFileSync(tracePath, 'utf8'));
} else {
    // Too large -- use Buffer-based extraction (see "Handling Huge Files" section)
    data = parseTraceFromBuffer(readFileSync(tracePath));
}
const events = data.traceEvents;
```

#### 2. Reformat the File (small files only)

For small trace files, reformat for inspection:
```javascript
if (sizeMB < 400) {
    fs.writeFileSync(tracePath, JSON.stringify(data, null, 2));
}
```

#### 3. Build Data Structures

```javascript
const data = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const events = data.traceEvents;

// Identify Renderer main thread
const rendererPid = events.find(e => e.name === 'process_name' && e.args?.name === 'Renderer')?.pid;
const mainTid = events.find(e => e.name === 'thread_name' && e.pid === rendererPid && e.args?.name === 'CrRendererMain')?.tid;

// Filter to main thread events for most analysis
const mainEvents = events.filter(e => e.pid === rendererPid && e.tid === mainTid);
```

#### 4. Analyze User Timing Marks

VS Code emits `performance.mark()` calls that appear as `blink.user_timing` events. These are the most direct way to measure VS Code-specific milestones:

```javascript
const userTimings = events.filter(e => e.cat?.includes('blink.user_timing') && !e.cat.includes('rail'));
// Each has: name (e.g. 'code/didResolveTextFileEditorModel'), ts (microseconds), args.data.startTime (ms from navigation)
```

#### 5. Analyze Long Tasks

Find expensive tasks on the main thread:
```javascript
const longTasks = mainEvents
    .filter(e => e.name === 'RunTask' && e.ph === 'X' && e.dur > 50000) // > 50ms
    .sort((a, b) => b.dur - a.dur);
```

#### 6. Analyze Function Calls

`FunctionCall` events include source location info:
```javascript
const funcCalls = mainEvents
    .filter(e => e.name === 'FunctionCall' && e.dur > 10000) // > 10ms
    .sort((a, b) => b.dur - a.dur);
// args.data contains: functionName, url, lineNumber, columnNumber, scriptId
```

#### 7. Analyze Layout and Rendering

Find layout thrashing and expensive paints:
```javascript
const layoutEvents = mainEvents.filter(e =>
    e.name === 'UpdateLayoutTree' || e.name === 'Layout' ||
    e.name === 'PrePaint' || e.name === 'Paint'
);
// UpdateLayoutTree.args.elementCount tells you how many elements were restyled
```

#### 8. Extract Embedded CPU Profile

Trace files contain the full CPU profile as `ProfileChunk` events. Reconstruct it:
```javascript
const profileEvent = events.find(e => e.name === 'Profile' && e.pid === rendererPid);
const chunks = events.filter(e => e.name === 'ProfileChunk' && e.pid === rendererPid && e.id === profileEvent.id);

// Each chunk's args.data.cpuProfile contains: {nodes: [...], samples: [...]}
// Each chunk's args.data.timeDeltas contains sample timing
// Merge all chunks to reconstruct a full cpuprofile-like structure
const allNodes = [];
const allSamples = [];
const allDeltas = [];
for (const chunk of chunks) {
    const cp = chunk.args.data.cpuProfile;
    if (cp.nodes) allNodes.push(...cp.nodes);
    if (cp.samples) allSamples.push(...cp.samples);
    if (chunk.args.data.timeDeltas) allDeltas.push(...chunk.args.data.timeDeltas);
}
// Now analyze allNodes/allSamples/allDeltas using the same approach as .cpuprofile
```

#### 9. Analyze GC Pressure

```javascript
const gcEvents = mainEvents.filter(e => e.name === 'MinorGC' || e.name === 'MajorGC');
const totalGcTime = gcEvents.reduce((sum, e) => sum + (e.dur || 0), 0);
// Also check cppgc events for Blink GC
const cppgcEvents = events.filter(e => e.cat?.includes('cppgc'));
```

#### 10. Analyze Input Latency

```javascript
const dispatches = mainEvents.filter(e => e.name === 'EventDispatch');
// args.data.type tells you the event type: 'click', 'keydown', 'mousedown', etc.
// dur tells you how long the handler took
const longHandlers = dispatches.filter(e => e.dur > 50000).sort((a, b) => b.dur - a.dur);
```

#### 11. Report Findings

Present results as:
- **Timeline**: When each activity region occurred relative to trace start
- **User timing marks**: VS Code milestone events and their timestamps
- **Long tasks**: Tasks > 50ms that block the main thread
- **Top functions by duration**: Where CPU time was spent, with source locations
- **Layout/rendering**: Expensive style recalculations and paints
- **GC pressure**: Total GC time and frequency
- **Input latency**: Slow event handlers that degrade responsiveness
- **Process breakdown**: What work happened in Browser vs Renderer vs GPU

---

## Handling Huge Files

When a `.cpuprofile` or `Trace-*.json` file exceeds ~400MB, `readFileSync(..., 'utf8')` may fail because V8 cannot create a string that large. Use Buffer-based extraction instead: read the file as a raw `Buffer` and extract sections by scanning for known JSON keys. This is the same technique used for heap snapshots (see `parseSnapshot.ts`).

**Key principle**: Read the file as a Buffer, locate JSON array/object boundaries by scanning bytes, extract individual sections as sub-buffers that are small enough for `JSON.parse`, then assemble the result.

Always run analysis scripts with extra memory: `node --max-old-space-size=16384 script.mjs`

### Buffer-based Parsing for `.cpuprofile`

A `.cpuprofile` has top-level keys `nodes`, `samples`, `timeDeltas`, `startTime`, `endTime`. Extract each section from the buffer:

```javascript
import { readFileSync, statSync } from 'fs';

function parseProfileFromBuffer(buf) {
    // Helper: find the array value for a given key, return parsed array
    function extractArray(key) {
        const keyBuf = Buffer.from(`"${key}":[`);
        const pos = buf.indexOf(keyBuf);
        if (pos === -1) throw new Error(`${key} not found`);
        const arrayStart = pos + keyBuf.length;
        // Find matching ']' -- arrays of numbers have no nested brackets
        const arrayEnd = buf.indexOf(0x5D, arrayStart); // 0x5D = ']'
        return JSON.parse('[' + buf.subarray(arrayStart, arrayEnd).toString('utf8') + ']');
    }

    // Helper: find a scalar value for a given key
    function extractScalar(key) {
        const keyBuf = Buffer.from(`"${key}":`);
        const pos = buf.indexOf(keyBuf);
        if (pos === -1) throw new Error(`${key} not found`);
        const valueStart = pos + keyBuf.length;
        // Scan to next comma or closing brace
        let end = valueStart;
        while (end < buf.length && buf[end] !== 0x2C && buf[end] !== 0x7D) end++;
        return JSON.parse(buf.subarray(valueStart, end).toString('utf8'));
    }

    // Extract the nodes array -- contains objects, so we need bracket matching
    function extractNodesArray() {
        const keyBuf = Buffer.from('"nodes":[');
        const pos = buf.indexOf(keyBuf);
        if (pos === -1) throw new Error('nodes not found');
        const start = pos + keyBuf.length - 1; // include '['
        let depth = 0, end = -1;
        for (let i = start; i < buf.length; i++) {
            if (buf[i] === 0x5B) depth++;
            else if (buf[i] === 0x5D) { depth--; if (depth === 0) { end = i + 1; break; } }
            // Skip strings to avoid counting brackets inside them
            if (buf[i] === 0x22) { i++; while (i < buf.length) { if (buf[i] === 0x5C) i++; else if (buf[i] === 0x22) break; i++; } }
        }
        if (end === -1) throw new Error('nodes array end not found');
        return JSON.parse(buf.subarray(start, end).toString('utf8'));
    }

    const nodes = extractNodesArray();
    const samples = extractArray('samples');
    const timeDeltas = extractArray('timeDeltas');
    const startTime = extractScalar('startTime');
    const endTime = extractScalar('endTime');

    return { nodes, samples, timeDeltas, startTime, endTime };
}
```

### Buffer-based Parsing for `Trace-*.json`

Trace files have two top-level keys: `metadata` (small object) and `traceEvents` (huge array of objects). The strategy is to extract `metadata` normally and stream-parse `traceEvents` by scanning for individual event objects:

```javascript
import { readFileSync } from 'fs';

function parseTraceFromBuffer(buf) {
    // 1. Extract metadata (small, near the top of the file)
    let metadata = {};
    const metaKeyBuf = Buffer.from('"metadata":{');
    const metaPos = buf.indexOf(metaKeyBuf);
    if (metaPos !== -1) {
        const metaStart = metaPos + metaKeyBuf.length - 1; // include '{'
        let depth = 0, metaEnd = -1;
        for (let i = metaStart; i < buf.length; i++) {
            if (buf[i] === 0x7B) depth++;
            else if (buf[i] === 0x7D) { depth--; if (depth === 0) { metaEnd = i + 1; break; } }
            if (buf[i] === 0x22) { i++; while (i < buf.length) { if (buf[i] === 0x5C) i++; else if (buf[i] === 0x22) break; i++; } }
        }
        if (metaEnd !== -1) {
            metadata = JSON.parse(buf.subarray(metaStart, metaEnd).toString('utf8'));
        }
    }

    // 2. Extract traceEvents by parsing in chunks
    //    Each event is a JSON object {...}. Scan for object boundaries.
    const eventsKeyBuf = Buffer.from('"traceEvents":[');
    const eventsPos = buf.indexOf(eventsKeyBuf);
    if (eventsPos === -1) throw new Error('traceEvents not found');
    const arrayStart = eventsPos + eventsKeyBuf.length;

    const traceEvents = [];
    let i = arrayStart;
    while (i < buf.length) {
        // Skip whitespace and commas
        while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x0A || buf[i] === 0x0D || buf[i] === 0x09 || buf[i] === 0x2C)) i++;
        if (i >= buf.length || buf[i] === 0x5D) break; // end of array

        if (buf[i] !== 0x7B) { i++; continue; } // expect '{'

        // Find matching '}'
        let depth = 0, objEnd = -1;
        for (let j = i; j < buf.length; j++) {
            if (buf[j] === 0x7B) depth++;
            else if (buf[j] === 0x7D) { depth--; if (depth === 0) { objEnd = j + 1; break; } }
            if (buf[j] === 0x22) { j++; while (j < buf.length) { if (buf[j] === 0x5C) j++; else if (buf[j] === 0x22) break; j++; } }
        }
        if (objEnd === -1) break;

        // Parse this individual event object -- each is small enough for JSON.parse
        traceEvents.push(JSON.parse(buf.subarray(i, objEnd).toString('utf8')));
        i = objEnd;
    }

    return { metadata, traceEvents };
}
```

### When to Use Buffer Parsing

| File size | Approach |
|-----------|----------|
| < 400MB | `JSON.parse(readFileSync(path, 'utf8'))` is fine |
| 400MB - 1GB | Use Buffer-based extraction functions above |
| > 1GB | Use Buffer-based extraction + `--max-old-space-size=16384` |

### Tips for Large File Analysis

- Always run with `node --max-old-space-size=16384` to give Node.js enough heap space.
- For trace files, consider filtering events during parsing (e.g. skip categories you don't need) to reduce memory.
- The Buffer approach reads the entire file into memory as bytes (which is fine -- Buffer doesn't have the ~512MB string limit). Individual `JSON.parse` calls operate on small sub-buffers.
- When reformatting would create a file too large to write back, skip reformatting and work directly with the parsed data structures.
- If you only need specific event types from a huge trace, add a filter callback to the parsing loop to avoid allocating objects you'll discard.

## Tips

- Timestamps in both formats are microseconds. Divide by 1000 for milliseconds.
- For bundled/minified code (e.g. `extension.js`), function names may be mangled. Use line numbers from `callFrame.lineNumber` to cross-reference with source maps.
- Filter out idle/program/GC samples when measuring active CPU work.
- When the user asks about a gap, check if it's truly idle (event loop waiting) vs. active work in unrelated code.
- Clean up any analysis scripts you create when done.
- Trace files are large (50-200MB). Always filter to the relevant process/thread before analysis to reduce memory and noise.
- When a trace file contains embedded `ProfileChunk` events, prefer analyzing those over asking for a separate `.cpuprofile` -- the data is equivalent but already correlated with other trace events.
- Use `args.data.url` in `FunctionCall` and `EvaluateScript` events to map back to VS Code source files (paths like `vscode-file://vscode-app/Users/.../out/vs/...`).
- The `dur` field is wall-clock duration; `tdur` is thread-time duration. The difference reveals time the thread was suspended (e.g. waiting for I/O or preempted).
