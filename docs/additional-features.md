# Additional Logos Features

This document covers additional features implemented for the Aria Tool API and Planning System.

## Table of Contents

1. [Research Tools](#research-tools)
2. [Workspace Analysis](#workspace-analysis)
3. [Auto Mode Detection](#auto-mode-detection)
4. [Plan Import/Export](#plan-importexport)
5. [Unit Tests](#unit-tests)

---

## Research Tools

Research mode now includes fully functional tools for web search and deep research via Athena.

### Web Search (`web_search`)

Search the web for current information on any topic.

```typescript
// Example usage
const result = await registry.invokeTool('web_search', {
  query: 'TypeScript 5.4 new features',
  maxResults: 10,
}, context);
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | The search query |
| `maxResults` | number | No | Maximum results (default: 10) |

### Fetch URL (`fetch_url`)

Fetch and extract content from any URL.

```typescript
const result = await registry.invokeTool('fetch_url', {
  url: 'https://docs.example.com/api',
  extractText: true,
}, context);
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |
| `extractText` | boolean | No | Extract readable text from HTML (default: true) |

### Athena Deep Research (`athena_research`)

Conduct comprehensive research using Athena's 12-step research pipeline.

```typescript
const result = await registry.invokeTool('athena_research', {
  question: 'What are the best practices for implementing OAuth2 in a microservices architecture?',
  timeout: 120,
}, context);
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `question` | string | Yes | The research question |
| `timeout` | number | No | Max wait time in seconds (default: 120) |

**Returns:**
- Session ID for tracking
- Research threads with sources and propositions
- Synthesized narrative with citations

### Create Citation (`create_citation`)

Generate properly formatted citations in APA, MLA, or Chicago style.

```typescript
const result = await registry.invokeTool('create_citation', {
  url: 'https://example.com/article',
  title: 'Understanding Microservices',
  author: 'John Doe',
  date: '2024-01-15',
  style: 'apa',
}, context);
```

### Configuration

Configure Athena connection in VS Code settings:

```json
{
  "logos.athena.baseUrl": "https://athena.bravozero.ai"
}
```

---

## Workspace Analysis

Two new tools for understanding workspace structure and content.

### Workspace Analysis (`workspace_analysis`)

Get a comprehensive analysis of the workspace including:
- Project structure overview
- Detected languages and frameworks
- Dependencies (npm, Python, Go)
- File statistics by type

```typescript
const result = await registry.invokeTool('workspace_analysis', {
  includeStats: true,
  detectDeps: true,
  maxDepth: 4,
}, context);
```

**Example Output:**
```json
{
  "workspace": {
    "name": "my-project",
    "path": "/Users/me/my-project"
  },
  "technologies": {
    "language": ["TypeScript", "Python"],
    "framework": ["React", "FastAPI"],
    "build": ["Vite"],
    "testing": ["Vitest", "Pytest"]
  },
  "dependencies": {
    "npm": {
      "dependencies": 25,
      "devDependencies": 15,
      "scripts": ["dev", "build", "test"]
    },
    "python": {
      "packages": 12
    }
  },
  "stats": {
    "ts": 45,
    "tsx": 23,
    "py": 18
  }
}
```

### Get Project Summary (`get_project_summary`)

Get a concise summary including README, package.json info, and architecture docs.

```typescript
const result = await registry.invokeTool('get_project_summary', {}, context);
```

---

## Auto Mode Detection

Logos can automatically detect the most appropriate mode based on query content.

### How It Works

The `AutoModeDetector` analyzes queries using pattern matching:

```typescript
import { autoModeDetector } from './modes/AutoModeDetector';

// Detect appropriate mode for a query
const detection = autoModeDetector.detectMode('debug the authentication error');
// Result: { suggestedMode: 'debug', confidence: 0.85, reason: 'Matched: debug, error' }

// Check if should switch from current mode
const should = autoModeDetector.shouldSwitchMode(
  'research the best caching strategies',
  'agent',
  0.5
);
// Result: { shouldSwitch: true, newMode: 'research', reason: 'Matched: research, best' }
```

### Detection Patterns

| Mode | Key Patterns |
|------|--------------|
| **Agent** | implement, create, build, fix, change, run, execute |
| **Plan** | plan, design, architect, strategy, "just plan", "don't execute" |
| **Debug** | debug, error, bug, crash, exception, "not working" |
| **Ask** | what is, how does, explain, help me understand |
| **Research** | research, compare, best practice, state of the art |
| **Code Review** | review, audit, analyze code, security, quality |

### Configuration

Enable/disable in settings:

```json
{
  "logos.autoModeSwitch": true
}
```

### Integration

Auto mode detection integrates with the chat system:

```typescript
// In chat handler
if (config.autoModeSwitch) {
  const should = autoModeDetector.shouldSwitchMode(query, currentMode);
  if (should.shouldSwitch) {
    // Show notification and optionally switch
    vscode.window.showInformationMessage(
      `Suggestion: Switch to ${should.newMode} mode for this query`
    );
  }
}
```

---

## Plan Import/Export

Plans can be imported and exported in multiple formats.

### Export Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| `markdown` | .md | Markdown with YAML frontmatter |
| `json` | .json | Structured JSON with schema |
| `github` | .md | GitHub Issues checklist format |
| `plain` | .txt | Plain text task list |
| `cursor` | .md | Cursor-compatible format |

### Export Example

```typescript
import { planImportExport } from './planning/PlanImportExport';

// Export to markdown
const markdown = planImportExport.export(plan, {
  format: 'markdown',
  includeMetadata: true,
  includeStatus: true,
  includeComplexity: true,
});

// Export to file (shows save dialog)
const uri = await planImportExport.exportToFile(plan, {
  format: 'json',
  includeMetadata: true,
});
```

### Import Example

```typescript
// Import with auto-detection
const result = planImportExport.import(content, 'auto', sessionId, 'plan');

if (result.success) {
  console.log(`Imported plan: ${result.plan.name}`);
  console.log(`Detected format: ${result.detectedFormat}`);
} else {
  console.error(`Import failed: ${result.error}`);
}

// Import from file (shows open dialog)
const fileResult = await planImportExport.importFromFile(sessionId, 'plan');
```

### Markdown Format Example

```markdown
---
id: plan-typescript-migration
name: "TypeScript Migration"
status: active
createdAt: 2024-12-31T10:00:00Z
createdByMode: plan
tags: ["migration", "typescript"]
---

# TypeScript Migration

## Overview

Migrate the utils directory from JavaScript to TypeScript.

## Tasks

- [x] Create tsconfig.json (complexity: 2/5)
- [ ] Rename *.js to *.ts
- [ ] Add type annotations [in_progress]
- [ ] Update imports
- [ ] Configure build pipeline
```

### JSON Format Example

```json
{
  "$schema": "https://logos.bravozero.ai/schemas/plan.json",
  "version": "1.0",
  "id": "plan-typescript-migration",
  "name": "TypeScript Migration",
  "overview": "Migrate the utils directory from JavaScript to TypeScript.",
  "items": [
    {
      "id": "item-1",
      "content": "Create tsconfig.json",
      "status": "completed",
      "complexity": 2
    },
    {
      "id": "item-2",
      "content": "Rename *.js to *.ts",
      "status": "pending"
    }
  ],
  "metadata": {
    "createdAt": "2024-12-31T10:00:00Z",
    "tags": ["migration", "typescript"]
  }
}
```

---

## Unit Tests

Comprehensive unit tests are provided for all tool implementations.

### Test Structure

```
src/chat/tools/__tests__/
├── terminalTools.test.ts
├── gitTools.test.ts
├── fileTools.test.ts
├── debugTools.test.ts
└── diagnosticsTools.test.ts
```

### Running Tests

```bash
# Run all tool tests
npm run test -- src/chat/tools

# Run specific test file
npm run test -- src/chat/tools/__tests__/terminalTools.test.ts

# Run with coverage
npm run test:coverage -- src/chat/tools
```

### Test Coverage

| Category | Tests | Coverage |
|----------|-------|----------|
| Terminal | 12 | Tool definitions, validation, execution |
| Git | 18 | All operations, parameter validation |
| File | 22 | CRUD operations, search, validation |
| Debug | 15 | Session management, breakpoints, stepping |
| Diagnostics | 10 | Diagnostics retrieval, quick fixes |

### Example Test

```typescript
describe('RunInTerminalTool', () => {
  let tool: RunInTerminalTool;

  beforeEach(() => {
    tool = new RunInTerminalTool();
  });

  it('validates required parameters', () => {
    const noCommand = tool.validate({});
    expect(noCommand.valid).toBe(false);
    expect(noCommand.error).toContain('command');

    const valid = tool.validate({
      command: 'echo test',
      explanation: 'Test command',
    });
    expect(valid.valid).toBe(true);
  });

  it('executes command and returns result', async () => {
    const result = await tool.execute(
      {
        command: 'echo "Hello World"',
        explanation: 'Test echo command',
        isBackground: false,
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.executionTimeMs).toBeGreaterThan(0);
  });
});
```

---

## Summary

These additional features enhance Logos with:

1. **Research Tools** - Web search, URL fetching, and Athena integration for deep research
2. **Workspace Analysis** - Technology detection and project structure analysis
3. **Auto Mode Detection** - Intelligent mode suggestions based on query content
4. **Plan Import/Export** - Multi-format support for sharing and version control
5. **Unit Tests** - Comprehensive testing for all tool implementations

All features are fully documented and integrate seamlessly with the existing Aria mode system.

