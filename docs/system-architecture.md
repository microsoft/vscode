# System Architecture

**Last Updated**: 2026-01-28
**Version**: 2.9.0-beta.2
**Project**: ClaudeKit Engineer

## Overview

ClaudeKit Engineer implements a multi-agent AI orchestration architecture where specialized agents collaborate through a file-based communication protocol. The system enables developers to leverage AI assistance throughout the entire software development lifecycle - from planning and implementation to testing, review, and deployment.

## Architectural Pattern

### Pattern Classification
**Primary Pattern**: Microservices-inspired Agent Architecture
**Secondary Patterns**:
- Command Pattern (slash commands)
- Observer Pattern (agent communication)
- Strategy Pattern (workflow selection)
- Template Method Pattern (agent workflows)

### Design Philosophy
- **Decoupled Agents**: Each agent is independent and specialized
- **File-Based Communication**: Agents communicate via markdown reports
- **Workflow Orchestration**: Coordinated agent execution (sequential/parallel)
- **Configuration-Driven**: Agents and commands defined in markdown
- **AI-First Development**: Leverage AI at every stage of SDLC

## System Components

### 1. Core Layer

#### 1.1 CLI Interface
**Location**: Claude Code / Open Code CLI
**Responsibility**: User interaction and command routing
**Key Functions**:
- Parse slash commands
- Route to appropriate agent workflows
- Display results to users
- Manage conversation context

**Technology**: Anthropic Claude Code CLI / OpenCode AI CLI

#### 1.2 Command Parser
**Location**: Built into CLI
**Responsibility**: Command interpretation and argument extraction
**Input**: Slash command with arguments (`/command arg1 arg2`)
**Output**: Parsed command and argument values
**Argument Variables**:
- `$ARGUMENTS` - All arguments as single string
- `$1, $2, $3...` - Individual positional arguments

#### 1.3 Configuration Manager
**Location**: `.claude/` directory
**Responsibility**: Load agent and command definitions
**File Types**:
- Agent definitions (`.md` with YAML frontmatter)
- Command definitions (`.md` with embedded agent calls)
- Skill modules (knowledge bases)
- Workflow templates
- Hook diagnostics logs (`.claude/hooks/.logs/hook-log.jsonl`)

#### 1.4 Hook Runtime Diagnostics
**Location**: `.claude/hooks/lib/hook-logger.cjs` and `.claude/hooks/.logs/hook-log.jsonl`
**Responsibility**: Persist structured hook execution telemetry for local inspection and downstream dashboard consumption
**Current Coverage**:
- `PreToolUse`: `scout-block`, `privacy-block`, `descriptive-name`
- `PostToolUse`: `post-edit-simplify-reminder`, `plan-format-kanban`, `usage-context-awareness`
- `UserPromptSubmit`: `dev-rules-reminder`, `usage-context-awareness`

**Log Contract**:
- One JSON object per line
- Common fields: `ts`, `hook`, `event`, `tool`, `target`, `note`, `dur`, `status`, `exit`, `error`
- Fail-open behavior preserved: diagnostics must never block normal hook execution

### 2. Agent Layer

#### 2.1 Agent Types (14 Agents)

**Planning Agents**:
- `planner` - Technical planning and architecture (Opus)
- `researcher` - Research and analysis
- `brainstormer` - Solution ideation

**Implementation Agents**:
- `fullstack-developer` - Full-stack implementation
- `ui-ux-designer` - Design creation and UX analysis
- `code-simplifier` - Code optimization and simplification

**Quality Assurance Agents**:
- `code-reviewer` - Code quality assessment and standards
- `tester` - Test creation and execution
- `debugger` - Issue analysis, root-cause diagnosis

**Documentation & Operations Agents**:
- `docs-manager` - Documentation maintenance (Gemini)
- `journal-writer` - Development decision journaling
- `git-manager` - Version control and commit management
- `project-manager` - Progress tracking and oversight
- `mcp-manager` - MCP server management and integration

#### 2.2 Agent Definition Structure

```yaml
---
name: agent-name
description: Agent purpose and use cases
mode: subagent | all
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
---

# Agent instructions in markdown
## Core Responsibilities
## Workflow Process
## Output Requirements
## Quality Standards
```

**Agent Modes**:
- `subagent`: Spawned by other agents, runs independently
- `all`: Can be invoked as main or sub agent

