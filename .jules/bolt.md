## 2024-04-22 - O(N*M) nested iterations in array filtering for notebook cell selections
**Learning:** Checking for element presence with `Array.prototype.includes()` inside an `Array.prototype.filter()` callback over another large array creates an O(N*M) time complexity bottleneck. This occurs in UI selection logic like notebook cell selections, blocking the main thread when many elements are involved.
**Action:** When filtering a large array against another large array, always convert the target array to a `Set` first and use `Set.has()` instead of `includes()`. This reduces time complexity to O(N+M).

## 2024-05-24 - N+1 Query Problem in Cypher
**Learning:** Found a major N+1 query loop in `services/indexer/src/writers/graphWriter.ts` inside `writeCallSites`, mapping array of calls to sequential db writes. Replaced with `UNWIND`. When testing optimizations with scratchpad benchmark files, always remove them before creating PR to avoid repository pollution and failing code review constraints.
**Action:** Always clean up local scratchpads and benchmark files. Cypher batch modifications are very safe for these graphs when implemented exactly matching original mapping logic.
