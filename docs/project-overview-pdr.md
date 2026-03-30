# Project Overview & Product Development Requirements (PDR)

**Project Name**: ClaudeKit Engineer
**Version**: 2.9.0-beta.2
**Last Updated**: 2026-01-28
**Status**: Active Development
**Repository**: https://github.com/claudekit/claudekit-engineer

## Executive Summary

ClaudeKit Engineer is a comprehensive boilerplate template that revolutionizes software development by integrating AI-powered CLI coding agents (Claude Code and Open Code) into the development workflow. It provides a complete orchestration framework where specialized AI agents collaborate to handle planning, implementation, testing, code review, documentation, and project management.

## Project Purpose

### Vision
Enable developers to build professional software projects faster and with higher quality by leveraging AI agent orchestration, automated workflows, and intelligent project management.

### Mission
Provide a production-ready template that:
- Accelerates development velocity through AI-powered agent collaboration
- Enforces best practices and coding standards automatically
- Maintains comprehensive documentation that evolves with code
- Ensures code quality through automated testing and review
- Streamlines git workflows with professional commit standards

### Value Proposition
- **10x Faster Planning**: Parallel researcher agents explore solutions simultaneously
- **Consistent Quality**: Automated code review and testing on every change
- **Zero Documentation Debt**: Docs update automatically with code changes
- **Professional Git History**: Clean, conventional commits without AI attribution
- **Reduced Context Switching**: Specialized agents handle specific concerns

## Target Users

### Primary Users
1. **Solo Developers**: Building projects faster with AI assistance
2. **Small Development Teams**: Standardizing workflows and practices
3. **Open Source Maintainers**: Managing contributions and documentation
4. **Startups**: Rapid prototyping and MVP development
5. **Enterprise Teams**: Enforcing architectural standards

### User Personas

**Persona 1: Solo Full-Stack Developer**
- **Needs**: Fast iteration, quality code, minimal documentation overhead
- **Pain Points**: Context switching, documentation maintenance, testing gaps
- **Solution**: AI agents handle planning, testing, docs while dev focuses on features

**Persona 2: Technical Lead**
- **Needs**: Enforce standards, review code, maintain architecture docs
- **Pain Points**: Code review bottleneck, inconsistent patterns, outdated docs
- **Solution**: Automated reviews, standardized workflows, living documentation

**Persona 3: Open Source Maintainer**
- **Needs**: Scale contributions, maintain quality, clear documentation
- **Pain Points**: Limited time, varying contribution quality, doc rot
- **Solution**: Consistent review process, automated standards enforcement

## Key Features & Capabilities

### 1. Multi-Agent Orchestration System

**Agent Types**:
- **Planning Agents**: Research, architecture, technical decisions
- **Implementation Agents**: Code generation, feature development
- **Quality Agents**: Testing, code review, security analysis
- **Documentation Agents**: Auto-updating docs, API references
- **Management Agents**: Project tracking, progress monitoring, git operations

**Orchestration Patterns**:
- **Sequential Chaining**: Planning → Implementation → Testing → Review → Deploy
- **Parallel Execution**: Multiple researchers exploring different approaches
- **Query Fan-Out**: Simultaneous investigation of technical solutions

**Performance Optimization**:
- **Scout Block Hook**: Cross-platform hook system blocking heavy directories
  - Automatic platform detection (Windows/Unix/WSL)
  - Zero-configuration setup
  - Blocks: node_modules, __pycache__, .git/, dist/, build/
  - Improves AI agent response time and token efficiency

### 2. Comprehensive Slash Commands

**Core Development Commands**:
- `/ck:plan` - Research and create implementation plans
- `/ck:cook` - Implement features with full workflow
- `/ck:test` - Run comprehensive test suites
- `/ck:ask` - Expert technical consultation
- `/ck:bootstrap` - Initialize new projects end-to-end
- `/ck:brainstorm` - Solution ideation and evaluation
- `/ck:debug` - Deep issue analysis

**Skill Organization** (`.claude/skills/`):
Command behavior is implemented via skill directories:
- `bootstrap/` - Project initialization workflows
- `docs/` - Documentation generation and updates
- `plan/` - Planning workflows and validators
- `code-review/` - Code review workflows
- `test/` - Testing and validation workflows

### 3. Extensive Skills Library (47+ Skills)

**Organized by Domain** (`.claude/skills/`):

