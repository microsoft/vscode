# Parallel Agent Execution Benchmark Results

Benchmark suite for validating the parallel execution approach.
Results compare sequential (single agent) vs parallel (2 agents) execution.

**Target:** conflict rate < 10%

---

## Benchmark Configuration

- **Max concurrent agents:** 2
- **Lock TTL:** 10 minutes
- **Conflict check interval:** 15 seconds
- **Worktree location:** system temp directory

## Test Cases

| # | Description | Files Involved | Complexity |
|---|------------|---------------|------------|
| 1 | Add error handling to two independent modules | 2 files | Low |
| 2 | Refactor function signatures across caller chain | 4 files | Medium |
| 3 | Add tests for two unrelated components | 4 files | Low |
| 4 | Update API types and their consumers | 6 files | Medium |
| 5 | Add logging to two separate services | 4 files | Low |
| 6 | Migrate callback-style to async/await in two modules | 4 files | Medium |
| 7 | Add input validation to two API endpoints | 4 files | Low |
| 8 | Refactor shared utility and update all callers | 8 files | High |
| 9 | Add documentation for three independent modules | 6 files | Low |
| 10 | Cross-module type rename with dependent tests | 10 files | High |

## Results

> **Status:** Pending — run `npm run benchmark:parallel` to populate.

| Test | Sequential (avg) | Parallel (avg) | Speedup | Conflicts | Merge Success |
|------|-----------------|----------------|---------|-----------|---------------|
| 1 | — | — | — | — | — |
| 2 | — | — | — | — | — |
| 3 | — | — | — | — | — |
| 4 | — | — | — | — | — |
| 5 | — | — | — | — | — |
| 6 | — | — | — | — | — |
| 7 | — | — | — | — | — |
| 8 | — | — | — | — | — |
| 9 | — | — | — | — | — |
| 10 | — | — | — | — | — |

## Aggregate Metrics

| Metric | Value |
|--------|-------|
| Average parallel speedup | — |
| Overall conflict rate | — |
| Merge success rate | — |
| Average token usage (sequential) | — |
| Average token usage (parallel) | — |

## Analysis

> To be completed after benchmark runs.
