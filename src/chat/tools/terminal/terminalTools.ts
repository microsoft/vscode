/**
 * Terminal Tools - Tools for terminal operations
 *
 * Provides agents with the ability to:
 * - Execute commands in the terminal
 * - Get terminal output
 * - Get terminal selection
 * - List active terminals
 */

import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Run in Terminal Tool
// =============================================================================

export const runInTerminalDefinition: ToolDefinition = {
  id: 'run_terminal',
  displayName: 'Run in Terminal',
  modelDescription: `Execute a command in the terminal. The command runs in a persistent shell session.
  
Use this for:
- Running build commands (npm run build, make, etc.)
- Starting/stopping servers
- Running tests
- Git operations
- Package installation

Background processes: Set isBackground=true for long-running commands like servers.`,
  userDescription: 'Run a command in the terminal',
  category: 'terminal',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The command to execute',
      required: true,
    },
    {
      name: 'explanation',
      type: 'string',
      description: 'One-sentence description of what the command does',
      required: true,
    },
    {
      name: 'isBackground',
      type: 'boolean',
      description: 'Whether the command should run in the background (for servers, watchers)',
      required: false,
      default: false,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory for the command (defaults to workspace root)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '⌨️',
  tags: ['terminal', 'execute', 'shell'],
};

export class RunInTerminalTool implements ToolImplementation {
  async execute(
    params: {
      command: string;
      explanation: string;
      isBackground?: boolean;
      cwd?: string;
    },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's terminal API
      // For now, we simulate the behavior

      console.log(
        `[Terminal] Executing: ${params.command}`,
        params.isBackground ? '(background)' : ''
      );

      // Simulate command execution
      const terminalId = `terminal-${Date.now()}`;

      if (params.isBackground) {
        return {
          success: true,
          content: `Command started in background. Terminal ID: ${terminalId}`,
          artifacts: [
            {
              type: 'terminal_output',
              metadata: {
                terminalId,
                command: params.command,
                isBackground: true,
              },
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      }

      // For foreground commands, we would wait for completion
      // and capture output
      const simulatedOutput = `$ ${params.command}\n[Command output would appear here]`;

      return {
        success: true,
        content: simulatedOutput,
        artifacts: [
          {
            type: 'terminal_output',
            content: simulatedOutput,
            metadata: {
              terminalId,
              command: params.command,
              exitCode: 0,
            },
          },
        ],
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
    if (!params.command || typeof params.command !== 'string') {
      return { valid: false, error: 'command is required and must be a string' };
    }
    if (!params.explanation || typeof params.explanation !== 'string') {
      return { valid: false, error: 'explanation is required' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Get Terminal Output Tool
// =============================================================================

export const getTerminalOutputDefinition: ToolDefinition = {
  id: 'get_terminal_output',
  displayName: 'Get Terminal Output',
  modelDescription: `Get the output from a terminal, optionally filtering by terminal ID.
  
Use this to:
- Check the output of a background process
- See error messages from a failed command
- Monitor long-running processes`,
  userDescription: 'Get output from a terminal',
  category: 'terminal',
  parameters: [
    {
      name: 'terminalId',
      type: 'string',
      description: 'ID of the terminal to get output from (optional, defaults to last active)',
      required: false,
    },
    {
      name: 'lines',
      type: 'number',
      description: 'Number of lines to retrieve (default: 100)',
      required: false,
      default: 100,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📄',
  tags: ['terminal', 'output', 'read'],
};

export class GetTerminalOutputTool implements ToolImplementation {
  async execute(
    params: { terminalId?: string; lines?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const lines = params.lines || 100;

      // In a real implementation, this would use VS Code's terminal API
      const output = `[Terminal output - last ${lines} lines would appear here]`;

      return {
        success: true,
        content: output,
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
}

// =============================================================================
// Get Terminal Selection Tool
// =============================================================================

export const getTerminalSelectionDefinition: ToolDefinition = {
  id: 'get_terminal_selection',
  displayName: 'Get Terminal Selection',
  modelDescription: `Get the currently selected text in the active terminal.
  
Useful for:
- Getting specific output the user highlighted
- Working with selected error messages`,
  userDescription: 'Get selected text from the terminal',
  category: 'terminal',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '✂️',
  tags: ['terminal', 'selection', 'read'],
};

export class GetTerminalSelectionTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's terminal API
      const selection = '';

      return {
        success: true,
        content: selection || 'No text selected in terminal',
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
}

// =============================================================================
// List Terminals Tool
// =============================================================================

export const listTerminalsDefinition: ToolDefinition = {
  id: 'list_terminals',
  displayName: 'List Terminals',
  modelDescription: `List all open terminals with their IDs, names, and current working directories.`,
  userDescription: 'List all open terminal sessions',
  category: 'terminal',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📋',
  tags: ['terminal', 'list', 'read'],
};

export class ListTerminalsTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's terminal API
      const terminals = [
        { id: 'term-1', name: 'bash', cwd: context.workspacePath },
      ];

      return {
        success: true,
        content: JSON.stringify(terminals, null, 2),
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
}

// =============================================================================
// Register all terminal tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerTerminalTools(registry: AriaToolRegistry): void {
  registry.registerTool(runInTerminalDefinition, new RunInTerminalTool());
  registry.registerTool(getTerminalOutputDefinition, new GetTerminalOutputTool());
  registry.registerTool(getTerminalSelectionDefinition, new GetTerminalSelectionTool());
  registry.registerTool(listTerminalsDefinition, new ListTerminalsTool());
}

