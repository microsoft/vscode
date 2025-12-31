# Aria Tool API

## Overview

The Aria Tool API provides programmatic access to IDE capabilities for Aria agents. Tools are organized by category and respect mode-based permissions. All tools are wired to actual VS Code APIs for real functionality.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AriaToolRegistry                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Terminal     │  │ Git          │  │ Debug        │          │
│  │ Tools        │  │ Tools        │  │ Tools        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ File         │  │ Diagnostics  │  │ Search       │          │
│  │ Tools        │  │ Tools        │  │ Tools        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│              ToolPermissionService (Mode-based)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  VS Code APIs   │
                    └─────────────────┘
```

## Tool Categories

### Terminal Tools

| Tool ID | Description | Read-Only | VS Code API |
|---------|-------------|-----------|-------------|
| `run_terminal` | Execute commands in the terminal | No | `vscode.window.createTerminal()` |
| `get_terminal_output` | Get output from a terminal | Yes | Shell integration |
| `get_terminal_selection` | Get selected text in terminal | Yes | Terminal selection API |
| `list_terminals` | List all open terminals | Yes | `vscode.window.terminals` |

**Example:**
```typescript
// Run a command
await registry.invokeTool('run_terminal', {
  command: 'npm run build',
  explanation: 'Building the project',
  isBackground: false,
}, context);
```

### Git/SCM Tools

| Tool ID | Description | Read-Only | VS Code API |
|---------|-------------|-----------|-------------|
| `git_status` | Get git repository status | Yes | Git Extension API |
| `git_diff` | Show git diff | Yes | `repository.diff()` |
| `git_stage` | Stage files for commit | No | `repository.add()` |
| `git_commit` | Commit staged changes | No | `repository.commit()` |
| `git_branch` | Manage git branches | No | `repository.createBranch()` |
| `git_push` | Push commits to remote | No | `repository.push()` |
| `git_pull` | Pull changes from remote | No | `repository.pull()` |
| `git_log` | View commit history | Yes | `repository.log()` |

**Example:**
```typescript
// Stage and commit
await registry.invokeTool('git_stage', { files: ['src/main.ts'] }, context);
await registry.invokeTool('git_commit', { message: 'feat: add new feature' }, context);
```

### Debug Tools

| Tool ID | Description | Read-Only | VS Code API |
|---------|-------------|-----------|-------------|
| `debug_start` | Start a debug session | No | `vscode.debug.startDebugging()` |
| `debug_stop` | Stop debug session | No | `vscode.debug.stopDebugging()` |
| `debug_set_breakpoint` | Set a breakpoint | No | `vscode.debug.addBreakpoints()` |
| `debug_remove_breakpoint` | Remove a breakpoint | No | `vscode.debug.removeBreakpoints()` |
| `get_breakpoints` | Get all breakpoints | Yes | `vscode.debug.breakpoints` |
| `debug_step` | Step through code | No | Debug commands |
| `get_variables` | Get debug variables | Yes | Debug Adapter Protocol |
| `get_call_stack` | Get the call stack | Yes | DAP `stackTrace` |
| `debug_evaluate` | Evaluate an expression | Yes | DAP `evaluate` |

**Example:**
```typescript
// Set a conditional breakpoint
await registry.invokeTool('debug_set_breakpoint', {
  file: 'src/utils.ts',
  line: 42,
  condition: 'count > 10',
}, context);
```

### File Tools

| Tool ID | Description | Read-Only | VS Code API |
|---------|-------------|-----------|-------------|
| `read_file` | Read file contents | Yes | `vscode.workspace.fs.readFile()` |
| `write_file` | Write to a file | No | `vscode.workspace.fs.writeFile()` |
| `create_file` | Create a new file | No | `vscode.workspace.fs.writeFile()` |
| `delete_file` | Delete a file | No | `vscode.workspace.fs.delete()` |
| `list_dir` | List directory contents | Yes | `vscode.workspace.fs.readDirectory()` |
| `grep` | Search for text in files | Yes | `vscode.workspace.findTextInFiles()` |
| `find_files` | Find files by pattern | Yes | `vscode.workspace.findFiles()` |

**Example:**
```typescript
// Search/replace edit
await registry.invokeTool('write_file', {
  path: 'src/config.ts',
  old_string: 'const DEBUG = false;',
  new_string: 'const DEBUG = true;',
}, context);
```

### Diagnostics Tools

| Tool ID | Description | Read-Only | VS Code API |
|---------|-------------|-----------|-------------|
| `get_diagnostics` | Get problems/diagnostics | Yes | `vscode.languages.getDiagnostics()` |
| `get_quick_fixes` | Get available quick fixes | Yes | `vscode.executeCodeActionProvider` |
| `apply_quick_fix` | Apply a quick fix | No | `vscode.workspace.applyEdit()` |
| `get_problems_summary` | Get summary of all problems | Yes | Diagnostics aggregation |

**Example:**
```typescript
// Get errors in a file
const result = await registry.invokeTool('get_diagnostics', {
  file: 'src/main.ts',
  severity: 'error',
}, context);
```

## Tool Permissions by Mode

| Mode | Allowed Tools | Notes |
|------|--------------|-------|
| **Agent** | `*` (All) | Full access to all tools |
| **Plan** | `read_file`, `list_dir`, `grep`, `find_files`, `get_diagnostics` | Read-only analysis |
| **Debug** | Read tools + `run_terminal`, `debug_*`, `get_*` | Debug-focused access |
| **Ask** | `read_file`, `list_dir`, `grep`, `find_files` | Minimal read-only |
| **Research** | `read_file`, `grep`, `web_search`, `athena_research` | Research-focused |
| **Code Review** | `read_file`, `git_diff`, `git_log`, `get_diagnostics` | Review-focused |

## API Reference

### AriaToolRegistry

```typescript
import { AriaToolRegistry } from './chat/tools';