**Model Selection**:
- `claude-sonnet-4-20250514` - Fast, efficient (most agents)
- `claude-opus-4-1-20250805` - Advanced reasoning (planner-researcher)
- `google/gemini-2.5-flash` - Cost-effective (docs-manager)
- `grok-code` - Specialized (git-manager)

#### 2.3 Agent Communication Protocol

**Communication Medium**: File system (markdown files)
**Report Location**: `./plans/<plan-name>/reports/`
**Naming Convention**: `{date}-from-[source]-to-[dest]-[task]-report.md`

**Report Structure**:
```markdown
# Task Report: [Task Name]

**From**: [Source Agent]
**To**: [Destination Agent]
**Date**: YYYY-MM-DD
**Status**: [Complete|In Progress|Blocked]

## Summary
Brief overview of findings/results

## Details
Comprehensive information

## Recommendations
Actionable next steps

## Concerns
Issues, blockers, or questions
```

**Communication Patterns**:
1. **Request-Response**: Agent A requests, Agent B responds
2. **Broadcast**: Agent publishes report for multiple consumers
3. **Chain**: Sequential handoffs (A → B → C)
4. **Fan-Out**: Parallel execution (A spawns B, C, D)
5. **Fan-In**: Collect results from parallel agents

### 3. Command Layer

#### 3.1 Command Categories

**Core Development**:
- `/ck:plan` - Research and planning
- `/ck:cook` - Feature implementation
- `/ck:test` - Test execution
- `/ck:ask` - Technical consultation
- `/ck:bootstrap` - Project initialization
- `/ck:brainstorm` - Solution ideation
- `/ck:debug` - Deep analysis

**Skill Directories** (`.claude/skills/`):
- `bootstrap/` - Project initialization workflows
- `docs/` - Documentation workflows
- `plan/` - Planning workflow variants
- `code-review/` - Code review workflows
- `test/` - Testing workflows

#### 3.2 Command Workflow Pattern

```
User Input: /command [args]
    ↓
Command Parser
    ↓
Load Command Definition
    ↓
Substitute Arguments
    ↓
Execute Agent Workflow
    ↓
Sequential or Parallel Execution
    ↓
Collect Results
    ↓
Present to User
```

### 4. Workflow Layer

#### 4.1 Orchestration Patterns

**Sequential Chaining**:
```
Planner → Researcher → Planner → Main Agent → Tester → Code Reviewer → Docs Manager → Git Manager
```
Use when tasks have dependencies

**Parallel Execution**:
```
            ┌─→ Researcher (Auth) ─┐
Planner ────┼─→ Researcher (DB) ───┼─→ Planner (Synthesize)
            └─→ Researcher (UI) ───┘
```
Use for independent research tasks

**Query Fan-Out**:
```
Main Agent → Planner → [Multiple Researchers in Parallel] → Planner → Main Agent
```
Explore different approaches simultaneously

#### 4.2 Standard Workflows

**Feature Development Workflow**:
1. User: `/ck:cook "add user authentication"`
2. Planner: Create implementation plan
3. Researchers: Explore auth solutions (parallel)
4. Planner: Synthesize research, create detailed plan
5. Main Agent: Implement code
6. Main Agent: Run type checking/compilation
7. Tester: Write and run tests
8. (If tests fail): Debugger analyzes, loop to step 5
9. Code Reviewer: Review implementation
10. Docs Manager: Update documentation
11. Git Manager: Commit with conventional message

**Bug Fix Workflow**:
1. User: `/ck:debug "API timeout errors"`
2. Debugger: Analyze logs and system
3. Debugger: Identify root cause
4. Planner: Create fix plan
5. Main Agent: Implement solution
6. Tester: Validate fix
7. Code Reviewer: Review changes
8. Git Manager: Commit fix

**Documentation Update Workflow**:
1. User: `/ck:docs update`
2. Docs Manager: Check doc freshness
3. (If >1 day old): Run `repomix` for codebase summary
4. Docs Manager: Analyze codebase changes
5. Docs Manager: Update affected documentation
6. Docs Manager: Validate naming conventions
7. Docs Manager: Create update report

### 5. Skills Layer

#### 5.1 Skill Architecture

**Purpose**: Reusable knowledge modules for specific technologies

