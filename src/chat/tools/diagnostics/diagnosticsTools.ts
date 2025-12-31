/**
 * Diagnostics Tools - Tools for accessing IDE diagnostics (Problems panel)
 *
 * Provides agents with the ability to:
 * - Get diagnostics (errors, warnings, info) for files
 * - Filter by severity
 * - Access quick fixes
 *
 * These tools are wired to the VS Code Languages/Diagnostics API.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Severity Mapping
// =============================================================================

const SEVERITY_MAP: Record<vscode.DiagnosticSeverity, string> = {
  [vscode.DiagnosticSeverity.Error]: 'error',
  [vscode.DiagnosticSeverity.Warning]: 'warning',
  [vscode.DiagnosticSeverity.Information]: 'info',
  [vscode.DiagnosticSeverity.Hint]: 'hint',
};

const SEVERITY_PRIORITY: Record<vscode.DiagnosticSeverity, number> = {
  [vscode.DiagnosticSeverity.Error]: 0,
  [vscode.DiagnosticSeverity.Warning]: 1,
  [vscode.DiagnosticSeverity.Information]: 2,
  [vscode.DiagnosticSeverity.Hint]: 3,
};

// =============================================================================
// Get Diagnostics Tool
// =============================================================================

export const getDiagnosticsDefinition: ToolDefinition = {
  id: 'get_diagnostics',
  displayName: 'Get Diagnostics',
  modelDescription: `Get diagnostics (errors, warnings, info) from the IDE.

Returns:
- Error messages with file, line, column
- Warning messages
- Info and hints
- Source (e.g., typescript, eslint, pylint)

Use this to:
- Check for compilation errors
- See linting issues
- Understand what problems exist in the codebase`,
  userDescription: 'Get errors and warnings from the Problems panel',
  category: 'diagnostics',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'Filter diagnostics by file path (optional)',
      required: false,
    },
    {
      name: 'severity',
      type: 'string',
      description: 'Filter by severity: error, warning, info, hint (optional)',
      required: false,
      enum: ['error', 'warning', 'info', 'hint'],
    },
    {
      name: 'source',
      type: 'string',
      description: 'Filter by source (e.g., typescript, eslint)',
      required: false,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results (default: 50)',
      required: false,
      default: 50,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '⚠️',
  tags: ['diagnostics', 'errors', 'warnings', 'read'],
};

export class GetDiagnosticsTool implements ToolImplementation {
  async execute(
    params: {
      file?: string;
      severity?: string;
      source?: string;
      maxResults?: number;
    },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const maxResults = params.maxResults || 50;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      // Get all diagnostics
      let allDiagnostics: [vscode.Uri, vscode.Diagnostic[]][];

      if (params.file) {
        // Get diagnostics for specific file
        const fileUri = params.file.startsWith('/')
          ? vscode.Uri.file(params.file)
          : vscode.Uri.file(`${workspaceRoot}/${params.file}`);

        const fileDiagnostics = vscode.languages.getDiagnostics(fileUri);
        allDiagnostics = [[fileUri, fileDiagnostics]];
      } else {
        // Get all diagnostics
        allDiagnostics = vscode.languages.getDiagnostics();
      }

      // Flatten and filter
      const results: any[] = [];

      for (const [uri, diagnostics] of allDiagnostics) {
        for (const diagnostic of diagnostics) {
          // Filter by severity
          if (params.severity) {
            const severityStr = SEVERITY_MAP[diagnostic.severity];
            if (severityStr !== params.severity) {
              continue;
            }
          }

          // Filter by source
          if (params.source && diagnostic.source?.toLowerCase() !== params.source.toLowerCase()) {
            continue;
          }

          results.push({
            file: vscode.workspace.asRelativePath(uri),
            severity: SEVERITY_MAP[diagnostic.severity],
            severityPriority: SEVERITY_PRIORITY[diagnostic.severity],
            line: diagnostic.range.start.line + 1,
            column: diagnostic.range.start.character + 1,
            endLine: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1,
            message: diagnostic.message,
            source: diagnostic.source,
            code: typeof diagnostic.code === 'object'
              ? diagnostic.code.value
              : diagnostic.code,
          });

          if (results.length >= maxResults) {
            break;
          }
        }

        if (results.length >= maxResults) {
          break;
        }
      }

      // Sort by severity, then file, then line
      results.sort((a, b) => {
        if (a.severityPriority !== b.severityPriority) {
          return a.severityPriority - b.severityPriority;
        }
        if (a.file !== b.file) {
          return a.file.localeCompare(b.file);
        }
        return a.line - b.line;
      });

      // Remove the priority field before returning
      results.forEach((r) => delete r.severityPriority);

      if (results.length === 0) {
        return {
          success: true,
          content: 'No diagnostics found' + (params.file ? ` for ${params.file}` : ''),
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Format output
      const summary = {
        total: results.length,
        errors: results.filter((r) => r.severity === 'error').length,
        warnings: results.filter((r) => r.severity === 'warning').length,
        info: results.filter((r) => r.severity === 'info').length,
        hints: results.filter((r) => r.severity === 'hint').length,
      };

      return {
        success: true,
        content: JSON.stringify({ summary, diagnostics: results }, null, 2),
        artifacts: results.map((r) => ({
          type: 'diagnostic' as const,
          path: r.file,
          metadata: r,
        })),
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
// Get Quick Fixes Tool
// =============================================================================

export const getQuickFixesDefinition: ToolDefinition = {
  id: 'get_quick_fixes',
  displayName: 'Get Quick Fixes',
  modelDescription: `Get available quick fixes/code actions for a diagnostic at a specific location.`,
  userDescription: 'Get available quick fixes',
  category: 'diagnostics',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'File path',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (1-based)',
      required: true,
    },
    {
      name: 'column',
      type: 'number',
      description: 'Column number (1-based, optional, defaults to 1)',
      required: false,
      default: 1,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '💡',
  tags: ['diagnostics', 'quickfix', 'read'],
};

export class GetQuickFixesTool implements ToolImplementation {
  async execute(
    params: { file: string; line: number; column?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fileUri = params.file.startsWith('/')
        ? vscode.Uri.file(params.file)
        : vscode.Uri.file(`${workspaceRoot}/${params.file}`);

      const line = params.line - 1; // Convert to 0-based
      const column = (params.column || 1) - 1;

      const range = new vscode.Range(
        new vscode.Position(line, column),
        new vscode.Position(line, column)
      );

      // Get code actions
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        fileUri,
        range
      );

      if (!codeActions || codeActions.length === 0) {
        return {
          success: true,
          content: `No quick fixes available at ${params.file}:${params.line}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      const actions = codeActions.map((action, index) => ({
        index,
        title: action.title,
        kind: action.kind?.value,
        isPreferred: action.isPreferred,
        disabled: action.disabled?.reason,
      }));

      return {
        success: true,
        content: JSON.stringify(actions, null, 2),
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
// Apply Quick Fix Tool
// =============================================================================

export const applyQuickFixDefinition: ToolDefinition = {
  id: 'apply_quick_fix',
  displayName: 'Apply Quick Fix',
  modelDescription: `Apply a quick fix/code action at a specific location.`,
  userDescription: 'Apply a quick fix',
  category: 'diagnostics',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'File path',
      required: true,
    },
    {
      name: 'line',
      type: 'number',
      description: 'Line number (1-based)',
      required: true,
    },
    {
      name: 'fixIndex',
      type: 'number',
      description: 'Index of the quick fix to apply (from get_quick_fixes)',
      required: false,
      default: 0,
    },
    {
      name: 'fixTitle',
      type: 'string',
      description: 'Title of the fix to apply (alternative to fixIndex)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '🔧',
  tags: ['diagnostics', 'quickfix', 'write'],
};

export class ApplyQuickFixTool implements ToolImplementation {
  async execute(
    params: { file: string; line: number; fixIndex?: number; fixTitle?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fileUri = params.file.startsWith('/')
        ? vscode.Uri.file(params.file)
        : vscode.Uri.file(`${workspaceRoot}/${params.file}`);

      const line = params.line - 1;
      const range = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, 0)
      );

      // Get code actions
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        fileUri,
        range
      );

      if (!codeActions || codeActions.length === 0) {
        return {
          success: false,
          content: '',
          error: `No quick fixes available at ${params.file}:${params.line}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Find the action to apply
      let action: vscode.CodeAction | undefined;

      if (params.fixTitle) {
        action = codeActions.find((a) =>
          a.title.toLowerCase().includes(params.fixTitle!.toLowerCase())
        );
      } else {
        const index = params.fixIndex || 0;
        action = codeActions[index];
      }

      if (!action) {
        return {
          success: false,
          content: '',
          error: `Quick fix not found. Available fixes: ${codeActions.map((a) => a.title).join(', ')}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Apply the action
      if (action.edit) {
        await vscode.workspace.applyEdit(action.edit);
      }

      if (action.command) {
        await vscode.commands.executeCommand(
          action.command.command,
          ...(action.command.arguments || [])
        );
      }

      return {
        success: true,
        content: `Applied quick fix: "${action.title}"`,
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
// Get Workspace Problems Summary Tool
// =============================================================================

export const getWorkspaceProblemsSummaryDefinition: ToolDefinition = {
  id: 'get_problems_summary',
  displayName: 'Get Problems Summary',
  modelDescription: `Get a summary of all problems in the workspace, grouped by file.`,
  userDescription: 'Get a summary of all problems',
  category: 'diagnostics',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📊',
  tags: ['diagnostics', 'summary', 'read'],
};

export class GetWorkspaceProblemsSummaryTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const allDiagnostics = vscode.languages.getDiagnostics();

      let totalErrors = 0;
      let totalWarnings = 0;
      let totalInfo = 0;
      let totalHints = 0;

      const byFile: Record<string, { errors: number; warnings: number; info: number; hints: number }> = {};

      for (const [uri, diagnostics] of allDiagnostics) {
        if (diagnostics.length === 0) continue;

        const relativePath = vscode.workspace.asRelativePath(uri);
        const counts = { errors: 0, warnings: 0, info: 0, hints: 0 };

        for (const d of diagnostics) {
          switch (d.severity) {
            case vscode.DiagnosticSeverity.Error:
              counts.errors++;
              totalErrors++;
              break;
            case vscode.DiagnosticSeverity.Warning:
              counts.warnings++;
              totalWarnings++;
              break;
            case vscode.DiagnosticSeverity.Information:
              counts.info++;
              totalInfo++;
              break;
            case vscode.DiagnosticSeverity.Hint:
              counts.hints++;
              totalHints++;
              break;
          }
        }

        byFile[relativePath] = counts;
      }

      const filesWithProblems = Object.entries(byFile)
        .filter(([, counts]) => counts.errors > 0 || counts.warnings > 0)
        .sort((a, b) => (b[1].errors + b[1].warnings) - (a[1].errors + a[1].warnings));

      const summary = {
        totals: {
          errors: totalErrors,
          warnings: totalWarnings,
          info: totalInfo,
          hints: totalHints,
          filesWithProblems: filesWithProblems.length,
        },
        files: Object.fromEntries(filesWithProblems.slice(0, 20)),
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
// Register all diagnostics tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerDiagnosticsTools(registry: AriaToolRegistry): void {
  registry.registerTool(getDiagnosticsDefinition, new GetDiagnosticsTool());
  registry.registerTool(getQuickFixesDefinition, new GetQuickFixesTool());
  registry.registerTool(applyQuickFixDefinition, new ApplyQuickFixTool());
  registry.registerTool(getWorkspaceProblemsSummaryDefinition, new GetWorkspaceProblemsSummaryTool());
}
