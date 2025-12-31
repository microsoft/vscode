/**
 * Terminal Tools - Tools for terminal operations
 *
 * Provides agents with the ability to:
 * - Execute commands in the terminal
 * - Get terminal output
 * - Get terminal selection
 * - List active terminals
 *
 * These tools are wired to the VS Code Terminal API.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Terminal Session Manager - Tracks terminals created by Aria
// =============================================================================

interface TrackedTerminal {
  terminal: vscode.Terminal;
  id: string;
  createdAt: number;
  lastCommand?: string;
  isBackground: boolean;
  outputBuffer: string[];
  sessionId: string;
}

class TerminalSessionManager {
  private static instance: TerminalSessionManager;
  private terminals: Map<string, TrackedTerminal> = new Map();
  private outputListeners: Map<string, vscode.Disposable> = new Map();

  private constructor() {
    // Listen for terminal disposal
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [id, tracked] of this.terminals) {
        if (tracked.terminal === terminal) {
          this.terminals.delete(id);
          const listener = this.outputListeners.get(id);
          if (listener) {
            listener.dispose();
            this.outputListeners.delete(id);
          }
          break;
        }
      }
    });
  }

  static getInstance(): TerminalSessionManager {
    if (!TerminalSessionManager.instance) {
      TerminalSessionManager.instance = new TerminalSessionManager();
    }
    return TerminalSessionManager.instance;
  }

  getOrCreateTerminal(
    sessionId: string,
    cwd?: string,
    isBackground: boolean = false
  ): TrackedTerminal {
    // For foreground commands, reuse existing session terminal
    if (!isBackground) {
      const existing = this.getSessionTerminal(sessionId);
      if (existing) {
        return existing;
      }
    }

    // Create new terminal
    const id = `aria-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const terminalOptions: vscode.TerminalOptions = {
      name: isBackground ? `Aria Background (${id.slice(-6)})` : `Aria Terminal`,
      cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      iconPath: new vscode.ThemeIcon('sparkle'),
    };

    const terminal = vscode.window.createTerminal(terminalOptions);

    const tracked: TrackedTerminal = {
      terminal,
      id,
      createdAt: Date.now(),
      isBackground,
      outputBuffer: [],
      sessionId,
    };

    this.terminals.set(id, tracked);

    // Set up shell integration output capture if available
    this.setupOutputCapture(tracked);

    return tracked;
  }

  private setupOutputCapture(tracked: TrackedTerminal): void {
    // Use shell integration for output capture when available
    // This requires VS Code 1.93+ with terminal shell integration
    try {
      const shellIntegration = (tracked.terminal as any).shellIntegration;
      if (shellIntegration) {
        // Listen for command execution via shell integration
        const listener = shellIntegration.onDidEndCommandExecution?.((e: any) => {
          if (e.output) {
            tracked.outputBuffer.push(e.output);
            // Keep buffer at reasonable size
            if (tracked.outputBuffer.length > 1000) {
              tracked.outputBuffer = tracked.outputBuffer.slice(-500);
            }
          }
        });
        if (listener) {
          this.outputListeners.set(tracked.id, listener);
        }
      }
    } catch (e) {
      // Shell integration not available
      console.debug('[TerminalTools] Shell integration not available for output capture');
    }
  }

  getTerminal(id: string): TrackedTerminal | undefined {
    return this.terminals.get(id);
  }

  getSessionTerminal(sessionId: string): TrackedTerminal | undefined {
    for (const tracked of this.terminals.values()) {
      if (tracked.sessionId === sessionId && !tracked.isBackground) {
        return tracked;
      }
    }
    return undefined;
  }

  getAllTerminals(): TrackedTerminal[] {
    return Array.from(this.terminals.values());
  }

  getActiveTerminal(): TrackedTerminal | undefined {
    const active = vscode.window.activeTerminal;
    if (!active) return undefined;

    for (const tracked of this.terminals.values()) {
      if (tracked.terminal === active) {
        return tracked;
      }
    }
    return undefined;
  }

  appendOutput(id: string, output: string): void {
    const tracked = this.terminals.get(id);
    if (tracked) {
      tracked.outputBuffer.push(output);
    }
  }
}

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
  private sessionManager = TerminalSessionManager.getInstance();

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
      const isBackground = params.isBackground ?? false;

      // Get or create terminal for this session
      const tracked = this.sessionManager.getOrCreateTerminal(
        context.sessionId,
        params.cwd,
        isBackground
      );

      // Show terminal (preserveFocus for background commands)
      tracked.terminal.show(!isBackground);

      // Record the command
      tracked.lastCommand = params.command;

      // Send the command
      tracked.terminal.sendText(params.command, true);

      if (isBackground) {
        return {
          success: true,
          content: `Command started in background terminal.\nTerminal ID: ${tracked.id}\nCommand: ${params.command}\n\nUse get_terminal_output with this terminal ID to check output later.`,
          artifacts: [
            {
              type: 'terminal_output',
              metadata: {
                terminalId: tracked.id,
                command: params.command,
                isBackground: true,
              },
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      }

      // For foreground commands, wait a bit for output
      // In production, this would use shell integration to detect command completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to get output via shell integration
      let output = '';
      try {
        const shellIntegration = (tracked.terminal as any).shellIntegration;
        if (shellIntegration?.commandDetection?.commands?.length > 0) {
          const lastExecution = shellIntegration.commandDetection.commands.slice(-1)[0];
          if (lastExecution?.output) {
            output = lastExecution.output;
          }
        }
      } catch (e) {
        // Shell integration output not available
      }

      // Fallback: check output buffer
      if (!output && tracked.outputBuffer.length > 0) {
        output = tracked.outputBuffer.slice(-10).join('\n');
      }

      const resultContent = output
        ? `$ ${params.command}\n${output}`
        : `Command executed: ${params.command}\n\n(Output capture requires VS Code terminal shell integration. The command was sent to the terminal.)`;

      return {
        success: true,
        content: resultContent,
        artifacts: [
          {
            type: 'terminal_output',
            content: resultContent,
            metadata: {
              terminalId: tracked.id,
              command: params.command,
              exitCode: 0, // Would be captured via shell integration
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
  private sessionManager = TerminalSessionManager.getInstance();

  async execute(
    params: { terminalId?: string; lines?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const lines = params.lines || 100;

      // Find the terminal
      let tracked: TrackedTerminal | undefined;
      if (params.terminalId) {
        tracked = this.sessionManager.getTerminal(params.terminalId);
        if (!tracked) {
          return {
            success: false,
            content: '',
            error: `Terminal not found: ${params.terminalId}`,
            executionTimeMs: performance.now() - startTime,
          };
        }
      } else {
        // Try session terminal first, then active terminal
        tracked =
          this.sessionManager.getSessionTerminal(context.sessionId) ||
          this.sessionManager.getActiveTerminal();
      }

      if (!tracked) {
        return {
          success: false,
          content: '',
          error: 'No terminal found. Create one first using run_terminal.',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Try to get output via shell integration
      let output = '';
      try {
        const shellIntegration = (tracked.terminal as any).shellIntegration;
        if (shellIntegration?.commandDetection?.commands?.length > 0) {
          const recentCommands = shellIntegration.commandDetection.commands.slice(-5);
          output = recentCommands
            .map((cmd: any) => `$ ${cmd.commandLine}\n${cmd.output || '(no output)'}`)
            .join('\n\n');
        }
      } catch (e) {
        // Shell integration not available
      }

      // Fallback to output buffer
      if (!output && tracked.outputBuffer.length > 0) {
        output = tracked.outputBuffer.slice(-lines).join('\n');
      }

      if (!output) {
        output = `Terminal ${tracked.id} exists but no output captured yet.\n`;
        output += `Last command: ${tracked.lastCommand || 'none'}\n`;
        output += `\nNote: Full output capture requires VS Code terminal shell integration.`;
      }

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
      const terminal = vscode.window.activeTerminal;
      if (!terminal) {
        return {
          success: true,
          content: 'No active terminal',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Try to get selection via shell integration
      let selection = '';
      try {
        const shellIntegration = (terminal as any).shellIntegration;
        if (shellIntegration?.selection) {
          selection = shellIntegration.selection;
        }
      } catch (e) {
        // Shell integration selection not available
      }

      // Alternative: use clipboard if user copied
      if (!selection) {
        try {
          // Check if there's terminal selection via xterm
          const xtermState = (terminal as any)._xterm;
          if (xtermState?.hasSelection?.()) {
            selection = xtermState.getSelection?.() || '';
          }
        } catch (e) {
          // xterm access not available
        }
      }

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
  modelDescription: `List all open terminals with their IDs, names, and status.`,
  userDescription: 'List all open terminal sessions',
  category: 'terminal',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📋',
  tags: ['terminal', 'list', 'read'],
};

export class ListTerminalsTool implements ToolImplementation {
  private sessionManager = TerminalSessionManager.getInstance();

  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // Get all VS Code terminals
      const vscodeTerminals = vscode.window.terminals;

      // Get tracked Aria terminals
      const ariaTerminals = this.sessionManager.getAllTerminals();
      const ariaTerminalSet = new Set(ariaTerminals.map((t) => t.terminal));

      const terminalList = vscodeTerminals.map((terminal, index) => {
        const ariaTracked = ariaTerminals.find((t) => t.terminal === terminal);

        return {
          index,
          name: terminal.name,
          id: ariaTracked?.id || `vscode-${index}`,
          isAriaManaged: ariaTerminalSet.has(terminal),
          isBackground: ariaTracked?.isBackground || false,
          lastCommand: ariaTracked?.lastCommand,
          createdAt: ariaTracked?.createdAt,
          processId: terminal.processId,
        };
      });

      return {
        success: true,
        content: JSON.stringify(terminalList, null, 2),
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
