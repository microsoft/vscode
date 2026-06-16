---
name: trace-memory-cpu-analysis
description: "Analyze native memory usage and correlate it with the CPU profile from an Electron/Chrome content-tracing trace that includes memory-infra heap dumps (captured via 'Developer: Start Heap Tracing'). Use when given a .trace.txt / .json trace with memory_dump + heaps_v2 data and asked which process uses the most memory, where its allocations come from, and what that process is doing on-CPU. Symbolizes native frames with catapult symbolize_trace + breakpad symbols, then queries perfetto trace_processor."
---

# Trace Memory + CPU Analysis

Find the process with the highest memory usage in a content-tracing trace, see
where its native allocations come from (symbolized call stacks), and correlate
that with what the process is doing on-CPU.

This skill targets traces produced by VS Code's **Developer: Start Heap Tracing**
command (Electron `contentTracing` with `disabled-by-default-memory-infra` +
`enableHeapProfiling` + the `v8.cpu_profiler` category). These are **Chrome JSON
traces** (top-level `{"traceEvents":[...]}`), even when the extension is
`.trace.txt`.

## Inputs (ask the user for these)

1. **Trace file** — e.g. `/path/to/code-oss-XXXX.trace.txt`.
2. **Breakpad symbols directory** — version-specific; the user provides the set
   that matches the traced build. Layout: `<Module>/<DEBUG_ID>/<Module>.sym`.

Tools used (paths may differ per machine — confirm with the user):

- `symbolize_trace` (catapult): `…/third_party/catapult/tracing/bin/symbolize_trace`
- `trace_processor_shell` (perfetto): `…/perfetto/out/<build>/trace_processor_shell`

> `minidump_stackwalk` is **not** used here — it symbolizes crash minidumps, not
> trace heap dumps. Use `symbolize_trace` for trace files.

## Key facts about these traces (do not skip)

perfetto's JSON importer only fills the **CPU-profiler** stack tables. Run
[table_coverage.sql](./queries/table_coverage.sql) to confirm on any new trace:

- `cpu_profile_stack_sample`, `stack_profile_frame`, `stack_profile_callsite` →
  **populated** (CPU profile, JS frames already named, no symbolization needed).
- `process_memory_snapshot`, `memory_snapshot_node`, `heap_profile_allocation` →
  **empty**. The memory-infra allocator sizes and the `heaps_v2` native
  allocation stacks survive only in the **raw JSON** → use
  [analyze_memory.py](./helpers/analyze_memory.py).
- `__intrinsic_v8_*` tables → **empty**. They are only populated by the
  `dev.v8.code` perfetto data source, which category-based `contentTracing`
  cannot emit. (V8 JS frame names still appear in `stack_profile_frame` because
  the cpu_profiler category carries them inline.)

So the workflow is split: **memory comes from the JSON helper, CPU comes from
perfetto SQL**, and we join them on `pid`.

## Workflow

### 1. Symbolize the native heap dump (user's symbols)

`symbolize_trace` expects a `.json`/`.json.gz` file. Copy the trace first, then
rewrite frame strings in place (it creates a `.BACKUP`):

```bash
cp "$TRACE" /tmp/trace.json
python3 "$CATAPULT/tracing/bin/symbolize_trace" \
  --use-breakpad-symbols \
  --breakpad-symbols-directory "$BREAKPAD_SYMBOLS" \
  /tmp/trace.json
```

This replaces the `pc:<hex>` frame strings inside every `heaps_v2` dump with
real function names, in place. Notes:
- Match is by **breakpad debug-id**: each `process_mmaps` region carries an `id`
  (e.g. Electron Framework `4C4C445A55553144A15D57158A209F310`) that must equal
  the `MODULE` id in `<dir>/<Module>/<id>/<Module>.sym`. If ids don't match the
  build, those frames stay `pc:<hex>`. The user supplies symbols matching the
  traced version.
- Only modules whose symbols (or on-disk binaries) are present get resolved.
  System libraries (`/usr/lib/...`, `/System/...`) usually stay unsymbolized —
  that's expected and fine; the Electron/Chromium/Node/V8 frames are what matter.