**Structure**:
```
.claude/skills/
└── [skill-name]/
    ├── SKILL.md           # Main skill definition
    ├── references/        # Supporting documentation
    │   ├── api-ref.md
    │   └── examples.md
    └── scripts/           # Utility scripts (if applicable)
```

**Skill Categories**:
- **Authentication**: better-auth
- **Cloud Platforms**: Cloudflare, Google Cloud
- **Databases**: MongoDB, PostgreSQL
- **Design**: Canvas design generation
- **Debugging**: Systematic approaches
- **Development**: Next.js, Turborepo
- **Documentation**: Repomix, docs-seeker
- **Document Processing**: PDF, DOCX, PPTX, XLSX
- **Infrastructure**: Docker
- **Media**: FFmpeg, ImageMagick
- **MCP**: Server building
- **Problem Solving**: Meta-patterns, thinking frameworks
- **UI Frameworks**: shadcn/ui, Tailwind CSS
- **Ecommerce**: Shopify

#### 5.2 Skill Invocation

**Invocation**: `Skill` tool in CLI
**Usage**: Agents invoke skills to access specialized knowledge
**Example**:
```
Planner needs Next.js expertise
  ↓
Invokes "nextjs" skill
  ↓
Skill provides implementation guidance
  ↓
Planner incorporates into plan
```

### 6. Integration Layer

#### 6.1 Hook System (8 Core Hooks)

**Purpose**: Intercept and control Claude Code operations for performance, context management, and security

**Hook Architecture**:
All hooks located in `.claude/hooks/` with consistent patterns - fail-safe exit code 0 (non-blocking)

**Additional Hooks**:
- `privacy-block.cjs` - Sensitive file access control
- `descriptive-name.cjs` - Naming conventions enforcement
- `post-edit-simplify-reminder.cjs` - Post-edit optimization hints
- `usage-context-awareness.cjs` - Context-aware usage patterns

**1. Session-Init Hook** (`session-init.cjs`)
- **Trigger**: Session startup
- **Purpose**: Initialize session state and context
- **Functionality**:
  - Detects project type (monorepo vs library)
  - Identifies package manager (pnpm/npm/yarn)
  - Detects framework (Next.js, React, etc.)
  - Writes 25+ environment variables for context cascade
  - Enables efficient context reuse across agents

**2. Dev-Rules-Reminder Hook** (`dev-rules-reminder.cjs`)
- **Trigger**: Every user prompt
- **Purpose**: Inject development context and rules
- **Functionality**:
  - Injects current development rules from `.claude/rules/`
  - Smart deduplication prevents redundant context
  - Suggests branch-matched workflows
  - Optimized for minimal token overhead
  - Enables consistent behavior across team

**3. Subagent-Init Hook** (`subagent-init.cjs`)
- **Trigger**: When spawning subagents
- **Purpose**: Provide minimal context to subagents
- **Functionality**:
  - Injects ~200 tokens of essential context
  - Eliminates need for full context retransmission
  - Enables efficient agent-to-agent communication
  - Reduces token consumption for delegation patterns
  - Recent optimization: v1.20.0-beta.12 tuned for token efficiency

**4. Scout-Block Hook** (`scout-block.cjs` - Cross-Platform)
- **Trigger**: Before bash/command execution
- **Purpose**: Block access to heavy directories for performance
- **Architecture**:
  - Pure Node.js implementation (`scout-block.cjs`) — cross-platform
  - Modular internals in `scout-block/` directory (pattern-matcher, path-extractor, error-formatter, broad-pattern-detector)
  - Zero-config setup

**Functionality**:
- Blocks access to heavy directories (node_modules, __pycache__, .git/, dist/, build/)
- Input validation (JSON structure, command presence)
- Error handling with exit codes (0 = allow, 2 = block/error)
- Security: sanitized error messages, input validation
- Performance: Reduces AI token usage and improves response time

**Testing**:
- Validates: blocked/allowed patterns, error handling, edge cases, JSON validation

**5. Session-State Hook** (`session-state.cjs`)

