-- Probe which structured tables perfetto populated for this trace.
-- IMPORTANT: for Chrome JSON traces produced by Electron `contentTracing`
-- (Developer: Start Heap Tracing), the memory-infra and V8 *tables* below are
-- EMPTY. perfetto's JSON importer only fills the CPU-profiler stack tables.
--   * memory-infra allocator sizes + heaps_v2 -> NOT imported (parse the JSON
--     with helpers/analyze_memory.py instead).
--   * __intrinsic_v8_* tables -> only populated by the `dev.v8.code` perfetto
--     data source, which Chrome/Electron category tracing does not emit.
-- These tables ARE populated when the input is a native perfetto protobuf trace
-- that recorded the memory_snapshot data source and the dev.v8.code data source.
SELECT 'process'                  AS tbl, count(*) AS rows FROM process
UNION ALL SELECT 'cpu_profile_stack_sample', count(*) FROM cpu_profile_stack_sample
UNION ALL SELECT 'stack_profile_frame',      count(*) FROM stack_profile_frame
UNION ALL SELECT 'stack_profile_callsite',   count(*) FROM stack_profile_callsite
UNION ALL SELECT 'process_memory_snapshot',  count(*) FROM process_memory_snapshot
UNION ALL SELECT 'memory_snapshot_node',     count(*) FROM memory_snapshot_node
UNION ALL SELECT 'heap_profile_allocation',  count(*) FROM heap_profile_allocation
UNION ALL SELECT '__intrinsic_v8_isolate',     count(*) FROM __intrinsic_v8_isolate
UNION ALL SELECT '__intrinsic_v8_js_function', count(*) FROM __intrinsic_v8_js_function
UNION ALL SELECT '__intrinsic_v8_js_code',     count(*) FROM __intrinsic_v8_js_code;