**AI & Vision**: ai-artist, ai-multimodal, agent-browser
**Authentication**: better-auth
**Backend & Databases**: backend-development, databases
**Code Quality & Debugging**: code-review, debug, sequential-thinking
**Content & Copywriting**: copywriting, brainstorm
**Design & Frontend**: frontend-design, frontend-development, ui-styling, ui-ux-pro-max, web-design-guidelines
**DevOps & Infrastructure**: devops, git
**Documentation**: docs-seeker, repomix, markdown-novel-viewer, document-skills
**Framework Integration**: web-frameworks, react-best-practices, shopify
**Game Development**: threejs, shader
**Media Processing**: media-processing (FFmpeg, ImageMagick)
**MCP Tools**: mcp-builder, mcp-management
**Mobile Development**: mobile-development
**Project Planning**: plan, plans-kanban
**Skill Development**: skill-creator, template-skill
**Testing & QA**: web-testing
**Visualization**: mermaidjs-v11
**Workflow Tools**: cook, research, scout, payment-integration

### 4. Automated Release Management

**Features**:
- Semantic versioning (MAJOR.MINOR.PATCH)
- Conventional commit enforcement
- Automated changelog generation
- GitHub releases with assets
- Optional NPM publishing
- Git hooks for commit validation

**Commit Types**:
- `feat:` → Minor version bump
- `fix:` → Patch version bump
- `BREAKING CHANGE:` → Major version bump
- `docs:`, `refactor:`, `test:`, `ci:` → Patch bump

### 5. Development Workflow Automation

**Pre-Commit**:
- Commit message linting (conventional commits)
- Optional test execution

**Pre-Push**:
- Linting validation
- Test suite execution
- Build verification

**CI/CD**:
- GitHub Actions integration
- Automated releases on main branch
- Test automation
- Build validation

## Technical Requirements

### Functional Requirements

**FR1: Agent Orchestration**
- Support sequential and parallel agent execution
- Enable agent-to-agent communication via file system
- Maintain context across agent handoffs
- Track agent task completion

**FR2: Command System**
- Parse slash commands with arguments
- Route to appropriate agent workflows
- Support nested commands (e.g., `/ck:fix:ci`)
- Provide command discovery and help

**FR3: Documentation Management**
- Auto-generate codebase summaries with repomix
- Keep docs synchronized with code changes
- Maintain project roadmap and changelog
- Update API documentation automatically

**FR4: Quality Assurance**
- Run tests before commits
- Perform code review automatically
- Check type safety and compilation
- Validate security best practices

**FR5: Git Workflow**
- Enforce conventional commits
- Scan for secrets before commits
- Generate professional commit messages
- Create clean PR descriptions

**FR6: Project Bootstrapping**
- Initialize git repository
- Gather requirements through questions
- Research tech stacks
- Generate project structure
- Create initial documentation
- Set up CI/CD

### Non-Functional Requirements

**NFR1: Performance**
- Command execution < 5 seconds for simple operations
- Parallel agent spawning for independent tasks
- Efficient file system operations
- Optimized context loading

**NFR2: Reliability**
- Handle agent failures gracefully
- Provide rollback mechanisms
- Validate agent outputs
- Error recovery and retry logic

**NFR3: Usability**
- Clear command syntax and documentation
- Helpful error messages
- Progress indicators for long operations
- Comprehensive command help

**NFR4: Maintainability**
- Modular agent definitions
- Reusable workflow templates
- Clear separation of concerns
- Self-documenting code and configs

**NFR5: Security**
- Secret detection before commits
- No AI attribution in public commits
- Secure handling of credentials
- Security best practice enforcement

**NFR6: Scalability**
- Support projects of any size
- Handle large codebases efficiently
- Scale agent parallelization
- Manage complex dependency graphs

## Success Metrics

### Adoption Metrics
- GitHub stars and forks
- NPM package downloads
- Active users and installations
- Community engagement (issues, discussions, PRs)

### Performance Metrics
- Average time to bootstrap new project: < 10 minutes
- Planning to implementation cycle time: 50% reduction
- Documentation coverage: > 90%
- Test coverage: > 80%
- Code review time: 75% reduction

### Quality Metrics
- Conventional commit compliance: 100%
- Zero secrets in commits: 100%
- Automated test pass rate: > 95%
- Documentation freshness: < 24 hours lag

### Developer Experience Metrics
- Time to first commit: < 5 minutes
- Developer onboarding time: 50% reduction
- Context switching overhead: 60% reduction
- Satisfaction score: > 4.5/5.0