- **Trigger**: SessionStart (on startup and context compaction), Stop (persist), SubagentStop (append)
- **Purpose**: Persist and restore session progress across sessions and context compactions
- **Functionality**:
  - **SessionStart (Startup)**: Loads previous session state from `.claude/session-state/latest.md` and displays it for context recovery
  - **SessionStart (Post-Compaction)**: Restores last saved state after context compaction with special guidance to resume without re-doing completed work
  - **Stop**: Finalizes and archives current session state (keeps last 5 archives)
  - **SubagentStop**: Appends subagent completion results to ongoing session state
  - Extracts todos from transcript, branch info, active plan, and modified files
  - Structured markdown output with completed/pending tasks separation
  - Auto-expiry: States older than 7 days are not loaded
  - Atomic writes: Safe concurrent access with temp-file-then-rename pattern
  - Storage: Project-level (`.claude/session-state/`) with global fallback for non-CK projects

**Storage & Archival**:

- Primary: `.claude/session-state/latest.md` (current session state)
- Archive: `.claude/session-state/archive/` (timestamped backups with rotation)
- Archive Format: `YYYYMMDD-HHMM.md` timestamps
- Rotation: Keeps 5 most recent archives, auto-deletes older ones
- Fallback: `~/.claude/session-states/{hash}/` for non-CK projects (path-based hash)

**Hook Configuration** (`.claude/settings.json`):
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear|compact",
      "hooks": [
        {"type": "command", "command": "node .claude/hooks/session-state.cjs"}
      ]
    }],
    "SubagentStop": [{
      "hooks": [
        {"type": "command", "command": "node .claude/hooks/session-state.cjs"}
      ]
    }],
    "Stop": [{
      "hooks": [
        {"type": "command", "command": "node .claude/hooks/session-state.cjs"}
      ]
    }]
  }
}
```

**Hook Features Summary**:
- Fail-Safe: All hooks exit 0 (non-blocking) - graceful degradation
- Performance: Optimized token consumption
- Cross-Platform: Windows (PowerShell) & Unix (Bash) support
- Context Cascade: Environment variables flow from session to agents
- Smart Dedup: Prevent redundant context injection
- Comprehensive Testing: Cross-platform test coverage
- Session Continuity: Enables context preservation across session boundaries

#### 6.2 MCP (Model Context Protocol) Integration

**Available MCP Servers**:

**docs-seeker** skill (Documentation):
- Read latest docs for packages/plugins
- Access up-to-date technical information

**sequential-thinking** skill (Problem Solving):
- Structured thinking process
- Break down complex problems
- Reflective analysis

**ai-multimodal** skill (Visual Analysis):
- Describe images, videos, documents
- UI/UX analysis from screenshots

**ai-multimodal & imagemagick skills** (Generation & Processing):
- Generate images, videos, and documents via ai-multimodal skills
- Perform design asset creation and edits with imagemagick skill workflows

**brain** (Advanced Reasoning):
- Sequential thinking
- Code analysis
- Debugging assistance

#### 6.3 Preview Dashboard System (COMPLETE - Phase 6)

**Purpose**: Interactive web-based visualization of implementation plans and project progress

**Architecture**:
```
.claude/skills/markdown-novel-viewer/
├── scripts/
│   ├── server.cjs              # HTTP server & request handler
│   ├── lib/
│   │   ├── plan-scanner.cjs    # Plan discovery & metadata extraction
│   │   ├── dashboard-renderer.cjs  # Plan cards & dashboard rendering
│   │   ├── plan-navigator.cjs  # Plan file parsing & traversal
│   │   ├── markdown-renderer.cjs  # Markdown to HTML conversion
│   │   ├── http-server.cjs     # HTTP server utilities
│   │   ├── port-finder.cjs     # Available port detection
│   │   └── process-mgr.cjs     # Process management
│   ├── tests/                  # Test suites
│   └── ...                     # Other modules
├── assets/
│   ├── dashboard-template.html # Dashboard UI template
│   ├── dashboard.css           # Dashboard styles + theme
│   └── dashboard.js            # Interactive dashboard logic
└── SKILL.md                    # Skill documentation
```

**Core Components** (All 6 Phases Complete):

**Phase 1-2: Infrastructure**
- Plan Scanner, HTTP Server, Port detection utilities
- Real-time plan discovery & metadata extraction
- Security validation (path traversal prevention)

**Phase 3-4: API & Data**
- `/dashboard` route with HTML UI
- `/api/dashboard` JSON API endpoint
- Comprehensive metadata extraction (name, progress, status, phases, timestamps)

**Phase 5-6: UI & Features** (COMPLETE)
1. **Dashboard Renderer** (`dashboard-renderer.cjs`):
   - Generates plan cards with progress visualization
   - Calculates progress rings and status bars
   - Supports sorting: by date, alphabetically, by progress
   - Real-time filtering by status (all/pending/active/completed)
   - Full-text search across plan names and descriptions

2. **Dashboard Template** (`dashboard-template.html`):
   - Responsive grid layout (auto-fit cards)
   - Sticky header with controls
   - Search bar with debounced input
   - Sort/filter dropdowns
   - Plan cards with metadata

3. **Dashboard Styles** (`dashboard.css`):
   - Dark/light theme support with CSS variables
   - WCAG 2.1 AA color contrast compliance
   - Progress ring visualization (SVG-based)
   - Responsive design (mobile-first)
   - Smooth transitions and animations

4. **Dashboard Logic** (`dashboard.js`):
   - Client-side filtering and sorting
   - Theme toggle (persisted in localStorage)
   - Real-time search with regex support
   - Accessibility features (keyboard navigation, ARIA labels)
   - Plan card interactions and detail views

**Data Flow**:
```
User Request (/dashboard)
    ↓
