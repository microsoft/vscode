# Son of Anton — Team Guide

## Getting Started

### Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- Git
- An Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/CodeHalwell/Son-Of-Anton.git
cd Son-Of-Anton

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start backend services
docker compose up -d

# Verify services are healthy
docker compose ps
```

### First Run

1. Open Son of Anton (Code OSS).
2. The backend services (FalkorDB, Qdrant, MCP Gateway, Indexer) start automatically via Docker Compose.
3. Wait for the indexer to finish its initial pass (check `docker compose logs -f indexer`).
4. Open the chat panel and type `@anton hello` to verify the orchestrator responds.

---

## Agent Commands

### Orchestrator (`@anton`)

| Command | Description |
|---------|-------------|
| `@anton <request>` | Submit a request for planning and execution |
| `@anton /plan <request>` | Create an execution plan without executing |
| `@anton /approve` | Approve and execute the current plan |
| `@anton /status` | Show status of active agents |
| `@anton /metrics` | Show agent performance metrics |

### Specialist Agents

| Agent | Handle | Commands |
|-------|--------|----------|
| Code Generator | `@anton-code` | `/generate`, `/refactor` |
| Test Writer | `@anton-test` | `/test`, `/coverage` |
| Security Scanner | `@anton-security` | `/scan`, `/audit` |
| Documentation | `@anton-docs` | `/document`, `/changelog` |
| E2E Tests | `@anton-e2e` | `/e2e`, `/visual` |
| CI/CD | `@anton-ci` | `/ci-status`, `/ci-fix` |
| PR Generation | `@anton-pr` | `/pr` |
| Spec Pipeline | `@anton-spec` | `/spec`, `/requirements`, `/design`, `/tasks`, `/properties` |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Inline edit with AI |

### VS Code Commands

Access via Command Palette (`Ctrl+Shift+P`):

- `Son of Anton: Open Chat`
- `Son of Anton: Inline Edit`
- `Son of Anton: Show Agent Traces`
- `Son of Anton: Export Traces`
- `Son of Anton: Show Sandbox Terminal`
- `Son of Anton: Record Project Memory`
- `Son of Anton: Start Spec Pipeline`
- `Son of Anton: List Spec Features`
- `Son of Anton: Create Background Task`
- `Son of Anton: Show Background Task Results`
- `Son of Anton: Show Fleet Dashboard`

---

## Spec-Driven Workflow

### When to Use Specs

Use the spec pipeline for features that need requirements clarity, design review, or have multiple implementation steps. For quick fixes, direct coding with `@anton-code` is fine.

### Spec Pipeline Flow

1. **`@anton-spec /spec "Feature description"`** — starts the pipeline.
2. **Requirements phase** — generates EARS-style requirements. Review and approve.
3. **Design phase** — generates technical design. Review and approve.
4. **Tasks phase** — decomposes into implementation tasks. Approve to execute.

### Approving and Rejecting

When a spec phase completes, you can:
- **Approve:** move to the next phase.
- **Reject with feedback:** re-generate with your corrections.
- **Cancel:** abandon the pipeline.

---

## Hooks

### Configuration

Hooks are configured in `.son-of-anton/hooks/`:

- `pre-commit.json` — runs before git commits (security scanning, lint, test).
- `post-save.json` — runs after file saves (spec sync checking).

### Adding New Hooks

Create a JSON file in `.son-of-anton/hooks/` with:

```json
{
  "event": "pre-commit",
  "commands": ["npm run lint", "npm run test"],
  "blocking": true
}
```

### Per-User Overrides

Users can disable hooks locally via VS Code settings:

```json
{
  "sota.hooks.enabled": false
}
```

---

## Security

### How Scanning Works

The security scanner (`@anton-security`) runs automatically during the review phase. It checks for:

- OWASP Top 10 vulnerabilities
- Dependency vulnerabilities (supply chain)
- Secrets in code
- Insecure configurations

### Interpreting Findings

Findings are classified by severity:
- **Critical/High** — block merge, must fix.
- **Medium** — should fix, can be deferred with justification.
- **Low** — informational, fix when convenient.

### Overriding False Positives

Record a project memory entry to suppress false positives:

```
@anton /recordMemory
Category: convention
Content: security/rule-xyz is a false positive for our use case because...
```

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Agent not responding | Check `docker compose ps` — ensure all services are healthy |
| "No API key configured" | Set `ANTHROPIC_API_KEY` in `.env` or VS Code settings |
| Graph queries returning empty | Run `docker compose restart indexer` to re-index |
| High latency | Check `@anton /metrics` — consider downgrading task models |
| Merge conflicts in parallel execution | Review scope lock settings, reduce concurrent agents |

### Reading Agent Traces

Use `Son of Anton: Show Agent Traces` to view:
- Task decomposition decisions
- Model selection for each subtask
- MCP tool calls and responses
- Token usage per agent
- Latency breakdowns

### Resetting the Sandbox

```bash
# Remove all agent-generated changes
docker compose down -v
docker compose up -d