const registry = AriaToolRegistry.getInstance();

// Get all registered tools
const allTools = registry.getAllTools();

// Get tools by category
const terminalTools = registry.getToolsByCategory('terminal');

// Get tools available in current mode
const available = registry.getAvailableTools();
const availableInDebug = registry.getAvailableTools('debug');

// Check if a specific tool is available
const canWrite = registry.isToolAvailable('write_file');

// Invoke a tool
const result = await registry.invokeTool('read_file', {
  path: 'src/main.ts',
  offset: 1,
  limit: 50,
}, {
  mode: 'agent',
  sessionId: 'session-123',
  workspacePath: '/path/to/workspace',
});

// Generate tool descriptions for model prompt
const descriptions = registry.generateToolDescriptions();

// Generate JSON schemas for function calling
const schemas = registry.generateToolSchemas();
```

### ToolPermissionService (d3n-core)

```python
from d3n_core.agents.logos.tool_filter import get_tool_filter, AriaMode

tool_filter = get_tool_filter()

# Get tools available in a mode
tools = tool_filter.filter_tools_for_mode(AriaMode.DEBUG)

# Validate a tool invocation
result = tool_filter.validate_invocation(invocation)
# result.allowed, result.reason, result.requires_confirmation

# Filter tool calls from LLM response
filtered_calls = tool_filter.filter_tool_calls_in_response(tool_calls, AriaMode.PLAN)
```

### Implementing Custom Tools

```typescript
import { ToolDefinition, ToolImplementation, ToolResult } from './chat/tools';
import { AriaToolRegistry } from './chat/tools/AriaToolRegistry';

// 1. Define the tool
const myToolDefinition: ToolDefinition = {
  id: 'my_custom_tool',
  displayName: 'My Custom Tool',
  modelDescription: `Description shown to the model...`,
  userDescription: 'Short description for UI',
  category: 'custom',
  parameters: [
    {
      name: 'input',
      type: 'string',
      description: 'Input parameter',
      required: true,
    },
    {
      name: 'options',
      type: 'object',
      description: 'Optional configuration',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🔧',
  tags: ['custom', 'utility'],
};

// 2. Implement the tool
class MyCustomTool implements ToolImplementation {
  async execute(
    params: { input: string; options?: any },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // Your tool logic here
      const result = `Processed: ${params.input}`;

      return {
        success: true,
        content: result,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
      };
    }
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.input || typeof params.input !== 'string') {
      return { valid: false, error: 'input is required and must be a string' };
    }
    return { valid: true };
  }
}

// 3. Register the tool
const registry = AriaToolRegistry.getInstance();
registry.registerTool(myToolDefinition, new MyCustomTool());
```

## Tool Result Format

```typescript
interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean;

  /** Result content (string or structured object) */
  content: string | object;

  /** Error message if failed */
  error?: string;

  /** Artifacts produced (files, diffs, etc.) */
  artifacts?: ToolArtifact[];

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Whether user confirmation was required */
  wasConfirmed?: boolean;
}

interface ToolArtifact {
  type: 'file' | 'diff' | 'terminal_output' | 'diagnostic';
  path?: string;
  content?: string;
  metadata?: Record<string, any>;
}
```

## Configuration

In VS Code settings (`settings.json`):

```json
{
  "logos.tools.confirmBeforeExecute": true,
  "logos.tools.showToolOutput": true,
  "logos.defaultMode": "agent"
}
```

## Tool Invocation Flow

```
User Request → Mode Check → Tool Filter → Validate Params → Execute → Return Result
                   │              │             │              │
                   ▼              ▼             ▼              ▼
              Check mode     Filter by     Validate      Call VS Code
              config         allowlist     parameters    API
```

## Error Handling

Tools should:
1. Return `success: false` with descriptive `error` message on failure
2. Never throw exceptions to the caller
3. Include partial results in `content` when possible
4. Set appropriate `executionTimeMs` even on failure