HTTP Server
    ↓
Plan Scanner (discovers plans in ./plans)
    ↓
Dashboard Renderer (generates cards with progress)
    ↓
Dashboard Template (renders HTML with cards)
    ↓
Dashboard JS (enables interactivity)
    ↓
User sees sorted/filtered plan grid
```

**Features Complete**:
- Real-time plan discovery (no manual updates)
- Interactive card-based grid layout
- Progress tracking with percentage calculation & rings
- Status derivation (pending/in-progress/completed)
- Sorting: date (newest first), alphabetical, progress %
- Filtering: all, pending, active, completed
- Full-text search with highlighting
- Dark/light theme toggle with persistence
- WCAG 2.1 AA accessibility compliance
- Responsive mobile-friendly design
- Phase breakdown with status indicators
- Timestamp tracking for plan modifications
- Security-validated path traversal

#### 6.4 External Service Integration

**GitHub**:
- Actions (CI/CD automation)
- Releases (semantic versioning)
- Issues and PRs (project management)

**Discord**:
- Webhook notifications
- Project updates
- Team communication

**NPM** (Optional):
- Package publishing
- Version management

### 7. Data Layer

#### 7.1 File-Based Storage

**Configuration Data**:
- `.claude/` - Claude Code config
- `.gitignore` - Git exclusions
- `package.json` - Node.js config
- `.releaserc.json` - Release config

**Runtime Data**:
- `plans/` - Implementation plans
- `plans/<plan-name>/reports/` - Agent communication
- `plans/<plan-name>/research/` - Research reports
- `docs/` - Project documentation
- `repomix-output.xml` - Codebase compaction

**Version Control**:
- `.git/` - Git repository
- `CHANGELOG.md` - Version history
- Git tags - Release versions

#### 7.2 Data Flow

```
User Input
    ↓
Command Parsing
    ↓
Agent Execution
    ↓
File System (Reports/Plans)
    ↓
Agent Reading
    ↓
Processing
    ↓
File System (Updated Docs/Code)
    ↓
Version Control (Git)
    ↓
Remote Repository (GitHub)
```

## Component Interactions

### Typical Interaction Flow: Feature Implementation

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ /ck:cook "add auth"
       ↓
┌─────────────────────┐
│   Command Parser    │
└──────┬──────────────┘
       │ Parse command + args
       ↓
┌─────────────────────┐
│  Planner Agent      │
└──────┬──────────────┘
       │ Spawn researchers
       ↓
┌──────────────────────────────────┐
│  Researchers (Parallel)          │
│  - Auth strategies               │
│  - Security best practices       │
│  - Integration patterns          │
└──────┬───────────────────────────┘
       │ Reports to planner
       ↓
┌─────────────────────┐
│  Planner Agent      │
└──────┬──────────────┘
       │ Create plan
       │ Save to ./plans/
       ↓
┌─────────────────────┐
│   Main Agent        │
└──────┬──────────────┘
       │ Read plan
       │ Implement code
       ↓
┌─────────────────────┐
│  Tester Agent       │
└──────┬──────────────┘
       │ Write & run tests
       ↓
┌─────────────────────┐
│ Code Reviewer Agent │
└──────┬──────────────┘
       │ Review quality
       ↓
┌─────────────────────┐
│ Docs Manager Agent  │
└──────┬──────────────┘
       │ Update docs
       ↓
┌─────────────────────┐
│  Git Manager Agent  │
└──────┬──────────────┘
       │ Commit & push
       ↓
┌─────────────────────┐
│   User (Result)     │
└─────────────────────┘
```

