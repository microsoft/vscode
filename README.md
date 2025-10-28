# Spark
AI-native developer workspace that plans, edits, tests, and ships code — with guardrails.

**Built on VS Code** | [Roadmap](ROADMAP.md) | [Architecture](docs/ARCHITECTURE.md) | [Security](SECURITY.md)

## What is Spark?

Spark is a VS Code fork enhanced with an AI-native workflow engine (SparkCore) that understands your intent, breaks down tasks, generates code and tests, and helps you ship faster — all while keeping your code local-first by default.

### North-Star Metric
**Shipped Value Rate (SVR)**: AI-assisted merges per active developer per week.

### Activation Target
First plan → diff → tests → PR in ≤20 minutes.

## Quickstart

### Editor (VS Code fork)
Follow the existing [VS Code build instructions](CONTRIBUTING.md) to build the editor.

### Landing page
```bash
cd apps/www
npm install
npm run dev
```

Visit `http://localhost:3000`

## Repository Structure

```
Spark/
├── apps/www/           # Minimal landing page (Next.js)
├── packages/config/    # Shared configs (ESLint, Prettier, TSConfig)
├── docs/               # Architecture, ADRs, guides
├── src/                # VS Code fork source
├── extensions/         # VS Code extensions + Spark extensions
└── scripts/            # Build and utility scripts
```

## Contributing

### Branch Conventions
- `feat/<scope>-<slug>` for new features
- `fix/<slug>` for bug fixes  
- `chore/<slug>` for infrastructure/tooling

### Commit Conventions
Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new capability
- `fix:` bug fix
- `chore:` tooling, dependencies, refactor
- `docs:` documentation only

### Pull Requests
- Small, single-purpose PRs
- CI must pass (lint, typecheck, test, build)
- PRs required to merge to `main`

See the existing [VS Code contribution guide](CONTRIBUTING.md) for editor-specific guidelines.

## Milestones

- **Q4 2025**: Repo Graph v1, chat+diff, TestGen; private alpha
- **Q1 2026**: SparkPilot v1, local sandbox; Pro pricing
- **Q2 2026**: Planner v2, Lens traces, rollbacks; 1.5k WAD, $10k MRR  
- **Q3 2026**: Incorporation (3k WAD, $25k MRR, D30 ≥ 35%)

See [ROADMAP.md](ROADMAP.md) for details.

## VS Code Foundation

Spark is built on the [VS Code OSS](https://github.com/microsoft/vscode) foundation. The core editor retains all VS Code capabilities, with SparkCore layered on top for AI-native workflows.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.
