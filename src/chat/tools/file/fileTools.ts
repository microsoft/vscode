/**
 * File Tools - Tools for file system operations
 *
 * Provides agents with the ability to:
 * - Read files
 * - Write/edit files
 * - Create files
 * - Delete files
 * - List directories
 * - Search files
 *
 * These tools are wired to the VS Code FileSystem API.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Helper Functions
// =============================================================================

function resolveFilePath(path: string, workspacePath?: string): vscode.Uri {
  if (path.startsWith('/') || path.match(/^[a-zA-Z]:\\/)) {
    // Absolute path
    return vscode.Uri.file(path);
  }
  // Relative path
  const root = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  return vscode.Uri.file(`${root}/${path}`);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// =============================================================================
// Read File Tool
// =============================================================================

export const readFileDefinition: ToolDefinition = {
  id: 'read_file',
  displayName: 'Read File',
  modelDescription: `Read the contents of a file. Supports:
- Full file read
- Partial read with line range (offset/limit)
- Image files (returns base64)`,
  userDescription: 'Read a file',
  category: 'file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file (relative to workspace or absolute)',
      required: true,
    },
    {
      name: 'offset',
      type: 'number',
      description: 'Starting line number (1-based)',
      required: false,
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Number of lines to read',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📄',
  tags: ['file', 'read'],
};

export class ReadFileTool implements ToolImplementation {
  async execute(
    params: { path: string; offset?: number; limit?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const fileUri = resolveFilePath(params.path, context.workspacePath);

      // Check if file exists
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch (e) {
        return {
          success: false,
          content: '',
          error: `File not found: ${params.path}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Check if it's an image file
      const ext = params.path.split('.').pop()?.toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
      
      if (ext && imageExts.includes(ext)) {
        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
        const base64 = Buffer.from(contentBytes).toString('base64');
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        
        return {
          success: true,
          content: `data:${mimeType};base64,${base64}`,
          artifacts: [
            {
              type: 'file',
              path: params.path,
              metadata: { isImage: true, mimeType },
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Read text file
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      let content = Buffer.from(contentBytes).toString('utf8');

      // Apply line filtering if specified
      if (params.offset || params.limit) {
        const lines = content.split('\n');
        const startLine = (params.offset || 1) - 1; // Convert to 0-based
        const endLine = params.limit ? startLine + params.limit : lines.length;
        
        const selectedLines = lines.slice(startLine, endLine);
        
        // Add line numbers
        content = selectedLines
          .map((line, i) => `${String(startLine + i + 1).padStart(6)}|${line}`)
          .join('\n');
      } else {
        // Add line numbers to all lines
        const lines = content.split('\n');
        content = lines
          .map((line, i) => `${String(i + 1).padStart(6)}|${line}`)
          .join('\n');
      }

      return {
        success: true,
        content,
        artifacts: [
          {
            type: 'file',
            path: params.path,
            content,
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
    if (!params.path || typeof params.path !== 'string') {
      return { valid: false, error: 'path is required and must be a string' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Write File Tool
// =============================================================================

export const writeFileDefinition: ToolDefinition = {
  id: 'write_file',
  displayName: 'Write File',
  modelDescription: `Write content to a file. Creates the file if it doesn't exist.
Can also do search/replace edits using old_string/new_string.`,
  userDescription: 'Write to a file',
  category: 'file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file',
      required: true,
    },
    {
      name: 'contents',
      type: 'string',
      description: 'Full content to write (use for new files or full rewrites)',
      required: false,
    },
    {
      name: 'old_string',
      type: 'string',
      description: 'Text to find and replace (for edits)',
      required: false,
    },
    {
      name: 'new_string',
      type: 'string',
      description: 'Replacement text',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '✏️',
  tags: ['file', 'write', 'edit'],
};

export class WriteFileTool implements ToolImplementation {
  async execute(
    params: { path: string; contents?: string; old_string?: string; new_string?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const fileUri = resolveFilePath(params.path, context.workspacePath);

      if (params.old_string !== undefined && params.new_string !== undefined) {
        // Search/replace mode - file must exist
        let existingContent: string;
        try {
          const bytes = await vscode.workspace.fs.readFile(fileUri);
          existingContent = Buffer.from(bytes).toString('utf8');
        } catch (e) {
          return {
            success: false,
            content: '',
            error: `File not found for edit: ${params.path}`,
            executionTimeMs: performance.now() - startTime,
          };
        }

        // Check if old_string exists
        if (!existingContent.includes(params.old_string)) {
          return {
            success: false,
            content: '',
            error: `old_string not found in file. The file may have changed or the string doesn't match exactly.`,
            executionTimeMs: performance.now() - startTime,
          };
        }

        // Count occurrences
        const occurrences = existingContent.split(params.old_string).length - 1;
        if (occurrences > 1) {
          return {
            success: false,
            content: '',
            error: `old_string appears ${occurrences} times. Please provide more context to make it unique.`,
            executionTimeMs: performance.now() - startTime,
          };
        }

        // Perform replacement
        const newContent = existingContent.replace(params.old_string, params.new_string);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(newContent, 'utf8'));

        // Generate diff preview
        const oldLines = params.old_string.split('\n').length;
        const newLines = params.new_string.split('\n').length;

        return {
          success: true,
          content: `Replaced text in ${params.path} (${oldLines} lines → ${newLines} lines)`,
          artifacts: [
            {
              type: 'diff',
              path: params.path,
              metadata: {
                operation: 'replace',
                old: params.old_string.slice(0, 100) + (params.old_string.length > 100 ? '...' : ''),
                new: params.new_string.slice(0, 100) + (params.new_string.length > 100 ? '...' : ''),
              },
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      } else if (params.contents !== undefined) {
        // Full write mode
        // Create parent directories if needed
        const parentUri = vscode.Uri.file(fileUri.fsPath.split('/').slice(0, -1).join('/'));
        try {
          await vscode.workspace.fs.stat(parentUri);
        } catch {
          await vscode.workspace.fs.createDirectory(parentUri);
        }

        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(params.contents, 'utf8'));

        return {
          success: true,
          content: `Wrote ${params.contents.length} characters to ${params.path}`,
          artifacts: [
            {
              type: 'file',
              path: params.path,
              content: params.contents,
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      } else {
        return {
          success: false,
          content: '',
          error: 'Must provide either contents or old_string/new_string',
          executionTimeMs: performance.now() - startTime,
        };
      }
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
    if (!params.path) {
      return { valid: false, error: 'path is required' };
    }
    if (params.contents === undefined && params.old_string === undefined) {
      return { valid: false, error: 'Must provide either contents or old_string' };
    }
    if (params.old_string !== undefined && params.new_string === undefined) {
      return { valid: false, error: 'new_string is required when using old_string' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Create File Tool
// =============================================================================

export const createFileDefinition: ToolDefinition = {
  id: 'create_file',
  displayName: 'Create File',
  modelDescription: `Create a new file with the specified content.
Creates parent directories if they don't exist.`,
  userDescription: 'Create a new file',
  category: 'file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path for the new file',
      required: true,
    },
    {
      name: 'contents',
      type: 'string',
      description: 'Content for the new file',
      required: true,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '📝',
  tags: ['file', 'create', 'write'],
};

export class CreateFileTool implements ToolImplementation {
  async execute(
    params: { path: string; contents: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const fileUri = resolveFilePath(params.path, context.workspacePath);

      // Check if file already exists
      try {
        await vscode.workspace.fs.stat(fileUri);
        return {
          success: false,
          content: '',
          error: `File already exists: ${params.path}. Use write_file to modify existing files.`,
          executionTimeMs: performance.now() - startTime,
        };
      } catch {
        // File doesn't exist, which is what we want
      }

      // Create parent directories if needed
      const parentPath = fileUri.fsPath.substring(0, fileUri.fsPath.lastIndexOf('/'));
      const parentUri = vscode.Uri.file(parentPath);
      try {
        await vscode.workspace.fs.stat(parentUri);
      } catch {
        await vscode.workspace.fs.createDirectory(parentUri);
      }

      // Write file
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(params.contents, 'utf8'));

      return {
        success: true,
        content: `Created file: ${params.path} (${params.contents.length} characters)`,
        artifacts: [
          {
            type: 'file',
            path: params.path,
            content: params.contents,
            metadata: { created: true },
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
    if (!params.path) return { valid: false, error: 'path is required' };
    if (params.contents === undefined) return { valid: false, error: 'contents is required' };
    return { valid: true };
  }
}

// =============================================================================
// Delete File Tool
// =============================================================================

export const deleteFileDefinition: ToolDefinition = {
  id: 'delete_file',
  displayName: 'Delete File',
  modelDescription: `Delete a file from the workspace.`,
  userDescription: 'Delete a file',
  category: 'file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to delete',
      required: true,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '🗑️',
  tags: ['file', 'delete', 'write'],
};

export class DeleteFileTool implements ToolImplementation {
  async execute(
    params: { path: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const fileUri = resolveFilePath(params.path, context.workspacePath);

      // Check if file exists
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        return {
          success: false,
          content: '',
          error: `File not found: ${params.path}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      await vscode.workspace.fs.delete(fileUri, { recursive: false, useTrash: true });

      return {
        success: true,
        content: `Deleted file: ${params.path} (moved to trash)`,
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
    if (!params.path) return { valid: false, error: 'path is required' };
    return { valid: true };
  }
}

// =============================================================================
// List Directory Tool
// =============================================================================

export const listDirDefinition: ToolDefinition = {
  id: 'list_dir',
  displayName: 'List Directory',
  modelDescription: `List files and directories in a path. Shows file types, sizes, and modification times.`,
  userDescription: 'List directory contents',
  category: 'file',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Directory path to list',
      required: true,
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'Include subdirectories recursively',
      required: false,
      default: false,
    },
    {
      name: 'maxDepth',
      type: 'number',
      description: 'Maximum depth for recursive listing',
      required: false,
      default: 3,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📁',
  tags: ['file', 'list', 'read'],
};

export class ListDirTool implements ToolImplementation {
  async execute(
    params: { path: string; recursive?: boolean; maxDepth?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const dirUri = resolveFilePath(params.path, context.workspacePath);

      // Check if directory exists
      let stat: vscode.FileStat;
      try {
        stat = await vscode.workspace.fs.stat(dirUri);
      } catch {
        return {
          success: false,
          content: '',
          error: `Directory not found: ${params.path}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      if (stat.type !== vscode.FileType.Directory) {
        return {
          success: false,
          content: '',
          error: `Not a directory: ${params.path}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      const entries = await this.listDirectory(
        dirUri,
        params.recursive || false,
        params.maxDepth || 3,
        0
      );

      return {
        success: true,
        content: JSON.stringify(entries, null, 2),
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

  private async listDirectory(
    uri: vscode.Uri,
    recursive: boolean,
    maxDepth: number,
    currentDepth: number
  ): Promise<any[]> {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const results: any[] = [];

    for (const [name, type] of entries) {
      // Skip hidden files and common ignored directories
      if (name.startsWith('.') || ['node_modules', '__pycache__', 'dist', 'build'].includes(name)) {
        continue;
      }

      const entryUri = vscode.Uri.joinPath(uri, name);
      const isDir = type === vscode.FileType.Directory;

      const entry: any = {
        name: isDir ? `${name}/` : name,
        type: isDir ? 'directory' : 'file',
      };

      if (!isDir) {
        try {
          const stat = await vscode.workspace.fs.stat(entryUri);
          entry.size = formatFileSize(stat.size);
          entry.modified = new Date(stat.mtime).toISOString().split('T')[0];
        } catch {
          // Ignore stat errors
        }
      }

      if (isDir && recursive && currentDepth < maxDepth) {
        entry.children = await this.listDirectory(entryUri, true, maxDepth, currentDepth + 1);
      }

      results.push(entry);
    }

    // Sort: directories first, then alphabetically
    results.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.path) return { valid: false, error: 'path is required' };
    return { valid: true };
  }
}

// =============================================================================
// Search Files Tool (Grep)
// =============================================================================

export const grepDefinition: ToolDefinition = {
  id: 'grep',
  displayName: 'Search Files',
  modelDescription: `Search for a pattern in files. Uses VS Code's built-in search.

Supports:
- Regular expressions
- File type filtering
- Glob patterns
- Context lines`,
  userDescription: 'Search for text in files',
  category: 'search',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Search pattern (regex)',
      required: true,
    },
    {
      name: 'path',
      type: 'string',
      description: 'Path to search in (optional, defaults to workspace)',
      required: false,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Glob pattern to filter files (e.g., "*.ts")',
      required: false,
    },
    {
      name: 'caseSensitive',
      type: 'boolean',
      description: 'Case sensitive search',
      required: false,
      default: false,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results',
      required: false,
      default: 100,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🔍',
  tags: ['search', 'grep', 'read'],
};

export class GrepTool implements ToolImplementation {
  async execute(
    params: {
      pattern: string;
      path?: string;
      glob?: string;
      caseSensitive?: boolean;
      maxResults?: number;
    },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return {
          success: false,
          content: '',
          error: 'No workspace folder open',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Build include pattern
      let include = params.glob || '**/*';
      if (params.path) {
        include = `${params.path}/${include}`;
      }

      // Use VS Code's findTextInFiles API
      const results: any[] = [];
      const maxResults = params.maxResults || 100;

      await vscode.workspace.findTextInFiles(
        {
          pattern: params.pattern,
          isRegExp: true,
          isCaseSensitive: params.caseSensitive,
        },
        {
          include: new vscode.RelativePattern(workspaceFolder, include),
          exclude: '**/node_modules/**',
          maxResults,
        },
        (result) => {
          if (results.length < maxResults) {
            results.push({
              file: vscode.workspace.asRelativePath(result.uri),
              line: result.ranges[0]?.start.line + 1,
              preview: result.preview.text.trim(),
            });
          }
        }
      );

      if (results.length === 0) {
        return {
          success: true,
          content: `No matches found for pattern: ${params.pattern}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Group by file
      const byFile = new Map<string, any[]>();
      for (const result of results) {
        const existing = byFile.get(result.file) || [];
        existing.push({ line: result.line, preview: result.preview });
        byFile.set(result.file, existing);
      }

      const output = Array.from(byFile.entries())
        .map(([file, matches]) => {
          const matchLines = matches
            .map((m) => `${String(m.line).padStart(4)}:${m.preview}`)
            .join('\n');
          return `${file}\n${matchLines}`;
        })
        .join('\n\n');

      return {
        success: true,
        content: `Found ${results.length} matches in ${byFile.size} files:\n\n${output}`,
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
    if (!params.pattern) return { valid: false, error: 'pattern is required' };
    return { valid: true };
  }
}

// =============================================================================
// Find Files Tool
// =============================================================================

export const findFilesDefinition: ToolDefinition = {
  id: 'find_files',
  displayName: 'Find Files',
  modelDescription: `Find files matching a glob pattern.`,
  userDescription: 'Find files by pattern',
  category: 'search',
  parameters: [
    {
      name: 'pattern',
      type: 'string',
      description: 'Glob pattern (e.g., "**/*.ts")',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results',
      required: false,
      default: 100,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📋',
  tags: ['search', 'find', 'read'],
};

export class FindFilesTool implements ToolImplementation {
  async execute(
    params: { pattern: string; maxResults?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const maxResults = params.maxResults || 100;

      // Normalize pattern
      let pattern = params.pattern;
      if (!pattern.startsWith('**/') && !pattern.startsWith('/')) {
        pattern = `**/${pattern}`;
      }

      const files = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**',
        maxResults
      );

      const filePaths = files
        .map((f) => vscode.workspace.asRelativePath(f))
        .sort();

      return {
        success: true,
        content: JSON.stringify(filePaths, null, 2),
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
    if (!params.pattern) return { valid: false, error: 'pattern is required' };
    return { valid: true };
  }
}

// =============================================================================
// Register all file tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerFileTools(registry: AriaToolRegistry): void {
  registry.registerTool(readFileDefinition, new ReadFileTool());
  registry.registerTool(writeFileDefinition, new WriteFileTool());
  registry.registerTool(createFileDefinition, new CreateFileTool());
  registry.registerTool(deleteFileDefinition, new DeleteFileTool());
  registry.registerTool(listDirDefinition, new ListDirTool());
  registry.registerTool(grepDefinition, new GrepTool());
  registry.registerTool(findFilesDefinition, new FindFilesTool());
}