## Technical Architecture

### Core Components

**1. Agent Framework**
- Agent definition files (Markdown with frontmatter)
- Agent orchestration engine
- Context management system
- Communication protocol (file-based reports)

**2. Command System**
- Command parser and router
- Argument handling ($ARGUMENTS, $1, $2, etc.)
- Command composition and nesting
- Help and discovery system

**3. Workflow Engine**
- Sequential execution support
- Parallel task scheduling
- Dependency resolution
- Error handling and recovery

**4. Documentation System**
- Repomix integration for codebase compaction
- Template-based doc generation
- Auto-update triggers
- Version tracking

**5. Quality System**
- Test runner integration
- Code review automation
- Type checking and linting
- Security scanning

**6. Release System**
- Semantic versioning engine
- Changelog generation
- GitHub release creation
- Asset packaging

### Technology Stack

**Runtime**:
- Node.js >= 18.0.0
- Bash scripting (Unix hooks)
- PowerShell scripting (Windows hooks)
- Cross-platform hook dispatcher (Node.js)

**AI Platforms**:
- Anthropic Claude (Sonnet 4, Opus 4)
- OpenRouter integration
- Google Gemini (for docs-manager)
- Grok Code (for git-manager)

**Development Tools**:
- Semantic Release
- Commitlint
- Husky (git hooks)
- Repomix (codebase compaction)
- Scout Block Hook (performance optimization)

**CI/CD**:
- GitHub Actions
- Conventional Commits
- Automated versioning

### Integration Points

**MCP Tools**:
- **context7**: Read latest documentation
- **sequential-thinking**: Structured problem solving
- **SearchAPI**: Google and YouTube search
- **review-website**: Web content extraction
- **VidCap**: Video transcript analysis

**External Services**:
- GitHub (Actions, Releases, PRs)
- Discord (notifications)
- NPM (optional package publishing)

## Use Cases

### UC1: Bootstrap New Project
**Actor**: Developer
**Goal**: Create new project from scratch
**Flow**:
1. Run `/bootstrap` command
2. Answer requirement questions
3. AI researches tech stacks
4. Review and approve recommendations
5. AI generates project structure
6. AI implements initial features
7. AI creates tests and documentation
8. Project ready for development

**Outcome**: Fully functional project with tests, docs, CI/CD in < 10 minutes

### UC2: Implement New Feature
**Actor**: Developer
**Goal**: Add feature with full workflow
**Flow**:
1. Run `/ck:cook "add user authentication"`
2. Planner creates implementation plan
3. Researcher agents explore auth solutions
4. Developer reviews and approves plan
5. AI implements code
6. AI writes comprehensive tests
7. AI performs code review
8. AI updates documentation
9. AI commits with conventional message

**Outcome**: Feature complete with tests, docs, and clean git history

### UC3: Debug Production Issue
**Actor**: Developer
**Goal**: Identify and fix production bug
**Flow**:
1. Run `/ck:debug "API timeout errors"`
2. Debugger agent analyzes logs and system
3. Root cause identified
4. Fix plan created
5. AI implements solution
6. Tests validate fix
7. Code review confirms quality
8. Commit and deploy

**Outcome**: Bug fixed with comprehensive testing and documentation

### UC4: Manage Commits and Deployments
**Actor**: Developer
**Goal**: Maintain professional git history
**Flow**:
1. Developer completes feature implementation
2. Run tests via `/ck:test` command
3. Code review via `/ck:cook` workflow
4. Conventional commit via git-manager agent
5. Push to feature branch
6. Create PR via GitHub interface

**Outcome**: Professional commit history and clean PR ready for review

### UC5: Update Documentation
**Actor**: Project Manager
**Goal**: Ensure docs are current
**Flow**:
1. Run `/ck:docs update`
2. Docs manager scans codebase
3. Generates fresh summary with repomix
4. Identifies outdated sections
5. Updates API docs, guides, architecture
6. Validates naming conventions
7. Creates update report

**Outcome**: Documentation synchronized with code

## Constraints & Limitations

### Technical Constraints
- Requires Node.js >= 18.0.0
- Depends on Claude Code or Open Code CLI
- File-based communication has I/O overhead
- Token limits on AI model context windows

### Operational Constraints
- Requires API keys for AI platforms
- GitHub Actions minutes for CI/CD
- Internet connection for MCP tools
- Storage for repomix output files

### Design Constraints
- Agent definitions must be Markdown with frontmatter
- Commands follow slash syntax
- Reports use specific naming conventions
- Conventional commits required