- `symbolize_trace` is slow on large traces (a few minutes for 150+ MB).

> The CPU profile does **not** need this step — its frames are JS function names
> already.

### 2. Rank processes by memory (all pools)

```bash
python3 helpers/analyze_memory.py rank /tmp/trace.json
```

Prints, per process, the private footprint plus the **major allocator pools**:
`malloc`, `v8`, `partition_alloc`, `blink_gc`, `cc`, `gpu`. This matters because a
process with V8/Blink keeps memory in **several independent pools** — `malloc`
alone badly undercounts it:
- **malloc** — system heap (the part `heaps_v2` sampling explains).
- **v8** — the V8 JavaScript heap (per isolate: main / workers / shared). Not in
  malloc. Often the single biggest pool in an extension host or renderer.
- **partition_alloc** — Chrome's PartitionAlloc (Blink layout/DOM, `buffer`,
  `array_buffer` partitions). Separate pool.
- **blink_gc** — Oilpan GC heap (DOM/Blink objects).
- **cc / gpu / shared_memory / canvas / skia** — compositor tiles, GPU buffers,
  shared memory, etc.

`footprint` = OS-visible private memory (the headline). The pools **do not sum to
footprint** — they overlap via ownership edges (`effective_size` discounts that)
and footprint also includes non-allocator resident memory.

### 2b. Full per-pool breakdown for one process

```bash
python3 helpers/analyze_memory.py breakdown /tmp/trace.json --pid <PID>
```

Shows every pool (size + effective_size), then drills into the **V8 isolate
heaps** (`v8/main/heap`, `v8/workers/heap`, `v8/utility/heap`, `v8/shared`), the
**PartitionAlloc partitions** (`buffer`, `array_buffer`, ...), and **Blink GC**.
Use this to decide which pool to chase: if `v8` dominates, the growth is JS
objects (look at the CPU profile / a V8 heap snapshot, not `heaps_v2`); if
`malloc`/`partition_alloc` dominate, continue to step 3.

### 3. See where native (malloc) allocations come from

```bash
# defaults to the max-memory process; or pass --pid N
python3 helpers/analyze_memory.py heap /tmp/trace.json --pid <PID> --top 40
```

`heaps_v2` is the **native (malloc/PartitionAlloc) heap-profiler** — it explains
the `malloc`/`partition_alloc` pools, **not** the V8 JS heap. Each sample carries
a size, a count, and a leaf stack node; the helper walks the node→parent tree and
aggregates sampled bytes by call stack (`--by stack`) or by leaf frame
(`--by leaf`). After step 1 the stacks read as function names; before it, as
`pc:<hex>`. This is **sampled** data (Poisson sampler per `memory_dump_config`),
so treat sizes as proportional, not exact.

Two structural details the helper already handles — keep them in mind if you
write custom queries against `heaps_v2`:
- **The `maps` (nodes/strings/types) are cumulative/incremental.** The first
  detailed dump for a process carries the full dictionary; later periodic dumps
  have **empty `maps`** and reference those node ids globally. You must merge
  `maps` across all of a process's dumps before resolving any sample, or every
  stack collapses to `??`.
- **The innermost 5–6 frames are allocator/sampler plumbing**
  (`SamplingHeapProfiler::CaptureStackTrace` → `PoissonAllocationSampler` →
  `allocator::dispatcher` → `operator new`/`MallocZoneMalloc`). They are
  identical on every stack; the helper strips them so the real allocation site
  surfaces.

> Also note: `private_footprint` lives in frequent **light** dumps while the full
> allocator tree + `heaps_v2` live in periodic **detailed** dumps (whose
> `process_totals` may read 0). The helper takes footprint from the peak light
> dump and the pool breakdown from the richest detailed dump.

### 4. Correlate with the CPU profile (perfetto SQL)