### Agent Communication Example

```
plans/<plan-name>/reports/251026-from-planner-to-main-auth-plan-report.md
    ↓
Main Agent reads plan
    ↓
Implements features
    ↓
plans/<plan-name>/reports/251026-from-main-to-tester-auth-impl-report.md
    ↓
Tester reads implementation details
    ↓
Runs tests
    ↓
plans/<plan-name>/reports/251026-from-tester-to-main-test-results-report.md
```

## Technology Stack

### Core Technologies

**Runtime Environment**:
- Node.js >= 18.0.0
- Bash scripting (hooks)

**AI Platforms**:
- Anthropic Claude (Sonnet 4, Opus 4)
- Google Gemini 2.5 Flash
- OpenRouter (multi-model support)
- Grok Code

**Development Tools**:
- Semantic Release (versioning)
- Commitlint (commit standards)
- Husky (git hooks)
- Repomix (codebase compaction)

**CI/CD**:
- GitHub Actions
- Conventional Commits
- Semantic Versioning

### Agent Skills Ecosystem

**Sequential Thinking**: Problem decomposition
**brain**: Advanced reasoning
**docs-seeker**: Documentation access
**ai-multimodal**: Visual understanding
**ai-multimodal & imagemagick skills**: Content generation and processing

## Data Flow Diagrams

### Command Execution Flow

```
User → CLI → Parser → Command Def → Agent Workflow
                                         ↓
                        ┌────────────────┴────────────────┐
                        ↓                                 ↓
                Sequential Execution              Parallel Execution
                        ↓                                 ↓
                Agent A → Agent B → Agent C    Agent A + Agent B + Agent C
                        ↓                                 ↓
                        └─────────────┬───────────────────┘
                                      ↓
                              Collect Results
                                      ↓
                              Present to User
```

### File-Based Communication Flow

```
Agent A (Planner)
    ↓ Writes
./plans/<plan-name>/plan.md
    ↓ Reads
Main Agent
    ↓ Implements
Code Changes
    ↓ Writes
./plans/<plan-name>/reports/251026-from-main-to-tester-impl-report.md
    ↓ Reads
Tester Agent
    ↓ Executes
Tests
    ↓ Writes
./plans/<plan-name>/reports/251026-from-tester-to-main-results-report.md
    ↓ Reads
Main Agent (next steps)
```

### Documentation Update Flow

```
Code Changes
    ↓
Docs Manager Triggered
    ↓
Check Freshness (< 1 day?)
    ↓
┌─────────┴─────────┐
↓ No (outdated)     ↓ Yes (fresh)
Run Repomix         Read Existing
    ↓                   ↓
Generate Summary        │
    └────────┬──────────┘
             ↓
    Analyze Changes
             ↓
    Update Documentation
    - API docs
    - Code standards
    - Architecture
    - Codebase summary
             ↓
    Validate Naming
             ↓
    Create Report
             ↓
    Save to ./docs/
```

## Security Architecture

### Security Layers

**Layer 1: Pre-Commit Security**
- Secret scanning (git-manager agent)
- Credential detection
- .gitignore validation
- Environment file exclusion

**Layer 2: Code Security**
- Input validation enforcement
- SQL injection prevention
- XSS protection patterns
- OWASP Top 10 awareness

**Layer 3: Agent Security**
- No logging of sensitive data
- Sanitized error messages
- Secure credential handling
- API key protection

**Layer 4: Communication Security**
- File system permissions
- Report sanitization
- Context isolation
- Clean handoffs

### Secret Management

**Environment Variables**:
```
.env (local, gitignored)
.env.example (template, committed)
```

**API Keys**:
- Never hardcoded
- Environment variable injection
- Secure storage systems in production

**Credentials**:
- Password hashing (bcrypt, argon2)
- Token-based authentication
- Secure session management

## Scalability Considerations

### Horizontal Scalability

**Parallel Agent Execution**:
- Independent researchers run simultaneously
- No shared state between agents
- File-based coordination
- Scalable to N agents

**Workflow Parallelization**:
- Multiple feature branches
- Concurrent issue resolution
- Parallel test execution
- Independent documentation updates

