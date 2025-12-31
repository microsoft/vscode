/**
 * Debug Tools - Tools for debugging operations
 *
 * Provides agents with the ability to:
 * - Start/stop debug sessions
 * - Manage breakpoints
 * - Step through code
 * - Inspect variables
 * - View call stack
 *
 * These tools are wired to the VS Code Debug API.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Debug Session Manager
// =============================================================================

class DebugSessionManager {
  private static instance: DebugSessionManager;
  private activeSessions: Map<string, vscode.DebugSession> = new Map();

  private constructor() {
    // Track session starts and stops
    vscode.debug.onDidStartDebugSession((session) => {
      this.activeSessions.set(session.id, session);
    });

    vscode.debug.onDidTerminateDebugSession((session) => {
      this.activeSessions.delete(session.id);
    });
  }

  static getInstance(): DebugSessionManager {
    if (!DebugSessionManager.instance) {
      DebugSessionManager.instance = new DebugSessionManager();
    }
    return DebugSessionManager.instance;
  }

  getActiveSession(): vscode.DebugSession | undefined {
    return vscode.debug.activeDebugSession;
  }

  getAllSessions(): vscode.DebugSession[] {
    return Array.from(this.activeSessions.values());
  }

  isDebugging(): boolean {
    return vscode.debug.activeDebugSession !== undefined;
  }
}

// =============================================================================
// Start Debug Session Tool
// =============================================================================

export const startDebugDefinition: ToolDefinition = {
  id: 'debug_start',
  displayName: 'Start Debug Session',
  modelDescription: `Start a debug session. Can use:
- A launch configuration by name
- Auto-detect based on file type
- Attach to a running process`,
  userDescription: 'Start a debugging session',
  category: 'debug',
  parameters: [
    {
      name: 'configuration',
      type: 'string',
      description: 'Name of the launch configuration to use',
      required: false,
    },
    {
      name: 'file',
      type: 'string',
      description: 'File to debug (for auto-detect)',
      required: false,
    },
    {
      name: 'noDebug',
      type: 'boolean',
      description: 'Run without debugging (just execute)',
      required: false,
      default: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '▶️',
  tags: ['debug', 'start', 'write'],
};

export class StartDebugTool implements ToolImplementation {
  private sessionManager = DebugSessionManager.getInstance();

  async execute(
    params: { configuration?: string; file?: string; noDebug?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // Check if already debugging
      if (this.sessionManager.isDebugging()) {
        return {
          success: false,
          content: '',
          error: 'A debug session is already running. Stop it first with debug_stop.',
          executionTimeMs: performance.now() - startTime,
        };
      }

      let config: vscode.DebugConfiguration | string | undefined = params.configuration;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      // If no configuration specified, try to find one
      if (!config && params.file) {
        // Create an ad-hoc configuration based on file extension
        const fileUri = vscode.Uri.file(
          params.file.startsWith('/')
            ? params.file
            : `${workspaceFolder?.uri.fsPath}/${params.file}`
        );

        const ext = params.file.split('.').pop()?.toLowerCase();
        
        switch (ext) {
          case 'js':
          case 'mjs':
            config = {
              type: 'node',
              request: 'launch',
              name: 'Debug JS File',
              program: fileUri.fsPath,
              skipFiles: ['<node_internals>/**'],
            };
            break;
          case 'ts':
            config = {
              type: 'node',
              request: 'launch',
              name: 'Debug TS File',
              program: fileUri.fsPath,
              preLaunchTask: 'tsc: build - tsconfig.json',
              outFiles: ['${workspaceFolder}/**/*.js'],
              skipFiles: ['<node_internals>/**'],
            };
            break;
          case 'py':
            config = {
              type: 'python',
              request: 'launch',
              name: 'Debug Python File',
              program: fileUri.fsPath,
            };
            break;
          default:
            // Let VS Code try to auto-detect
            break;
        }
      }

      const options: vscode.DebugSessionOptions = {
        noDebug: params.noDebug,
      };

      const success = await vscode.debug.startDebugging(
        workspaceFolder,
        config || undefined,
        options
      );

      if (!success) {
        return {
          success: false,
          content: '',
          error: 'Failed to start debug session. Check your launch.json configuration.',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Wait for session to start
      await new Promise((resolve) => setTimeout(resolve, 500));

      const session = this.sessionManager.getActiveSession();
      return {
        success: true,
        content: `Debug session started: ${session?.name || 'Unknown'}`,
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
// Stop Debug Session Tool
// =============================================================================

export const stopDebugDefinition: ToolDefinition = {
  id: 'debug_stop',
  displayName: 'Stop Debug Session',
  modelDescription: `Stop the current debug session or disconnect from attached process.`,
  userDescription: 'Stop the debugging session',
  category: 'debug',
  parameters: [
    {
      name: 'terminateDebuggee',
      type: 'boolean',
      description: 'Also terminate the debugged process (default: true)',
      required: false,
      default: true,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: false,
  icon: '⏹️',
  tags: ['debug', 'stop', 'write'],
};

export class StopDebugTool implements ToolImplementation {
  async execute(
    params: { terminateDebuggee?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: true,
          content: 'No active debug session to stop',
          executionTimeMs: performance.now() - startTime,
        };
      }

      const sessionName = session.name;
      await vscode.debug.stopDebugging(session);

      return {
        success: true,
        content: `Debug session stopped: ${sessionName}`,
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
// Set Breakpoint Tool
// =============================================================================

export const setBreakpointDefinition: ToolDefinition = {
  id: 'debug_set_breakpoint',
  displayName: 'Set Breakpoint',
  modelDescription: `Set a breakpoint at a specific location. Supports:
- Line breakpoints
- Conditional breakpoints
- Log points (non-breaking)`,
  userDescription: 'Set a breakpoint',
  category: 'debug',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'File path for the breakpoint',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number for the breakpoint (1-based)',
      required: true,
    },
    {
      name: 'condition',
      type: 'string',
      description: 'Condition expression (optional)',
      required: false,
    },
    {
      name: 'logMessage',
      type: 'string',
      description: 'Log message instead of breaking (creates a logpoint)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: false,
  icon: '🔴',
  tags: ['debug', 'breakpoint', 'write'],
};

export class SetBreakpointTool implements ToolImplementation {
  async execute(
    params: { file: string; line: number; condition?: string; logMessage?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fileUri = vscode.Uri.file(
        params.file.startsWith('/') ? params.file : `${workspaceRoot}/${params.file}`
      );

      const location = new vscode.Location(
        fileUri,
        new vscode.Position(params.line - 1, 0) // Convert to 0-based
      );

      const breakpoint = new vscode.SourceBreakpoint(
        location,
        true, // enabled
        params.condition,
        undefined, // hitCondition
        params.logMessage
      );

      vscode.debug.addBreakpoints([breakpoint]);

      const bpType = params.logMessage ? 'Logpoint' : params.condition ? 'Conditional breakpoint' : 'Breakpoint';

      return {
        success: true,
        content: `${bpType} set at ${vscode.workspace.asRelativePath(fileUri)}:${params.line}${params.condition ? ` (condition: ${params.condition})` : ''}`,
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
    if (!params.file) return { valid: false, error: 'file is required' };
    if (!params.line || typeof params.line !== 'number') {
      return { valid: false, error: 'line is required and must be a number' };
    }
    if (params.line < 1) {
      return { valid: false, error: 'line must be 1 or greater' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Remove Breakpoint Tool
// =============================================================================

export const removeBreakpointDefinition: ToolDefinition = {
  id: 'debug_remove_breakpoint',
  displayName: 'Remove Breakpoint',
  modelDescription: `Remove a breakpoint at a specific location.`,
  userDescription: 'Remove a breakpoint',
  category: 'debug',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'File path of the breakpoint',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number of the breakpoint (1-based)',
      required: true,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: false,
  icon: '⭕',
  tags: ['debug', 'breakpoint', 'write'],
};

export class RemoveBreakpointTool implements ToolImplementation {
  async execute(
    params: { file: string; line: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fileUri = vscode.Uri.file(
        params.file.startsWith('/') ? params.file : `${workspaceRoot}/${params.file}`
      );

      const breakpoints = vscode.debug.breakpoints.filter((bp) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return (
            bp.location.uri.fsPath === fileUri.fsPath &&
            bp.location.range.start.line === params.line - 1
          );
        }
        return false;
      });

      if (breakpoints.length === 0) {
        return {
          success: true,
          content: `No breakpoint found at ${vscode.workspace.asRelativePath(fileUri)}:${params.line}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      vscode.debug.removeBreakpoints(breakpoints);

      return {
        success: true,
        content: `Removed breakpoint at ${vscode.workspace.asRelativePath(fileUri)}:${params.line}`,
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
// Get Breakpoints Tool
// =============================================================================

export const getBreakpointsDefinition: ToolDefinition = {
  id: 'get_breakpoints',
  displayName: 'Get Breakpoints',
  modelDescription: `Get all breakpoints in the workspace or a specific file.`,
  userDescription: 'List all breakpoints',
  category: 'debug',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'Filter by file path (optional)',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📍',
  tags: ['debug', 'breakpoint', 'read'],
};

export class GetBreakpointsTool implements ToolImplementation {
  async execute(
    params: { file?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      let breakpoints = vscode.debug.breakpoints;

      // Filter by file if specified
      if (params.file) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const fileUri = vscode.Uri.file(
          params.file.startsWith('/') ? params.file : `${workspaceRoot}/${params.file}`
        );

        breakpoints = breakpoints.filter((bp) => {
          if (bp instanceof vscode.SourceBreakpoint) {
            return bp.location.uri.fsPath === fileUri.fsPath;
          }
          return false;
        });
      }

      const formattedBreakpoints = breakpoints.map((bp, index) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return {
            id: index,
            type: 'source',
            file: vscode.workspace.asRelativePath(bp.location.uri),
            line: bp.location.range.start.line + 1,
            enabled: bp.enabled,
            condition: bp.condition,
            logMessage: bp.logMessage,
          };
        } else if (bp instanceof vscode.FunctionBreakpoint) {
          return {
            id: index,
            type: 'function',
            functionName: bp.functionName,
            enabled: bp.enabled,
            condition: bp.condition,
          };
        }
        return { id: index, type: 'unknown' };
      });

      return {
        success: true,
        content: JSON.stringify(formattedBreakpoints, null, 2),
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
// Step Through Code Tools
// =============================================================================

export const debugStepDefinition: ToolDefinition = {
  id: 'debug_step',
  displayName: 'Debug Step',
  modelDescription: `Step through code during debugging:
- stepOver: Execute current line, step over function calls
- stepInto: Step into function calls
- stepOut: Step out of current function
- continue: Continue execution until next breakpoint
- pause: Pause execution`,
  userDescription: 'Step through code',
  category: 'debug',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Step action to perform',
      required: true,
      enum: ['stepOver', 'stepInto', 'stepOut', 'continue', 'pause'],
    },
  ],
  isReadOnly: false,
  requiresConfirmation: false,
  icon: '⏩',
  tags: ['debug', 'step', 'write'],
};

export class DebugStepTool implements ToolImplementation {
  async execute(
    params: { action: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const session = vscode.debug.activeDebugSession;
      if (!session && params.action !== 'pause') {
        return {
          success: false,
          content: '',
          error: 'No active debug session. Start one first with debug_start.',
          executionTimeMs: performance.now() - startTime,
        };
      }

      switch (params.action) {
        case 'stepOver':
          await vscode.commands.executeCommand('workbench.action.debug.stepOver');
          break;
        case 'stepInto':
          await vscode.commands.executeCommand('workbench.action.debug.stepInto');
          break;
        case 'stepOut':
          await vscode.commands.executeCommand('workbench.action.debug.stepOut');
          break;
        case 'continue':
          await vscode.commands.executeCommand('workbench.action.debug.continue');
          break;
        case 'pause':
          await vscode.commands.executeCommand('workbench.action.debug.pause');
          break;
        default:
          return {
            success: false,
            content: '',
            error: `Unknown action: ${params.action}`,
            executionTimeMs: performance.now() - startTime,
          };
      }

      return {
        success: true,
        content: `Executed: ${params.action}`,
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
    const validActions = ['stepOver', 'stepInto', 'stepOut', 'continue', 'pause'];
    if (!validActions.includes(params.action)) {
      return { valid: false, error: `action must be one of: ${validActions.join(', ')}` };
    }
    return { valid: true };
  }
}

// =============================================================================
// Get Variables Tool
// =============================================================================

export const getVariablesDefinition: ToolDefinition = {
  id: 'get_variables',
  displayName: 'Get Variables',
  modelDescription: `Get variables in the current debug scope. Shows:
- Local variables
- Arguments
- Global variables
- Watch expressions`,
  userDescription: 'Get debug variables',
  category: 'debug',
  parameters: [
    {
      name: 'scope',
      type: 'string',
      description: 'Scope to get variables from',
      required: false,
      enum: ['local', 'global', 'closure'],
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📊',
  tags: ['debug', 'variables', 'read'],
};

export class GetVariablesTool implements ToolImplementation {
  async execute(
    params: { scope?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          content: '',
          error: 'No active debug session',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Get stack trace to find current frame
      const stackResponse = await session.customRequest('stackTrace', {
        threadId: 1, // Default thread
        startFrame: 0,
        levels: 1,
      });

      if (!stackResponse.stackFrames || stackResponse.stackFrames.length === 0) {
        return {
          success: false,
          content: '',
          error: 'No stack frames available. Is the debugger paused?',
          executionTimeMs: performance.now() - startTime,
        };
      }

      const frameId = stackResponse.stackFrames[0].id;

      // Get scopes for current frame
      const scopesResponse = await session.customRequest('scopes', { frameId });

      const variables: Record<string, any> = {};

      for (const scope of scopesResponse.scopes) {
        if (params.scope && !scope.name.toLowerCase().includes(params.scope.toLowerCase())) {
          continue;
        }

        // Get variables in this scope
        const varsResponse = await session.customRequest('variables', {
          variablesReference: scope.variablesReference,
        });

        variables[scope.name] = varsResponse.variables.map((v: any) => ({
          name: v.name,
          value: v.value,
          type: v.type,
        }));
      }

      return {
        success: true,
        content: JSON.stringify(variables, null, 2),
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
// Get Call Stack Tool
// =============================================================================

export const getCallStackDefinition: ToolDefinition = {
  id: 'get_call_stack',
  displayName: 'Get Call Stack',
  modelDescription: `Get the current call stack showing function calls leading to the current position.`,
  userDescription: 'Get the call stack',
  category: 'debug',
  parameters: [
    {
      name: 'maxFrames',
      type: 'number',
      description: 'Maximum number of frames to retrieve (default: 20)',
      required: false,
      default: 20,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📚',
  tags: ['debug', 'callstack', 'read'],
};

export class GetCallStackTool implements ToolImplementation {
  async execute(
    params: { maxFrames?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          content: '',
          error: 'No active debug session',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Get threads
      const threadsResponse = await session.customRequest('threads', {});
      
      const allStacks: Record<string, any[]> = {};

      for (const thread of threadsResponse.threads || []) {
        const stackResponse = await session.customRequest('stackTrace', {
          threadId: thread.id,
          startFrame: 0,
          levels: params.maxFrames || 20,
        });

        allStacks[`Thread ${thread.id}: ${thread.name}`] = stackResponse.stackFrames.map(
          (frame: any) => ({
            id: frame.id,
            name: frame.name,
            file: frame.source?.path
              ? vscode.workspace.asRelativePath(frame.source.path)
              : frame.source?.name,
            line: frame.line,
            column: frame.column,
          })
        );
      }

      return {
        success: true,
        content: JSON.stringify(allStacks, null, 2),
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
// Evaluate Expression Tool
// =============================================================================

export const evaluateExpressionDefinition: ToolDefinition = {
  id: 'debug_evaluate',
  displayName: 'Evaluate Expression',
  modelDescription: `Evaluate an expression in the current debug context.`,
  userDescription: 'Evaluate an expression',
  category: 'debug',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'The expression to evaluate',
      required: true,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🔬',
  tags: ['debug', 'evaluate', 'read'],
};

export class EvaluateExpressionTool implements ToolImplementation {
  async execute(
    params: { expression: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          content: '',
          error: 'No active debug session',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Get current frame
      const stackResponse = await session.customRequest('stackTrace', {
        threadId: 1,
        startFrame: 0,
        levels: 1,
      });

      const frameId = stackResponse.stackFrames?.[0]?.id;

      const response = await session.customRequest('evaluate', {
        expression: params.expression,
        frameId,
        context: 'watch',
      });

      return {
        success: true,
        content: JSON.stringify(
          {
            expression: params.expression,
            result: response.result,
            type: response.type,
          },
          null,
          2
        ),
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
    if (!params.expression || typeof params.expression !== 'string') {
      return { valid: false, error: 'expression is required' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Register all debug tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerDebugTools(registry: AriaToolRegistry): void {
  registry.registerTool(startDebugDefinition, new StartDebugTool());
  registry.registerTool(stopDebugDefinition, new StopDebugTool());
  registry.registerTool(setBreakpointDefinition, new SetBreakpointTool());
  registry.registerTool(removeBreakpointDefinition, new RemoveBreakpointTool());
  registry.registerTool(getBreakpointsDefinition, new GetBreakpointsTool());
  registry.registerTool(debugStepDefinition, new DebugStepTool());
  registry.registerTool(getVariablesDefinition, new GetVariablesTool());
  registry.registerTool(getCallStackDefinition, new GetCallStackTool());
  registry.registerTool(evaluateExpressionDefinition, new EvaluateExpressionTool());
}
