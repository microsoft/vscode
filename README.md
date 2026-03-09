# Son of Anton

An AI-native code editor forked from [VS Code (Code OSS)](https://github.com/microsoft/vscode). Son of Anton integrates Claude-powered agents directly into the development workflow through a graph-based code intelligence layer, semantic search, and the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## What It Does

Son of Anton provides orchestrated AI agents — code review, refactoring, exploration, testing, and more — backed by a code knowledge graph and vector search, all running locally alongside the editor.

**Who it's for:** Developers who want deep AI assistance that understands their entire codebase, not just the open file.

## Architecture

All AI capabilities are built as standalone services that communicate through well-defined protocols. The VS Code fork is a thin integration layer. This minimises merge conflicts when pulling upstream updates and allows services to be developed and tested independently.

### Technology Stack

| Technology | Role |
|---|---|
| **FalkorDB** | Graph database for code structure (AST nodes, call graphs, dependencies) |
| **Qdrant** | Vector database for semantic code search |
| **Tree-sitter** | Incremental parsing for real-time code intelligence |
| **LSIF/SCIP** | Precise cross-references (go-to-definition, find-references) |
| **MCP** | Standard protocol for exposing tools to LLMs |
| **Claude (Anthropic)** | Primary LLM with model routing across Opus, Sonnet, and Haiku |

### Services

The backend is composed of containerised services managed via Docker Compose:

| Service | Port | Description |
|---|---|---|
| **FalkorDB** | 6379 | Code knowledge graph storage |
| **Qdrant** | 6333 / 6334 | Vector search for semantic code queries |
| **Indexer** | 8080 | Parses and indexes codebases into the graph and vector store |
| **LSIF** | 8081 | Language Server Index Format processor |
| **MCP Gateway** | 3100 | Central MCP server for agent tool access |
| **Model Router** | 3200 | Routes LLM requests to the appropriate Claude model |
| **Checkpoints** | 3201 | Workspace checkpoint and rollback service |
| **Walkthrough** | 3202 | Guided walkthrough generation |
| **ACP Client** | 3300 | Agent Communication Protocol client |
| **Build DAG** | 3301 | Build dependency graph analysis |
| **Context Sanitiser** | 3302 | Strips secrets and sensitive data from LLM context |
| **Spec Pipeline** | 8090 | Specification-driven development pipeline |
| **Penetration Tester** | 8092 | Automated security testing via OWASP ZAP |
| **Background Tasks** | 8093 | Long-running async agent tasks |
| **Visual Regression** | 8094 | Screenshot diffing for UI changes |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (see `.nvmrc` for the required version)
- [Docker](https://www.docker.com/) and Docker Compose
- [Git](https://git-scm.com/)

### Start Backend Services

```bash
# Start all backend services
docker compose up -d

# Check service health
docker compose ps

# View logs
docker compose logs -f
```

### Build the Editor

Follow the standard [VS Code build instructions](https://github.com/microsoft/vscode/wiki/How-to-Contribute#build-and-run) to build from source:

```bash
yarn
yarn watch
```

### Tear Down

```bash
# Stop services and remove all data
docker compose down -v
```

## Repository Map

| Repository | Purpose |
|---|---|
| **Son-Of-Anton** (this repo) | Main IDE (VS Code fork) and backend services |
| **son-of-anton-mcp** | MCP server definitions |
| **son-of-anton-agents** | Agent definitions and shared LLM client |

## Contributing

Contributions are welcome. All changes are classified into tiers based on merge conflict risk:

- **Tier 1** — New files alongside core (services, extensions, config, docs). Zero merge conflict risk.
- **Tier 2** — Hooks into existing VS Code modules (new imports, extension points, menu items). Low risk, human review required.
- **Tier 3** — Direct modifications to core VS Code source files. High risk, requires written justification.

Every PR description must state which tier of modification it contains and include a test plan.

See [CLAUDE.md](CLAUDE.md) for full coding standards and architecture details.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.