```bash
TP=…/perfetto/out/<build>/trace_processor_shell
"$TP" /tmp/trace.json -q queries/processes_overview.sql        # pid → cpu_samples
# edit the pid literal in these, then:
"$TP" /tmp/trace.json -q queries/cpu_self_hot.sql              # hottest leaf fns
"$TP" /tmp/trace.json -q queries/cpu_inclusive_hot.sql         # fn anywhere on stack
```

Run trace_processor against the **same** (symbolized) `/tmp/trace.json` so pids
line up. Match the allocation hot stacks from step 3 against the CPU hot
functions: allocation-heavy paths that are also CPU-hot are the strongest
suspects (e.g. module compilation / source-map parsing allocating and burning
CPU at the same time).

## Worked example (the reference trace, fully symbolized)

`code-oss-…​.trace.txt`, 11 processes, symbols `electron-v42.2.0-darwin-arm64`:

| step | finding |
| --- | --- |
| rank | **pid 37043 (Utility / extension host), 891 MB footprint** — but the pool split is **v8 637 MB**, malloc 146 MB. The V8 JS heap, not malloc, is ~80% of it. Renderer (pid 37001) 683 MB = malloc 344 / v8 203 / partition_alloc 178 / cc 93 / blink_gc 50 / gpu 13. |
| breakdown 37043 | `v8/utility/heap` = **629 MB** (single V8 isolate JS heap). malloc 146 MB. So this is a **JS-heap** problem, not a native-leak problem. |
| breakdown 37001 | partition_alloc splits into `buffer` 147 MB + `array_buffer` 31 MB; v8 main heap 185 MB; blink_gc main heap 47 MB. |
| heap (37043 native, malloc only) | of the 86 MB *sampled* malloc, ≈30–35 MB is the CPU profiler's own structures (`CpuProfile::SampleInfo`, `ProfileTree`, `ProfilerListener::CodeCreateEvent`, `SourcePositionTable`) — observer effect from `v8.cpu_profiler`; the rest is `node::StringBytes::Encode`/`DecodeUTF8` and V8 page allocation. |
| cpu | self: `readFileUtf8`, `wrapSafe`, `compileSourceTextModule`, `SourceMapConsumer_parseMappings`; inclusive: `Module._load` → `require` → `Module._compile`. |
| conclusion | The extension host is the heaviest process and its memory is dominated by the **V8 JS heap** (629 MB), driven by loading/compiling many modules — the same module-load path that dominates its CPU. To chase the JS heap further, use a V8 heap snapshot (the `heap-snapshot-analysis` skill), not `heaps_v2` (which only covers native malloc). |

> Pick the pool that dominates: **v8** → JS heap (heap snapshot); **malloc /
> partition_alloc** → native `heaps_v2` provenance (step 3); **cc / gpu** →
> compositor/GPU buffers. Cross-check native allocation sites against CPU-hot
> functions — paths that are both are the real drivers.

## Notes / pitfalls

- **Memory lives in multiple pools.** Never report `malloc` as "the memory".
  Always run `rank`/`breakdown` to see v8 / partition_alloc / blink_gc / cc / gpu.
  `heaps_v2` (step 3) only explains the **native** (malloc/PartitionAlloc) pools;
  it does **not** cover the V8 JS heap — for that use a V8 heap snapshot.
- Always operate on a **copy** (`/tmp/trace.json`); `symbolize_trace` edits in
  place and writes a `.BACKUP`.
- The trace is large (100s of MB). `analyze_memory.py` loads it once with
  `json.load`; if a trace exceeds available RAM, stream the `traceEvents` array
  instead.
- Discount **profiler observer effect**: the `v8.cpu_profiler` category makes the
  profiled process allocate its own sample/profile-tree structures, which show
  up as native heap (`CpuProfile::SampleInfo`, `ProfileTree`, `ProfilerListener`,
  `SourcePositionTable`). This is profiling cost, not product memory.
- If you need the structured perfetto **memory_snapshot** / **v8** tables, the
  trace must be a native perfetto protobuf recording (memory_snapshot +
  `dev.v8.code` data sources), not a Chrome-JSON content-tracing trace.
- Clean up `/tmp/trace.json*` when done.
