# Specter IDE - Development Documentation

**Project:** Specter (Security Testing Platform)  
**Codebase:** VS Code Fork  
**Repository:** https://github.com/BugB-Tech/bsurf_b2c  
**Branch:** bugb (main development branch)

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Codebase Structure](#codebase-structure)
3. [Architecture Overview](#architecture-overview)
4. [Technology Stack](#technology-stack)
5. [Core Components](#core-components)
6. [Development Workflow](#development-workflow)
7. [Build & Deployment](#build--deployment)
8. [Testing Strategy](#testing-strategy)
9. [Contributing Guidelines](#contributing-guidelines)

---

## Development Setup

### Prerequisites

- **Node.js:** v22.15.1 or later
- **npm:** Comes with Node.js (not yarn - VS Code switched to npm)
- **Git:** Latest version
- **macOS/Linux/Windows:** Cross-platform development supported
- **Python 3.x:** For notebook execution
- **Rust:** For certxgen (optional, if modifying certxgen)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c

# Add upstream remote (Microsoft's VS Code)
git remote add upstream https://github.com/microsoft/vscode.git

# Checkout development branch
git checkout -b bugb

# Install dependencies (takes 5-10 minutes)
npm install

# First build (takes 15-30 minutes)
npm run watch
```

### Running Specter

```bash
# Terminal 1: Watch for changes (keep running)
npm run watch

# Terminal 2: Run the IDE
./scripts/code.sh           # macOS/Linux
./scripts/code.bat          # Windows
```

### Verify Setup

```bash
# Check Node version
node --version  # Should be v22.x.x

# Check remotes
git remote -v
# origin: your fork
# upstream: microsoft/vscode

# Check current branch
git branch
# Should show: bugb
```

---

## Codebase Structure

### Root Directory

```
bsurf_b2c/
├── src/                    # Source code
│   └── vs/                 # VS Code core
│       ├── base/           # Core utilities
│       ├── editor/         # Text editor
│       ├── platform/       # Platform APIs
│       └── workbench/      # Main workbench
│           ├── contrib/    # ⭐ WHERE YOU ADD FEATURES
│           └── services/   # ⭐ WHERE YOU ADD SERVICES
├── extensions/             # Built-in extensions
├── build/                  # Build scripts
├── resources/              # Icons, images
├── documents/              # 📝 Project documentation
│   ├── 01-IDEATION.md
│   └── 02-DEVELOPMENT.md
├── product.json            # ⭐ Product configuration
├── package.json            # Dependencies
├── .build/                 # Build output (gitignored)
└── out/                    # Compiled JS (gitignored)
```

### Key Directories for Specter Development

```
src/vs/workbench/
├── contrib/
│   ├── specter/            # ⭐ YOUR MAIN FOLDER
│   │   ├── browser/        # UI components
│   │   │   ├── specterWorkbench.ts
│   │   │   ├── views/
│   │   │   │   ├── chatPanel.ts
│   │   │   │   ├── graphPanel.ts
│   │   │   │   ├── toolSelectorPanel.ts
│   │   │   │   └── marketplacePanel.ts
│   │   │   └── specter.contribution.ts
│   │   ├── common/         # Shared logic
│   │   │   ├── workflow.ts
│   │   │   ├── toolRegistry.ts
│   │   │   └── types.ts
│   │   └── node/           # Node.js specific code
│   │       └── certxgen.ts
│   ├── notebook/           # Extend notebook features
│   └── terminal/           # Extend terminal
├── services/
│   └── specter/            # ⭐ YOUR SERVICES
│       ├── browser/
│       │   └── specterService.ts
│       ├── common/
│       │   ├── agent/
│       │   │   ├── agentService.ts
│       │   │   ├── llmClient.ts
│       │   │   ├── planner.ts
│       │   │   └── notebookGenerator.ts
│       │   ├── marketplace/
│       │   │   └── marketplaceService.ts
│       │   └── execution/
│       │       ├── executionService.ts
│       │       └── progressTracker.ts
│       └── node/
└── api/                    # Extension API
```

### Specter-Specific Folders (Create These)

```bash
# Create your folder structure
mkdir -p src/vs/workbench/contrib/specter/{browser/views,common,node}
mkdir -p src/vs/workbench/services/specter/{browser,common/{agent,marketplace,execution},node}
```

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│  Specter Workbench (VS Code Base)              │
│  ┌───────────────────────────────────────────┐ │
│  │  UI Layer (Browser)                       │ │
│  │  - Chat Panel (Webview)                   │ │
│  │  - Graph Panel (Reactflow)                │ │
│  │  - Tool Selector (TreeView)               │ │
│  │  - Marketplace (Custom View)              │ │
│  └───────────────┬───────────────────────────┘ │
│                  │                              │
│  ┌───────────────▼───────────────────────────┐ │
│  │  Service Layer (Common)                   │ │
│  │  - Agent Service (LLM Integration)        │ │
│  │  - Workflow Service (Planning)            │ │
│  │  - Execution Service (Notebook Runner)    │ │
│  │  - Marketplace Service (Extension Mgmt)   │ │
│  └───────────────┬───────────────────────────┘ │
│                  │                              │
│  ┌───────────────▼───────────────────────────┐ │
│  │  Integration Layer (Node)                 │ │
│  │  - certxgen CLI Wrapper                   │ │
│  │  - Tool Registry                          │ │
│  │  - File System Access                     │ │
│  │  - Process Management                     │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │                    │
         ├────────────────────┼─────────────────┐
         ▼                    ▼                 ▼
   ┌──────────┐         ┌──────────┐     ┌──────────┐
   │ certxgen │         │  Tools   │     │   LLM    │
   │   CLI    │         │  (nmap,  │     │   APIs   │
   │          │         │  pyats,  │     │ (Claude, │
   │          │         │  etc.)   │     │  GPT-4)  │
   └──────────┘         └──────────┘     └──────────┘
```

### Data Flow: Workflow Generation

```
1. User Input (Chat Panel)
   ↓
2. Agent Service
   - Call LLM with prompt + tool registry
   - Generate workflow plan (JSON)
   ↓
3. Notebook Generator
   - Convert plan to Python notebook
   - Generate certxgen YAMLs if needed
   - Create notebook cells
   ↓
4. Visual Graph Generator
   - Parse notebook structure
   - Create Reactflow nodes/edges
   - Map cells to nodes
   ↓
5. User Review
   - Show notebook in editor
   - Show graph in panel
   - Credential input if needed
   ↓
6. Execution
   - Jupyter kernel runs notebook
   - Progress tracked via kernel events
   - Graph nodes update in real-time
   ↓
7. Results
   - Aggregate outputs
   - Display in IDE
   - Save to workspace
```

---

## Technology Stack

### Core Technologies

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **IDE Base** | VS Code | 1.106+ | Foundation |
| **Language** | TypeScript | 5.x | Primary language |
| **Runtime** | Node.js | 22.15.1+ | Server-side |
| **UI Framework** | Electron | Latest | Desktop app |
| **Build Tool** | npm scripts | - | Build system |

### Specter-Specific Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **AI/LLM** | Anthropic Claude API | Workflow planning |
| | OpenAI GPT-4 API | Alternative LLM |
| | Ollama (self-hosted) | Local LLM option |
| **Notebooks** | Jupyter | Execution engine |
| | Python 3.x | Notebook runtime |
| **Visualization** | Reactflow | Workflow graphs |
| **Automation** | certxgen (Rust CLI) | Security testing |
| **Threat Intel** | bswarm MCP Server | IP/domain intelligence |
| **Tool Integration** | nmap, pyats, Pacu, etc. | Security tools |

### Frontend Libraries

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "reactflow": "^11.x",
    "@anthropic-ai/sdk": "^0.x",
    "openai": "^4.x",
    "axios": "^1.x",
    "yaml": "^2.x"
  }
}
```

---

## Core Components

### 1. Agent Service

**Purpose:** LLM integration and workflow planning

**File:** `src/vs/workbench/services/specter/common/agent/agentService.ts`

**Key Methods:**
```typescript
interface IAgentService {
  generateWorkflow(prompt: string): Promise<WorkflowPlan>;
  getAvailableTools(): Promise<ToolMetadata[]>;
  refineWorkflow(plan: WorkflowPlan, feedback: string): Promise<WorkflowPlan>;
}
```

**Implementation Plan:**
- LLM client wrapper (Claude, GPT-4, Ollama)
- Prompt engineering templates
- Tool registry integration
- Error handling and retry logic

### 2. Workflow Service

**Purpose:** Workflow management and execution

**File:** `src/vs/workbench/services/specter/common/execution/executionService.ts`

**Key Methods:**
```typescript
interface IWorkflowService {
  createNotebook(plan: WorkflowPlan): Promise<NotebookDocument>;
  executeWorkflow(notebook: NotebookDocument): Promise<ExecutionResult>;
  trackProgress(executionId: string): Observable<ProgressUpdate>;
}
```

### 3. Tool Registry

**Purpose:** Metadata for security tools

**File:** `src/vs/workbench/services/specter/common/toolRegistry.ts`

**Data Structure:**
```typescript
interface ToolMetadata {
  id: string;
  name: string;
  version: string;
  category: ToolCategory;
  description: string;
  capabilities: string[];
  usage: {
    cliCommand: string;
    commonPatterns: CommandPattern[];
  };
  requirements: {
    permissions: string[];
    credentials: CredentialType[];
    dependencies: string[];
  };
  certxgenTemplates?: string[];
}
```

**Storage:** `src/vs/workbench/contrib/specter/common/tools-metadata/*.json`

### 4. Chat Panel

**Purpose:** Natural language interface

**File:** `src/vs/workbench/contrib/specter/browser/views/chatPanel.ts`

**Features:**
- Webview-based React UI
- Message history
- Workflow generation trigger
- Context management

### 5. Graph Panel

**Purpose:** Visual workflow representation

**File:** `src/vs/workbench/contrib/specter/browser/views/graphPanel.ts`

**Features:**
- Reactflow integration
- Real-time node updates
- Execution state visualization
- Expandable logs per node

### 6. Marketplace Service

**Purpose:** Extension discovery and installation

**File:** `src/vs/workbench/services/specter/common/marketplace/marketplaceService.ts`

**API Endpoints:**
```
GET  /api/workflows?q=<query>
GET  /api/workflows/<id>
POST /api/workflows
PUT  /api/workflows/<id>
```

---

## Development Workflow

### Branch Strategy

```
bugb (main development)
  ├── bugb/feature/chat-interface
  ├── bugb/feature/agent-service
  ├── bugb/feature/graph-visualization
  ├── bugb/feature/marketplace
  └── bugb/release/v1.0
```

### Daily Workflow

```bash
# 1. Update from origin
git checkout bugb
git pull origin bugb

# 2. Create feature branch
git checkout -b bugb/feature/your-feature

# 3. Start watch mode
npm run watch

# 4. Make changes
# Edit files in src/vs/workbench/contrib/specter/...

# 5. Test changes
./scripts/code.sh
# Reload window: Cmd+R

# 6. Commit
git add .
git commit -m "feat: add your feature"

# 7. Push to origin
git push origin bugb/feature/your-feature

# 8. Create Pull Request on GitHub
# Merge into bugb after review
```

### Syncing with Upstream (Monthly)

```bash
# Fetch Microsoft's updates
git fetch upstream

# Merge into your branch
git checkout bugb
git merge upstream/main

# Resolve conflicts if any
# Test thoroughly

# Push to origin
git push origin bugb
```

---

## Build & Deployment

### Development Build

```bash
# Watch mode (incremental builds)
npm run watch

# One-time compilation
npm run compile

# Clean rebuild
rm -rf .build out
npm run watch
```

### Production Build

```bash
# Build for specific platform
npm run gulp vscode-darwin-x64       # macOS Intel
npm run gulp vscode-darwin-arm64     # macOS Apple Silicon
npm run gulp vscode-linux-x64        # Linux
npm run gulp vscode-win32-x64        # Windows

# Output location: .build/<platform>/
```

### Distribution

```bash
# Create installer/package
# macOS: .dmg file
# Linux: .deb, .rpm, .tar.gz
# Windows: .exe installer

# Upload to: https://downloads.bugb.com/specter/
```

### Auto-Update Server

**Setup:**
1. Host update manifest at: `https://updates.bugb.com/specter/update.json`
2. Configure in `product.json`:
```json
{
  "updateUrl": "https://updates.bugb.com/specter",
  "quality": "stable"
}
```

**Update Manifest Format:**
```json
{
  "url": "https://downloads.bugb.com/specter-1.0.0.dmg",
  "version": "1.0.0",
  "productVersion": "1.0.0",
  "hash": "sha256-hash-here",
  "timestamp": 1234567890
}
```

---

## Testing Strategy

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "SpecterAgentService"

# Watch mode
npm test -- --watch
```

**Test Location:** `src/vs/workbench/contrib/specter/**/*.test.ts`

**Example Test:**
```typescript
import * as assert from 'assert';
import { AgentService } from 'vs/workbench/services/specter/common/agent/agentService';

suite('AgentService', () => {
  test('generateWorkflow returns valid plan', async () => {
    const agent = new AgentService();
    const plan = await agent.generateWorkflow('Check Redis vuln on 192.168.1.1');
    assert.ok(plan.steps.length > 0);
  });
});
```

### Integration Tests

Test complete workflows end-to-end:
- Prompt → Plan → Notebook → Execution → Results

### Manual Testing Checklist

```
[ ] Chat interface loads
[ ] Tool selector shows available tools
[ ] Workflow generation creates valid notebook
[ ] Graph visualization renders correctly
[ ] Notebook execution works
[ ] Progress tracking updates graph
[ ] Error handling displays properly
[ ] Marketplace search returns results
```

---

## Contributing Guidelines

### Code Style

- **TypeScript:** Follow existing VS Code conventions
- **Formatting:** Use Prettier (configured in `.prettierrc`)
- **Linting:** ESLint rules in `.eslintrc.json`
- **Naming:**
  - Classes: `PascalCase`
  - Functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Interfaces: `IPascalCase` (with I prefix)

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add marketplace search functionality
fix: resolve graph node rendering bug
docs: update architecture documentation
chore: update dependencies
test: add tests for agent service
```

### Pull Request Process

1. Create feature branch from `bugb`
2. Make changes with tests
3. Ensure all tests pass: `npm test`
4. Update documentation if needed
5. Create PR with description
6. Request review from team
7. Address feedback
8. Merge after approval

---

## Key File Modifications

### Files You'll Edit Frequently

| File | Purpose | When to Edit |
|------|---------|--------------|
| `product.json` | Product config | Branding, URLs, features |
| `package.json` | Dependencies | Adding npm packages |
| `src/vs/workbench/contrib/specter/**` | Features | New UI components |
| `src/vs/workbench/services/specter/**` | Services | Backend logic |
| `extensions/specter-pack/**` | Pre-installed extensions | Bundled tools |

### Files to Avoid Changing

- `src/vs/base/**` - Core VS Code utilities
- `src/vs/editor/**` - Text editor (unless absolutely necessary)
- `build/**` - Build scripts (unless build issues)

---

## Troubleshooting

### Common Issues

**Issue:** `npm install` fails
```bash
# Solution: Clear cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Issue:** Build errors after git merge
```bash
# Solution: Clean rebuild
rm -rf .build out node_modules
npm install
npm run watch
```

**Issue:** Changes not reflected in IDE
```bash
# Solution: Hard reload
# Stop npm run watch
# rm -rf out
# npm run watch
# Relaunch IDE
```

---

## Resources

### VS Code Development

- [VS Code Source](https://github.com/microsoft/vscode)
- [VS Code Wiki](https://github.com/microsoft/vscode/wiki)
- [Extension API](https://code.visualstudio.com/api)
- [Contributing Guide](https://github.com/microsoft/vscode/wiki/How-to-Contribute)

### Specter-Specific

- [certxgen Documentation](https://github.com/bugb/certxgen)
- [bswarm MCP Server](https://github.com/bugb/bswarm-mcp)
- [Team Wiki](https://wiki.bugb.com/specter)
- [Slack Channel](#specter-dev)

---

## Deployment Checklist

### Pre-Release

```
[ ] All tests pass
[ ] Documentation updated
[ ] CHANGELOG.md updated
[ ] Version bumped in product.json
[ ] Security audit completed
[ ] Performance benchmarks met
[ ] Cross-platform testing done
```

### Release Process

1. Create release branch: `bugb/release/v1.0.0`
2. Build for all platforms
3. Test installers
4. Update marketplace backend
5. Deploy update server manifest
6. Tag release: `git tag v1.0.0`
7. Push to GitHub with release notes
8. Announce on social media, Discord, blog

---

*Document Version: 1.0*  
*Last Updated: October 13, 2025*  
*Maintainer: BugB-Tech Development Team*