# Re-index the codebase
docker compose restart indexer
```

---

## Best Practices

### Writing Effective Prompts

- **Be specific:** "Add input validation to the `createUser` endpoint in `services/auth/`" is better than "add validation."
- **Include scope:** mention specific files or directories when possible.
- **State constraints:** "Must maintain backward compatibility" or "Should not modify the database schema."
- **One task at a time:** let the orchestrator decompose complex requests.

### When to Intervene vs. Let Agents Work

- **Let agents work:** standard code generation, test writing, documentation, refactoring within clear scope.
- **Intervene:** architectural decisions, security-sensitive changes, Tier 2+ modifications, ambiguous requirements.

### Managing Cost

- Use `@anton /metrics` to monitor token usage.
- Check the weekly cost report in `.son-of-anton/metrics/`.
- Documentation and exploration tasks use Haiku (cheapest).
- Only planning and complex reasoning use Opus.
- Cache hit rates above 90% reduce costs by up to 90% on repeated context.

---

## Monitoring and Reporting

### Cost Reports

Weekly cost reports are auto-generated in `.son-of-anton/metrics/cost-report-*.json`. They include:
- Total API spend
- Spend by model (Opus / Sonnet / Haiku)
- Spend by agent type
- Week-over-week comparison
- Projected monthly spend

### Health Monitoring

Health status is tracked for all backend services. Alerts fire for:
- FalkorDB or Qdrant down (critical)
- Code graph more than 1 hour stale (warning)
- MCP server unresponsive (critical)
- LLM API error rate above 5% (warning)
- Agent task failure rate above 20% (warning)

### Performance Profiling

Use the performance profiler to measure IDE performance under agent load:
- Memory usage across 0, 1, 2, 4 concurrent agents
- Graph query latency and optimization
- Input latency budget: must stay below 100ms with 4 agents

---

## Architecture Quick Reference

### Model Routing

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Planning, complex reasoning | Opus | Highest capability |
| Code generation, refactoring, tests | Sonnet | Best balance |
| Documentation, exploration, completions | Haiku | Fastest, cheapest |

### Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| FalkorDB | 6379 | Redis |
| Qdrant REST | 6333 | HTTP |
| Qdrant gRPC | 6334 | gRPC |
| MCP Gateway | 3100 | HTTP/SSE |
| Indexer | 8080 | HTTP |
| LSIF | 8081 | HTTP |
| Spec Pipeline | 8090 | HTTP |
| Pen Test | 8092 | HTTP |
| Background Tasks | 8093 | HTTP |
| Visual Regression | 8094 | HTTP |

### Docker Compose Commands

```bash
docker compose up -d          # Start all services
docker compose ps             # Check service health
docker compose logs -f        # View logs
docker compose down -v        # Tear down and remove data
docker compose restart <svc>  # Restart a single service
```