### Vertical Scalability

**Context Management**:
- Repomix for code compaction
- Selective context loading
- Chunked file processing
- Efficient token usage

**Performance Optimization**:
- Lazy loading of skills
- Cached MCP responses
- Incremental documentation updates
- Optimized file I/O

## Deployment Architecture

### Development Environment

```
Developer Machine
├── Claude Code CLI
├── .claude/ (configuration)
├── Git repository
└── Node.js runtime
```

### CI/CD Pipeline

```
GitHub Repository
    ↓ Push to main
GitHub Actions
    ↓
Run Tests
    ↓
Semantic Release
    ├─→ Version Bump
    ├─→ Changelog Generation
    ├─→ GitHub Release
    └─→ (Optional) NPM Publish
```

### Production Usage

```
User Project
├── .claude/ (from template)
├── docs/ (generated)
├── plans/ (generated)
├── src/ (user code)
└── tests/ (user tests)
```

## Monitoring & Observability

### Agent Activity Tracking

**Logs**:
- Agent invocations
- Command executions
- Workflow progress
- Error occurrences

**Reports**:
- Agent communication files
- Implementation plans
- Research findings
- Test results

**Metrics**:
- Command execution time
- Agent success rates
- Test pass/fail ratios
- Documentation coverage

### Quality Metrics

**Code Quality**:
- Test coverage percentage
- Type safety compliance
- Linting pass rate
- Security scan results

**Process Metrics**:
- Planning to implementation time
- Code review turnaround
- Documentation freshness
- Commit message compliance

## Failure Handling

### Error Recovery Strategies

**Agent Failures**:
- Graceful degradation
- Error reporting to user
- Rollback mechanisms
- Retry logic for transient errors

**Workflow Failures**:
- Checkpoint saving
- Partial progress preservation
- Clear failure messages
- Recovery suggestions

**Communication Failures**:
- File write retries
- Report validation
- Missing report detection
- Timeout handling

## Extension Points

### Adding New Agents

1. Create agent definition file: `.claude/agents/my-agent.md`
2. Define YAML frontmatter (name, description, mode, model)
3. Write agent instructions and workflows
4. Reference in commands or other agents

### Adding New Command-Style Skills

1. Create skill directory: `.claude/skills/my-command/`
2. Define `SKILL.md` with YAML frontmatter and workflow instructions
3. Add script/reference files under `scripts/` or `references/` as needed
4. Register discoverability metadata in SKILL.md frontmatter

### Adding New Skills

1. Create skill directory: `.claude/skills/my-skill/`
2. Write `SKILL.md` with knowledge content
3. Add references and examples
4. Reference in agent definitions

### Custom Workflows

1. Define workflow in `.claude/rules/`
2. Document orchestration patterns
3. Specify agent handoffs
4. Provide examples

## Performance Considerations

### Optimization Strategies

**Token Efficiency**:
- Repomix for codebase compaction
- Selective context inclusion
- Efficient prompt engineering
- Response caching where possible

**Execution Speed**:
- Parallel agent spawning
- Async file operations
- Lazy skill loading
- Minimal context switching

**Resource Usage**:
- File system efficiency
- Memory management for large files
- Cleanup of temporary files
- Optimized git operations

## Future Architecture Evolution

### Planned Enhancements

**Agent Improvements**:
- Visual workflow builder for agent orchestration
- Custom agent creator with UI
- Agent marketplace for community contributions
- Real-time agent communication (beyond files)

**Scalability Enhancements**:
- Distributed agent execution
- Cloud-based agent orchestration
- Multi-repository support
- Large-scale project handling

**Integration Expansions**:
- Additional AI platforms
- More MCP servers
- Custom integration framework
- Enterprise service connectors

## References

### Internal Documentation
- [Project Overview PDR](./project-overview-pdr.md)
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)

### External Resources
- [Claude Code Documentation](https://docs.claude.com/)
- [Open Code Documentation](https://opencode.ai/docs)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Semantic Versioning](https://semver.org/)

## Unresolved Questions

1. **Real-Time Collaboration**: How to handle multiple developers using agents simultaneously on same codebase?
2. **Agent State Management**: Should agents maintain state between invocations beyond file system?
3. **Distributed Execution**: Architecture for running agents across multiple machines?
4. **Performance Benchmarking**: What are acceptable latency thresholds for different operation types?
