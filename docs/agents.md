# Son of Anton — Specialist agents

Anton ships ten chat participants: the orchestrator (`@anton`) and nine
specialist agents. Each specialist owns a narrow domain and surfaces one
or more slash commands inside the native VS Code chat panel.

The canonical lists are:

- **Native chat participants** — `extensions/son-of-anton/package.json`
  (`contributes.chatParticipants`).
- **Default model + slash commands per agent** — `AGENT_CONFIGS` in
  `extensions/son-of-anton/src/agents/AgentStackFactory.ts`.
- **Specialist registry (system prompts)** — `SPECIALIST_ROLES` in
  `extensions/son-of-anton/src/chat/specialistRegistry.ts`.

If you change one, change all three.

## Orchestrator

| Property | Value |
| --- | --- |
| Handle | `@anton` |
| Display name | Anton |
| Default model | `opus` |
| Sticky | yes (default participant in the chat panel) |
| Description | AI orchestrator — routes requests to specialist agents |

Slash commands surfaced in native chat:

- `/plan` — Create an execution plan for a request.
- `/approve` — Approve and execute the current plan.
- `/status` — Show status of active agents.
- `/metrics` — Show agent performance metrics.

The orchestrator decomposes a request into a JSON plan, presents it for
developer approval, scope-locks files, then dispatches subtasks to
specialists with dependency ordering. It registers each of the eight
in-stack specialists below plus a separate review agent (`anton-review`,
not surfaced as a chat participant) used to vet generated changes.

## Specialists

### Anton Code (`@anton-code`)

| Property | Value |
| --- | --- |
| Display name | Anton Code |
| Default model | `sonnet` |
| Description | Code generation specialist — writes and modifies code |

Slash commands: `/generate`, `/refactor`. Generates diffs (not full files)
inside `diff` fences and uses `<!-- CREATE: path -->` markers for new
files.

### Anton Test (`@anton-test`)

| Property | Value |
| --- | --- |
| Display name | Anton Test |
| Default model | `sonnet` |
| Description | Test writing specialist — generates comprehensive tests |

Slash commands: `/test`, `/coverage`. Targets the project's existing test
framework, prefers snapshot-style `assert.deepStrictEqual`, and adds tests
to existing files when present.

### Anton E2E (`@anton-e2e`)

| Property | Value |
| --- | --- |
| Display name | Anton E2E |
| Default model | `sonnet` |
| Description | E2E test specialist — generates browser-based end-to-end tests |

Slash commands: `/e2e`, `/visual`. Writes Playwright tests using
accessibility locators (`getByRole`, `getByLabel`), captures screenshots
at checkpoints for visual regression, and explores the page via the
accessibility tree before writing assertions.

### Anton Security (`@anton-security`)

| Property | Value |
| --- | --- |
| Display name | Anton Security |
| Default model | `sonnet` |
| Description | Security analysis specialist — scans for vulnerabilities |

Slash commands: `/scan`, `/audit`. Scans for OWASP Top 10
vulnerabilities, classifies findings by severity (`critical`, `high`,
`medium`, `low`), and emits a structured JSON report. Critical / high
findings are blocking.

### Anton Docs (`@anton-docs`)

| Property | Value |
| --- | --- |
| Display name | Anton Docs |
| Default model | `haiku` |
| Description | Documentation specialist — generates and updates docs |

Slash commands: `/document`, `/changelog`. Picks the appropriate doc
format per language (JSDoc, Python docstrings, Rust doc comments) and
emits a changelog entry as part of every response.

### Anton CI (`@anton-ci`)

| Property | Value |
| --- | --- |
| Display name | Anton CI |
| Default model | `sonnet` |
| Description | CI/CD specialist — monitors pipelines and fixes failures |

Slash commands: `/ci-status`, `/ci-fix`. Classifies CI failures (test,
build, lint, flaky), reads the full failure log before attempting a fix,
flags flaky tests with `@flaky`, and produces minimal targeted diffs.

### Anton PR (`@anton-pr`)

| Property | Value |
| --- | --- |
| Display name | Anton PR |
| Default model | `sonnet` |
| Description | PR generation specialist — creates merge-ready pull requests |

Slash commands: `/pr`. Produces PR descriptions in a fixed format
(`Summary`, `Changes`, `Specs`, `Testing`, `Modification Tier`, `Agent
Trace`) so the modification-tier policy from `CLAUDE.md` is enforced for
every Son-of-Anton-authored PR.

### Anton Moderniser (`@anton-moderniser`)

| Property | Value |
| --- | --- |
| Display name | Anton Moderniser |
| Default model | `sonnet` |
| Description | Legacy code modernisation specialist |

Slash commands: `/modernise`, `/modernize` (US spelling),
`/next-phase`, `/phase-status`. Runs a fixed multi-phase pipeline
(Analysis → Documentation → Test scaffolding → Refactor → Verification)
one phase at a time, never proceeding without a green safety net of tests.

### Anton Spec (`@anton-spec`)

| Property | Value |
| --- | --- |
| Display name | Anton Spec |
| Default model | `sonnet` (via `SpecPipelineManager`) |
| Description | Spec pipeline specialist — generates EARS requirements, technical designs, and implementation tasks |

Slash commands: `/spec`, `/requirements`, `/design`, `/tasks`,
`/properties`. Orchestrates three sub-agents in sequence — Requirements
(EARS format) → Design → Task Decomposition — pausing for developer
approval between phases. Persists artefacts under
`.son-of-anton/specs/<feature>/` so other agents can read them on a later
turn.

`@anton-spec` is **not** registered as a long-lived `BaseAgent` in the
agent stack. It surfaces through the chat sidebar via
`SPECIALIST_ROLES` and through native chat via the package
`chatParticipants` contribution; the actual pipeline runs through
`SpecPipelineManager` and dedicated sub-agents (`RequirementsAgent`,
`DesignAgent`, `TaskDecompositionAgent`).

## Review agent (`anton-review`)

The review agent is registered inline by `AgentStackFactory` with default
model `sonnet`. It is **not** exposed as a chat participant — the
orchestrator calls it directly to vet changes produced by other
specialists before they are surfaced to the user. Its presence here is so
metrics and traces report it under its own handle for clarity.

## Adding a new specialist

To add a new specialist agent:

1. Create the agent class extending `BaseAgent` in
   `extensions/son-of-anton/src/agents/`.
2. Add an `AgentConfig` entry to `AGENT_CONFIGS` in
   `AgentStackFactory.ts`, instantiate the agent in `createAgentStack`,
   register it on the orchestrator, and add it to the `specialists`
   map and `registrations` array.
3. Add a `SpecialistRole` to `SPECIALIST_ROLES` in
   `chat/specialistRegistry.ts` with a system-prompt role description.
4. Add a `chatParticipants` entry to
   `extensions/son-of-anton/package.json` so the native chat surface
   discovers it.
5. Update this document and the orchestrator's specialist list (the
   `ORCHESTRATOR_SPECIALIST_LIST` constant in `specialistRegistry.ts`).
