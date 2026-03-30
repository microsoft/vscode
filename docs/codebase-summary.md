# Codebase Summary

**Last Updated**: 2026-01-28
**Version**: 2.9.0-beta.2
**Repository**: [claudekit/claudekit-engineer](https://github.com/claudekit/claudekit-engineer)

## Overview

ClaudeKit Engineer is a comprehensive boilerplate template for building professional software projects with CLI Coding Agents (Claude Code and Open Code). It provides a complete development environment with AI-powered agent orchestration, automated workflows, and intelligent project management.

## Project Structure

```
claudekit-engineer/
├── .claude/               # Claude Code configuration
│   ├── agents/           # Specialized agent definitions (14 agents)
│   ├── command-archive/  # Archived legacy command definitions
│   ├── commands/         # Reserved compatibility directory (empty/minimal)
│   ├── hooks/            # Git hooks and scripts
│   ├── skills/           # Specialized skills library (20+ skills)
│   └── workflows/        # Development workflow definitions
├── .github/             # GitHub Actions workflows
│   └── workflows/       # CI/CD automation
├── docs/                # Project documentation
│   └── research/        # Research reports directory
├── guide/               # User guides and references
├── plans/               # Implementation plans and reports
│   ├── reports/         # Agent-to-agent communication
│   └── templates/       # Plan templates
├── CLAUDE.md           # Project-specific Claude instructions
├── README.md           # Project overview
├── package.json        # Node.js dependencies
└── repomix-output.xml  # Codebase compaction file
```

## Core Technologies

### Runtime & Dependencies
- **Node.js**: >=18.0.0
- **Package Manager**: npm
- **License**: MIT

### Development Tools
- **Semantic Release**: Automated versioning and changelog
- **Commitlint**: Conventional commit enforcement
- **Husky**: Git hooks automation
- **Repomix**: Codebase compaction for AI consumption

### CI/CD
- **GitHub Actions**: Automated release workflow
- **Semantic Versioning**: Automated version management
- **Conventional Commits**: Structured commit messages

## Key Components

### 1. Agent Orchestration System (14 Agents)

**Claude Code Agents** (`.claude/agents/`):
- `planner.md` - Technical planning and architecture (Opus model)
- `researcher.md` - Research and analysis
- `fullstack-developer.md` - Full-stack implementation
- `code-reviewer.md` - Code quality assessment
- `tester.md` - Testing and validation
- `debugger.md` - Issue analysis and debugging
- `docs-manager.md` - Documentation management (Gemini model)
- `git-manager.md` - Version control operations
- `journal-writer.md` - Development journaling
- `brainstormer.md` - Solution ideation
- `project-manager.md` - Project tracking
- `ui-ux-designer.md` - UI/UX design
- `mcp-manager.md` - MCP server management
- `code-simplifier.md` - Code optimization and simplification

### 2. Slash Commands System (Skill-Backed)

**Core Development Commands**:
- `/ck:plan` - Research and planning
- `/ck:cook` - Feature implementation
- `/ck:test` - Test execution
- `/ck:ask` - Technical consultation
- `/ck:bootstrap` - Project initialization
- `/ck:brainstorm` - Solution ideation
- `/ck:debug` - Issue debugging
- `/ck:fix` - Bug fixes

**Skill Directories** (`.claude/skills/`):
- `bootstrap/` - Project initialization workflows
- `docs/` - Documentation workflows
- `plan/` - Planning variants
- `code-review/` - Code review workflows
- `test/` - Testing workflows

### 3. Skills Library (38 Skills)

**Phase 1 Organized Groups** (Progressive Disclosure):
- **DevOps** (`devops/`) - Cloudflare (5 skills), Docker, Google Cloud Platform
  - 11 references, 2 Python utilities, 45 tests
- **Databases** (`databases/`) - MongoDB, PostgreSQL
  - 8 references, 3 Python utilities
- **Web Frameworks** (`web-frameworks/`) - Next.js, Turborepo, RemixIcon
  - 7 references, 2 Python utilities
- **UI Styling** (`ui-styling/`) - shadcn/ui, Tailwind CSS, canvas-design
  - 7 references, 2 Python utilities

**Current Skills** (47+ Total):
- ai-artist, ai-multimodal, agent-browser, backend-development, better-auth
- brainstorm, chrome-devtools, code-review, common, context-engineering
- cook, copywriting, databases, debug, devops
- docs-seeker, document-skills, find-skills, frontend-design, frontend-development
- git, gkg, google-adk-python, markdown-novel-viewer, mcp-builder
- mcp-management, media-processing, mermaidjs-v11, mobile-development, payment-integration
- plan, plans-kanban, problem-solving, react-best-practices, remotion
- repomix, research, scout, sequential-thinking, shader
- shopify, skill-creator, template-skill, threejs, ui-styling
- ui-ux-pro-max, web-design-guidelines, web-frameworks, web-testing

### 4. Hook System (9+ Core Hooks)

**Location**: `.claude/hooks/`

**Core Hooks:**

1. **session-init.cjs** - Session Initialization
   - Detects project type (monorepo/library)
   - Identifies package manager (pnpm/npm/yarn)
   - Detects framework (Next/React/etc)
   - Writes 25+ environment variables for context cascade

2. **dev-rules-reminder.cjs** - Development Context Injection
   - Injects dev rules & context on every prompt
   - Smart deduplication prevents redundancy
   - Provides branch-matched workflow suggestions
   - Optimized for token efficiency

3. **subagent-init.cjs** - Subagent Context Injection
   - Injects compact context (~200 tokens) when spawning subagents
   - Minimizes token overhead during delegation
   - Enables efficient agent-to-agent communication

4. **scout-block.cjs** - Cross-Platform Performance Optimization
   - Blocks access to heavy directories (node_modules, .git, __pycache__, dist/, build/)
   - Pure Node.js implementation (`scout-block.cjs`) — cross-platform
   - Modular internals: `scout-block/` (pattern-matcher, path-extractor, error-formatter, broad-pattern-detector)
   - Improves AI response time and token efficiency

5. **session-state.cjs** - Session State Persistence
   - Persists session progress across sessions and context compactions
   - Loads previous state on SessionStart (startup and post-compaction recovery)
   - Archives old states with rotation (keeps 5)
   - Extracts todos, modified files, branch, and plan info
   - 7-day auto-expiry, atomic writes, fail-safe
   - Post-compaction: Injects last saved state with guidance to resume without re-doing work

6. **privacy-block.cjs** - Sensitive File Access Control
7. **descriptive-name.cjs** - Naming conventions enforcement
8. **post-edit-simplify-reminder.cjs** - Post-edit optimization hints
9. **usage-context-awareness.cjs** - Context-aware usage patterns

**Hook Features:**
- Fail-Safe: All hooks exit 0 (non-blocking) - graceful degradation
- Performance: Optimized token consumption
- Cross-Platform: Windows (PowerShell) & Unix (Bash) via Node.js dispatcher
- Comprehensive Test Coverage: scout-block hook validated via Node.js test suite

### 5. Workflows

**Primary Workflows** (`.claude/rules/`):
1. **primary-workflow.md**: Core development cycle
   - Code implementation
   - Testing
   - Code quality
   - Integration
   - Debugging

2. **orchestration-protocol.md**: Agent coordination patterns
   - Sequential chaining
   - Parallel execution

3. **development-rules.md**: Development standards
   - File size management (<500 lines)
   - YAGNI, KISS, DRY principles
   - Code quality guidelines
   - Pre-commit/push rules

4. **documentation-management.md**: Doc maintenance
   - Roadmap and changelog updates
   - Automatic update triggers
   - Documentation protocols

## Entry Points

### For Users
- **README.md**: Project overview and quick start
- **guide/SKILLS.md**: Comprehensive skills reference (7,073 tokens)
- **CLAUDE.md**: Development instructions and workflows

### For Developers
- **package.json**: Dependencies and scripts
- **.releaserc.json**: Semantic release configuration
- **.commitlintrc.json**: Commit message linting rules
- **.gitignore**: Version control exclusions

### For Agents
- **CLAUDE.md**: Primary agent instructions
- **.claude/rules/**: Development rules and protocols
- **plans/templates/**: Implementation plan templates

## Development Principles

### YAGNI (You Aren't Gonna Need It)
Avoid over-engineering and unnecessary features

### KISS (Keep It Simple, Stupid)
Prefer simple, straightforward solutions

### DRY (Don't Repeat Yourself)
Eliminate code duplication

### File Size Management
- Keep files under 500 lines
- Split large files into focused components
- Extract utilities into separate modules

### Security First
- Try-catch error handling
- Security standards coverage
- No secrets in commits
- Confidential info protection

## Agent Communication Protocol

**Report Format**: Markdown files in `./plans/<plan-name>/reports/`
**Naming Convention**: `{date}-from-[agent]-to-[agent]-[task]-report.md`

**Communication Patterns**:
- Sequential: Task dependencies require ordered execution
- Parallel: Independent tasks run simultaneously
- Query Fan-Out: Multiple researchers explore different approaches

## Git Workflow

**Commit Message Format**: Conventional Commits
```
type(scope): description

Types:
- feat: Features (minor bump)
- fix: Bug fixes (patch bump)
- docs: Documentation (patch bump)
- refactor: Code refactoring (patch bump)
- test: Tests (patch bump)
- ci: CI changes (patch bump)
- BREAKING CHANGE: Major version bump
```

**Automated Release**:
- Every push to `main` triggers release check
- Semantic versioning (MAJOR.MINOR.PATCH)
- Automated changelog generation
- GitHub releases with generated notes

## Testing Strategy

- Comprehensive unit tests required
- High code coverage mandatory
- Error scenario testing
- Performance validation
- Tests must pass before push
- No ignoring failed tests

## Documentation Standards

**Required Docs** (`./docs/`):
- `project-overview-pdr.md` - Project overview and PDR
- `code-standards.md` - Coding standards and structure
- `codebase-summary.md` - This file
- `system-architecture.md` - Architecture documentation
- `project-roadmap.md` - Development roadmap
- `project-changelog.md` - Detailed changelog
- `statusline-windows-support.md` - Windows statusline setup guide
- `statusline-architecture.md` - Technical statusline implementation

**Documentation Triggers**:
- Feature implementation completion
- Major milestone achievements
- Bug fixes
- Security updates
- Weekly reviews

## Dependencies Overview

### Production Dependencies
None (template project)

### Development Dependencies
- **@commitlint/cli**: ^18.4.3
- **@commitlint/config-conventional**: ^18.4.3
- **@semantic-release/changelog**: ^6.0.3
- **@semantic-release/commit-analyzer**: ^11.1.0
- **@semantic-release/git**: ^10.0.1
- **@semantic-release/github**: ^9.2.6
- **@semantic-release/npm**: ^11.0.2
- **@semantic-release/release-notes-generator**: ^12.1.0
- **conventional-changelog-conventionalcommits**: ^7.0.2
- **husky**: ^8.0.3
- **semantic-release**: ^22.0.12

## File Statistics

**Total Files**: 48 files (in repomix output)
**Total Tokens**: 38,868 tokens
**Total Characters**: 173,077 chars

**Top 5 Files by Token Count**:
1. `guide/SKILLS.md` - 7,073 tokens (18.2%)
2. `CHANGELOG.md` - 4,836 tokens (12.4%)
3. `README.md` - 3,261 tokens (8.4%)

## Integration Capabilities

### Discord Notifications
Script: `.claude/hooks/notifications/notify.cjs` + `providers/discord.cjs`
Purpose: Send project updates to Discord channels

### GitHub Actions
Workflow: `.github/workflows/release.yml`
Features: Automated releases, changelog generation

### Agent Skills
- **brain**: Advanced reasoning
- **docs-seeker**: Documentation reading
- **ai-multimodal**: Visual understanding
- **ai-multimodal & imagemagick skills**: Content generation and processing

## Critical Files

### Configuration
- `package.json` - Node.js config
- `.releaserc.json` - Release config
- `.commitlintrc.json` - Commit linting
- `.gitignore` - Git exclusions
- `.repomixignore` - Repomix exclusions

### Documentation
- `README.md` - Main project docs
- `CLAUDE.md` - Agent instructions
- `CHANGELOG.md` - Version history
- `guide/SKILLS.md` - Skills reference

### Workflows
- `.claude/rules/primary-workflow.md`
- `.claude/rules/development-rules.md`
- `.claude/rules/orchestration-protocol.md`
- `.claude/rules/documentation-management.md`

## Related Projects

- **claudekit** - ClaudeKit website (`../claudekit`)
- **claudekit-marketing** - Marketing Kit (`../claudekit-marketing`)
- **claudekit-cli** - CLI setup tool (`../claudekit-cli`)
- **claudekit-docs** - Public docs (`../claudekit-docs`)

## Version History

**Current**: v2.9.0-beta.2 (released 2026-01-28)
**License**: MIT
**Author**: Duy Nguyen
**Repository**: https://github.com/claudekit/claudekit-engineer

## Unresolved Questions

None identified. All core components are well-documented and functional.
