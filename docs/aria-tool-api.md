# Aria Tool API

## Overview

The Aria Tool API provides programmatic access to IDE capabilities for Aria agents. Tools are organized by category and respect mode-based permissions.

## Tool Categories

### Terminal Tools

| Tool ID | Description | Read-Only |
|---------|-------------|-----------|
| `run_terminal` | Execute commands in the terminal | No |
| `get_terminal_output` | Get output from a terminal | Yes |
| `get_terminal_selection` | Get selected text in terminal | Yes |
| `list_terminals` | List all open terminals | Yes |

### Git/SCM Tools

| Tool ID | Description | Read-Only |
|---------|-------------|-----------|
| `git_status` | Get git repository status | Yes |
| `git_diff` | Show git diff | Yes |
| `git_stage` | Stage files for commit | No |
| `git_commit` | Commit staged changes | No |
| `git_branch` | Manage git branches | No |
| `git_push` | Push commits to remote | No |
| `git_pull` | Pull changes from remote | No |

### Debug Tools

| Tool ID | Description | Read-Only |
|---------|-------------|-----------|
| `debug_start` | Start a debug session | No |
| `debug_stop` | Stop debug session | No |
| `debug_set_breakpoint` | Set a breakpoint | No |
| `get_breakpoints` | Get all breakpoints | Yes |
| `debug_step` | Step through code | No |
| `get_variables` | Get debug variables | Yes |
| `get_call_stack` | Get the call stack | Yes |

### File Tools

| Tool ID | Description | Read-Only |
|---------|-------------|-----------|
| `read_file` | Read file contents | Yes |
| `write_file` | Write to a file | No |
| `create_file` | Create a new file | No |
| `delete_file` | Delete a file | No |
| `list_dir` | List directory contents | Yes |
| `grep` | Search for text in files | Yes |
| `find_files` | Find files by pattern | Yes |

### Diagnostics Tools

| Tool ID | Description | Read-Only |
|---------|-------------|-----------|
| `read_diagnostics` | Get problems/diagnostics | Yes |
| `get_file_diagnostics` | Get diagnostics for a file | Yes |
| `get_diagnostic_summary` | Get summary of all problems | Yes |
| `run_linter` | Run linter on files | No |

## Tool Permissions by Mode

| Mode | Permission Level | Notes |
|------|-----------------|-------|
| Agent | Full | All tools available |
| Plan | Read-only | Can read but not modify |
| Debug | Custom | Debug + read tools only |
| Ask | Read-only | Can read but not modify |
| Research | Custom | Web search + read tools |
| Code Review | Read-only | Analysis only |

## API Reference

### AriaToolRegistry

```typescript
import { AriaToolRegistry, registerAllTools } from './chat/tools';

// Initialize registry with all tools
const registry = registerAllTools();

// Get all tools
const allTools = registry.getAllTools();

// Get tools by category
const terminalTools = registry.getToolsByCategory('terminal');

// Get available tools for current mode
const available = registry.getAvailableTools();

// Invoke a tool
const result = await registry.invokeTool('read_file', {
  path: 'src/main.ts',
}, context);

// Generate tool descriptions for model
const descriptions = registry.generateToolDescriptions();

// Generate JSON schemas for function calling
const schemas = registry.generateToolSchemas();
```

### ToolPermissionService

```typescript
import { ToolPermissionService } from './chat/tools';

const permissions = ToolPermissionService.getInstance();

// Check if tool is allowed
const decision = permissions.checkPermission('write_file');
// { allowed: false, reason: '...', requiresConfirmation: false }

// Get all allowed tools
const allowed = permissions.getAllowedTools();

// Get permission summary
const summary = permissions.getPermissionSummary();
```

### Implementing Custom Tools

```typescript
import { ToolDefinition, ToolImplementation, ToolResult } from './chat/tools';

// Define the tool
const myToolDefinition: ToolDefinition = {
  id: 'my_custom_tool',
  displayName: 'My Custom Tool',
  modelDescription: 'Description for the model...',
  category: 'custom',
  parameters: [
    {
      name: 'input',
      type: 'string',
      description: 'Input parameter',
      required: true,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
};

// Implement the tool
class MyCustomTool implements ToolImplementation {
  async execute(params: { input: string }, context): Promise<ToolResult> {
    return {
      success: true,
      content: `Processed: ${params.input}`,
      executionTimeMs: 10,
    };
  }

  validate(params: Record<string, any>) {
    if (!params.input) {
      return { valid: false, error: 'input is required' };
    }
    return { valid: true };
  }
}

// Register the tool
const registry = AriaToolRegistry.getInstance();
registry.registerTool(myToolDefinition, new MyCustomTool());
```

## Tool Result Format

```typescript
interface ToolResult {
  success: boolean;
  content: string | object;
  error?: string;
  artifacts?: ToolArtifact[];
  executionTimeMs: number;
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

```json
{
  "logos.tools.confirmationTimeout": 30000,
  "logos.tools.autoApprove": ["read_file", "grep", "list_dir"],
  "logos.tools.denied": []
}
```


