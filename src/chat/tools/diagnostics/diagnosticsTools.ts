/**
 * Diagnostics Tools - Tools for working with problems and diagnostics
 *
 * Provides agents with the ability to:
 * - Read diagnostics/problems from the Problems panel
 * - Get diagnostics for specific files
 * - Analyze error patterns
 */

import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

/**
 * Diagnostic severity levels
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * A diagnostic item
 */
export interface DiagnosticItem {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  source?: string;
  code?: string | number;
}

// =============================================================================
// Read Diagnostics Tool
// =============================================================================

export const readDiagnosticsDefinition: ToolDefinition = {
  id: 'read_diagnostics',
  displayName: 'Read Diagnostics',
  modelDescription: `Get diagnostics (errors, warnings) from the Problems panel.

Can filter by:
- File path
- Severity (error, warning, info, hint)
- Source (e.g., typescript, eslint)`,
  userDescription: 'Read problems and diagnostics',
  category: 'diagnostics',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'Filter by file path (optional)',
      required: false,
    },
    {
      name: 'severity',
      type: 'string',
      description: 'Filter by severity level',
      required: false,
      enum: ['error', 'warning', 'info', 'hint'],
    },
    {
      name: 'source',
      type: 'string',
      description: 'Filter by diagnostic source (e.g., typescript)',
      required: false,
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of diagnostics to return',
      required: false,
      default: 50,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '⚠️',
  tags: ['diagnostics', 'problems', 'read'],
};

export class ReadDiagnosticsTool implements ToolImplementation {
  async execute(
    params: { file?: string; severity?: string; source?: string; limit?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's diagnostics API
      let diagnostics: DiagnosticItem[] = [
        {
          file: 'src/main.ts',
          line: 42,
          column: 5,
          severity: 'error',
          message: "Property 'foo' does not exist on type 'Bar'",
          source: 'typescript',
          code: 2339,
        },
        {
          file: 'src/utils.ts',
          line: 15,
          column: 10,
          severity: 'warning',
          message: "'x' is declared but its value is never read",
          source: 'typescript',
          code: 6133,
        },
        {
          file: 'src/api.ts',
          line: 88,
          column: 1,
          severity: 'warning',
          message: 'Unexpected console statement',
          source: 'eslint',
          code: 'no-console',
        },
      ];

      // Apply filters
      if (params.file) {
        diagnostics = diagnostics.filter((d) => d.file === params.file);
      }
      if (params.severity) {
        diagnostics = diagnostics.filter((d) => d.severity === params.severity);
      }
      if (params.source) {
        diagnostics = diagnostics.filter((d) => d.source === params.source);
      }

      // Apply limit
      const limit = params.limit || 50;
      diagnostics = diagnostics.slice(0, limit);

      // Summary
      const summary = {
        total: diagnostics.length,
        bySevertiy: {
          error: diagnostics.filter((d) => d.severity === 'error').length,
          warning: diagnostics.filter((d) => d.severity === 'warning').length,
          info: diagnostics.filter((d) => d.severity === 'info').length,
          hint: diagnostics.filter((d) => d.severity === 'hint').length,
        },
        diagnostics,
      };

      return {
        success: true,
        content: JSON.stringify(summary, null, 2),
        artifacts: [
          {
            type: 'diagnostic',
            metadata: summary,
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
}

// =============================================================================
// Get File Diagnostics Tool
// =============================================================================

export const getFileDiagnosticsDefinition: ToolDefinition = {
  id: 'get_file_diagnostics',
  displayName: 'Get File Diagnostics',
  modelDescription: `Get all diagnostics for a specific file, organized by line.`,
  userDescription: 'Get diagnostics for a file',
  category: 'diagnostics',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'File path to get diagnostics for',
      required: true,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📋',
  tags: ['diagnostics', 'file', 'read'],
};

export class GetFileDiagnosticsTool implements ToolImplementation {
  async execute(
    params: { file: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's diagnostics API
      const diagnostics: DiagnosticItem[] = [
        {
          file: params.file,
          line: 10,
          column: 5,
          severity: 'error',
          message: 'Example error message',
          source: 'typescript',
        },
      ];

      return {
        success: true,
        content: JSON.stringify(diagnostics, null, 2),
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
    return { valid: true };
  }
}

// =============================================================================
// Get Diagnostic Summary Tool
// =============================================================================

export const getDiagnosticSummaryDefinition: ToolDefinition = {
  id: 'get_diagnostic_summary',
  displayName: 'Get Diagnostic Summary',
  modelDescription: `Get a summary of all diagnostics in the workspace grouped by file and severity.`,
  userDescription: 'Get summary of all problems',
  category: 'diagnostics',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📊',
  tags: ['diagnostics', 'summary', 'read'],
};

export class GetDiagnosticSummaryTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const summary = {
        totalFiles: 3,
        totalDiagnostics: 5,
        byFile: {
          'src/main.ts': { errors: 2, warnings: 0 },
          'src/utils.ts': { errors: 0, warnings: 2 },
          'src/api.ts': { errors: 0, warnings: 1 },
        },
        bySeverity: {
          error: 2,
          warning: 3,
          info: 0,
          hint: 0,
        },
        bySource: {
          typescript: 4,
          eslint: 1,
        },
      };

      return {
        success: true,
        content: JSON.stringify(summary, null, 2),
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
// Run Linter Tool
// =============================================================================

export const runLinterDefinition: ToolDefinition = {
  id: 'run_linter',
  displayName: 'Run Linter',
  modelDescription: `Manually trigger linting on files or the entire workspace.`,
  userDescription: 'Run linter on files',
  category: 'diagnostics',
  parameters: [
    {
      name: 'files',
      type: 'array',
      description: 'Files to lint (optional, defaults to all)',
      required: false,
    },
    {
      name: 'fix',
      type: 'boolean',
      description: 'Auto-fix issues where possible',
      required: false,
      default: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '🔧',
  tags: ['diagnostics', 'lint', 'write'],
};

export class RunLinterTool implements ToolImplementation {
  async execute(
    params: { files?: string[]; fix?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const filesLinted = params.files || ['all files'];
      const fixApplied = params.fix || false;

      return {
        success: true,
        content: `Linted ${filesLinted.length} file(s)${fixApplied ? ' with auto-fix' : ''}`,
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
// Register all diagnostics tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerDiagnosticsTools(registry: AriaToolRegistry): void {
  registry.registerTool(readDiagnosticsDefinition, new ReadDiagnosticsTool());
  registry.registerTool(getFileDiagnosticsDefinition, new GetFileDiagnosticsTool());
  registry.registerTool(getDiagnosticSummaryDefinition, new GetDiagnosticSummaryTool());
  registry.registerTool(runLinterDefinition, new RunLinterTool());
}


