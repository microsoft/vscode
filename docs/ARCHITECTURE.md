# Architecture v0
Editor (VS Code fork) → SparkCore (planner/coder/reviewer/tester) → Tools (read/write/test) → Sandbox (optional).

```
┌─────────────────┐
│   VS Code Fork  │  
│   (Editor UI)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   SparkCore     │  Orchestration layer
│  ┌───────────┐  │
│  │ Planner   │  │  Intent → task breakdown
│  │ Coder     │  │  File edits
│  │ Reviewer  │  │  Diff validation
│  │ Tester    │  │  TestGen + execution
│  └───────────┘  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Tools       │  File I/O, search, git, test runner
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Sandbox      │  Optional isolated execution
│  (local Docker) │
└─────────────────┘
```

## Principles
- Local-first: all processing on device by default
- Cloud opt-in: telemetry, model API, sync
- Privacy: no code upload without explicit toggle
