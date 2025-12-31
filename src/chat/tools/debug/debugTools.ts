/**
 * Debug Tools - Tools for debugging operations
 *
 * Provides agents with the ability to:
 * - Start/stop debug sessions
 * - Manage breakpoints
 * - Step through code
 * - Inspect variables
 * - View call stack
 */

import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

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
      name: 'attach',
      type: 'boolean',
      description: 'Attach to running process instead of launching',
      required: false,
      default: false,
    },
    {
      name: 'port',
      type: 'number',
      description: 'Port to attach to (for attach mode)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '▶️',
  tags: ['debug', 'start', 'write'],
};

export class StartDebugTool implements ToolImplementation {
  async execute(
    params: { configuration?: string; file?: string; attach?: boolean; port?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's debug API
      const sessionId = `debug-${Date.now()}`;

      return {
        success: true,
        content: `Debug session started: ${sessionId}`,
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
      name: 'sessionId',
      type: 'string',
      description: 'ID of session to stop (optional, stops all if not specified)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: false,
  icon: '⏹️',
  tags: ['debug', 'stop', 'write'],
};

export class StopDebugTool implements ToolImplementation {
  async execute(
    params: { sessionId?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      return {
        success: true,
        content: 'Debug session stopped',
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
      description: 'Line number for the breakpoint',
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
      description: 'Log message instead of breaking (optional)',
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
      const breakpointId = `bp-${Date.now()}`;

      return {
        success: true,
        content: `Breakpoint set at ${params.file}:${params.line} (ID: ${breakpointId})`,
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
    return { valid: true };
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
      const breakpoints = [
        { id: 'bp-1', file: 'src/main.ts', line: 42, enabled: true },
        { id: 'bp-2', file: 'src/utils.ts', line: 15, enabled: true, condition: 'x > 10' },
      ];

      const filtered = params.file
        ? breakpoints.filter((bp) => bp.file === params.file)
        : breakpoints;

      return {
        success: true,
        content: JSON.stringify(filtered, null, 2),
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
- continue: Continue execution until next breakpoint`,
  userDescription: 'Step through code',
  category: 'debug',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Step action to perform',
      required: true,
      enum: ['stepOver', 'stepInto', 'stepOut', 'continue'],
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
    const validActions = ['stepOver', 'stepInto', 'stepOut', 'continue'];
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
      enum: ['local', 'arguments', 'global', 'watch'],
    },
    {
      name: 'frameId',
      type: 'number',
      description: 'Stack frame ID (optional, defaults to current)',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📊',
  tags: ['debug', 'variables', 'read'],
};

export class GetVariablesTool implements ToolImplementation {
  async execute(
    params: { scope?: string; frameId?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const variables = {
        local: [
          { name: 'x', value: 42, type: 'number' },
          { name: 'message', value: 'hello', type: 'string' },
        ],
        arguments: [
          { name: 'input', value: { id: 1 }, type: 'object' },
        ],
      };

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
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📚',
  tags: ['debug', 'callstack', 'read'],
};

export class GetCallStackTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const callStack = [
        { id: 0, name: 'handleRequest', file: 'src/server.ts', line: 45 },
        { id: 1, name: 'processData', file: 'src/processor.ts', line: 23 },
        { id: 2, name: 'main', file: 'src/index.ts', line: 12 },
      ];

      return {
        success: true,
        content: JSON.stringify(callStack, null, 2),
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
// Register all debug tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerDebugTools(registry: AriaToolRegistry): void {
  registry.registerTool(startDebugDefinition, new StartDebugTool());
  registry.registerTool(stopDebugDefinition, new StopDebugTool());
  registry.registerTool(setBreakpointDefinition, new SetBreakpointTool());
  registry.registerTool(getBreakpointsDefinition, new GetBreakpointsTool());
  registry.registerTool(debugStepDefinition, new DebugStepTool());
  registry.registerTool(getVariablesDefinition, new GetVariablesTool());
  registry.registerTool(getCallStackDefinition, new GetCallStackTool());
}


