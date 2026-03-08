# Son of Anton

## Project Overview

Son of Anton is an AI-native code editor forked from VS Code (Code OSS). It integrates Claude-powered agents directly into the development workflow through a graph-based code intelligence layer, semantic search, and the Model Context Protocol (MCP).

**Who it's for:** Developers who want deep AI assistance that understands their entire codebase — not just the open file.

**What it does:** Provides orchestrated AI agents (code review, refactoring, exploration, testing) backed by a code knowledge graph and vector search, all running locally alongside the editor.

## Architecture Decisions

### Services-first, fork-second

All AI capabilities are built as standalone services that communicate through well-defined protocols. The VS Code fork is a thin integration layer. This minimises merge conflicts when pulling upstream updates and allows services to be developed and tested independently.

### Technology choices

- **FalkorDB** — Graph database for code structure (AST nodes, call graphs, dependency relationships). Chosen for its Redis-compatible protocol, Cypher query support, and low memory footprint.
- **Qdrant** — Vector database for semantic code search. Chosen for its gRPC support, filtering capabilities, and efficient HNSW indexing.
- **Tree-sitter** — Incremental parsing for real-time code intelligence. Chosen because it's fast, supports 100+ languages, and produces concrete syntax trees.
- **LSIF/SCIP** — Language Server Index Format for precise cross-references (go-to-definition, find-references). Complements Tree-sitter's structural parsing with type-aware analysis.
- **MCP (Model Context Protocol)** — Standard protocol for exposing tools to LLMs. Allows agents to query the code graph and vector store through a uniform interface.
- **Claude (Anthropic)** — Primary LLM. Chosen for extended thinking, tool use, and the ability to route between Opus/Sonnet/Haiku based on task complexity.

## Modification Tier Policy

All changes to this codebase are classified into tiers based on merge conflict risk:

### Tier 1 — New files alongside core (target: 75% of changes)
- New services in `services/`
- New extensions in `extensions/`
- New files in `src/vs/sessions/`
- Configuration files, documentation
- **Zero merge conflict risk.** No review gate beyond CI.

### Tier 2 — Hooks into existing code (target: 20% of changes)
- Adding imports or extension points to existing VS Code modules
- Registering new contributions in existing registries
- Adding new menu items, commands, keybindings
- **Low merge conflict risk.** Human review required.

### Tier 3 — Direct core patches (target: <5% of changes)
- Modifying existing VS Code source files
- Changing build scripts or configuration
- Altering existing UI components
- **High merge conflict risk.** Requires written justification and senior engineer review.

Every PR description must state which tier of modification it contains.

## Coding Standards

### Languages
- **IDE and extensions:** TypeScript
- **Backend services:** TypeScript (Node.js)
- **MCP servers:** TypeScript or Python

### Formatting
- Use tabs for indentation (matching upstream VS Code convention)
- Use Prettier and ESLint with the project's existing configuration
- Use single quotes for internal strings, double quotes for user-facing localised strings

### Naming
- PascalCase for types, enums, classes
- camelCase for functions, methods, properties, local variables
- Use whole words — no abbreviations unless universally understood

### File organisation
- Services live in `services/<service-name>/`
- Each service has its own `Dockerfile`, `package.json`, and health endpoint
- Agent definitions live in a separate `son-of-anton-agents` repository
- MCP server definitions live in a separate `son-of-anton-mcp` repository

### Testing
- Every new function needs tests
- Use `describe` and `test` blocks consistently with existing patterns
- Prefer snapshot-style `assert.deepStrictEqual` over many small assertions
- Integration tests for services must run against the Docker Compose stack

## Forbidden Patterns

- **No direct network calls to Microsoft domains** — all telemetry and update endpoints must be removed or redirected
- **No telemetry without explicit opt-in** — respect user privacy
- **No storing secrets in source code** — use environment variables and `.env` files (never committed)
- **No Tier 3 modifications without written justification** — document why the change can't be Tier 1 or 2
- **No agent-generated code merged without review agent passing** — all AI-authored code must pass automated review
- **No extension installs outside the allowlist** — see `extensions-allowlist.json`

## Agent Instructions

### Model routing

| Task type | Model | Rationale |
|---|---|---|
| Orchestrator planning, complex reasoning | Opus | Highest capability |
| Code generation, refactoring, test writing | Sonnet | Best balance of capability and cost |
| Exploration, quick completions, summaries | Haiku | Fastest, cheapest |

### Token budget guidance
- Use graph context routing to include only relevant code in prompts
- Structure prompts for maximum cache hit rates: system prompt (static) > CLAUDE.md (static per session) > graph context (semi-static) > dynamic content
- Break-even for prompt caching is 2 API calls — always enable it

### Autonomy guidelines
- **Proceed autonomously:** Tier 1 changes, formatting fixes, test additions, documentation updates
- **Ask for human input:** Tier 2+ changes, architectural decisions, ambiguous requirements, security-sensitive changes
- **Error handling:** Max 3 retries on any operation, then escalate to human

### Rate limits
- Max 5 concurrent API requests
- Max 30 requests per minute per agent
- Configurable spend cap per session (kill switch)

## PR Process

1. All PRs require CI to pass
2. **Tier 1 changes:** Agent review sufficient
3. **Tier 2 changes:** Human review required
4. **Tier 3 changes:** Senior engineer review required
5. Every PR description must state which tier of modification it contains
6. Every PR must include a test plan

## Docker Compose Quick Reference

```bash
# Start all backend services
docker compose up -d

# Check service health
docker compose ps

# View logs
docker compose logs -f

# Tear down and remove all data
docker compose down -v

# Test FalkorDB
docker compose exec falkordb redis-cli GRAPH.QUERY son-of-anton "RETURN 1"

# Test Qdrant
curl http://localhost:6333/readyz
```

## Repository Map

| Repository | Purpose |
|---|---|
| `Son-Of-Anton` | Main IDE (VS Code fork) |
| `son-of-anton-graph` | Docker Compose stack, graph services, indexer |
| `son-of-anton-mcp` | MCP server definitions |
| `son-of-anton-agents` | Agent definitions and shared LLM client |