## Risks & Mitigation

### Risk 1: AI Model API Failures
**Impact**: High
**Likelihood**: Medium
**Mitigation**: Retry logic, fallback models, graceful degradation

### Risk 2: Context Window Limits
**Impact**: Medium
**Likelihood**: High
**Mitigation**: Repomix for code compaction, selective context loading, chunking

### Risk 3: Agent Coordination Failures
**Impact**: High
**Likelihood**: Low
**Mitigation**: Validation checks, error recovery, rollback mechanisms

### Risk 4: Secret Exposure
**Impact**: Critical
**Likelihood**: Low
**Mitigation**: Pre-commit scanning, .gitignore enforcement, security reviews

### Risk 5: Documentation Drift
**Impact**: Medium
**Likelihood**: Medium
**Mitigation**: Automated triggers, freshness checks, validation workflows

## Future Roadmap

### Phase 1: Foundation (Complete - v1.0-1.8)
- ✅ Core agent framework
- ✅ Slash command system
- ✅ Automated releases
- ✅ Skills library
- ✅ Documentation system

### Phase 2: Enhancement (Current)
- 🔄 Additional skills (GCP, AWS, Azure)
- 🔄 UI/UX improvements
- 🔄 Performance optimization
- 🔄 Enhanced error handling

### Phase 3: Advanced Features (Planned)
- 📋 Visual workflow builder
- 📋 Custom agent creator UI
- 📋 Team collaboration features
- 📋 Analytics and insights dashboard
- 📋 Multi-language support

### Phase 4: Enterprise (Future)
- 📋 Self-hosted deployment
- 📋 Advanced security features
- 📋 Compliance automation
- 📋 Custom integrations
- 📋 Enterprise support

## Dependencies & Integration

### Required Dependencies
- Node.js runtime environment
- Git version control
- Claude Code or Open Code CLI
- API keys for AI platforms

### Optional Dependencies
- Discord webhook for notifications
- GitHub repository for CI/CD
- NPM account for publishing

### Integrations
- GitHub Actions
- Semantic Release
- Commitlint
- Husky
- Repomix
- Various MCP servers

## Compliance & Standards

### Coding Standards
- YAGNI (You Aren't Gonna Need It)
- KISS (Keep It Simple, Stupid)
- DRY (Don't Repeat Yourself)
- Files < 500 lines
- Comprehensive error handling
- Security-first development

### Git Standards
- Conventional Commits
- Clean commit history
- No AI attribution
- No secrets in commits
- Professional PR descriptions

### Documentation Standards
- Markdown format
- Up-to-date (< 24 hours)
- Comprehensive coverage
- Clear examples
- Proper versioning

### Testing Standards
- Unit test coverage > 80%
- Integration tests for workflows
- Error scenario coverage
- Performance validation
- Security testing

## Glossary

- **Agent**: Specialized AI assistant with specific expertise and responsibilities
- **Slash Command**: Shortcut that triggers agent workflows (e.g., `/ck:plan`)
- **Skill**: Reusable knowledge module for specific technologies or patterns
- **MCP**: Model Context Protocol for AI tool integration
- **Repomix**: Tool for compacting codebases into AI-friendly format
- **Sequential Chaining**: Running agents one after another with dependencies
- **Parallel Execution**: Running multiple agents simultaneously
- **Query Fan-Out**: Spawning multiple researchers to explore different approaches
- **Conventional Commits**: Structured commit message format (type(scope): description)

## Appendix

### Related Documentation
- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [System Architecture](./system-architecture.md)
- [Skills Reference](../guide/SKILLS.md)

### External Resources
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/overview)
- [Open Code Documentation](https://opencode.ai/docs)
- [Conventional Commits](https://conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

### Support & Community
- GitHub Issues: https://github.com/claudekit/claudekit-engineer/issues
- Discussions: https://github.com/claudekit/claudekit-engineer/discussions
- Repository: https://github.com/claudekit/claudekit-engineer

## Unresolved Questions

1. **Performance Benchmarks**: Need to establish baseline metrics for agent execution times
2. **Multi-Repository Support**: How to handle projects spanning multiple repositories?
3. **Custom AI Model Support**: Should we support other AI platforms beyond Claude and OpenRouter?
4. **Agent Marketplace**: Community-contributed agents and skills distribution mechanism?
5. **Real-Time Collaboration**: How to handle multiple developers using agents simultaneously?
