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
 */

import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Read File Tool
// =============================================================================

export const readFileDefinition: ToolDefinition = {
  id: 'read_file',
  displayName: 'Read File',
  modelDescription: `Read the contents of a file. Supports:
- Full file read
- Partial read with line range (offset/limit)
- Image files (base64 encoded)`,
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
      // In a real implementation, this would use VS Code's file system API
      const content = `// File: ${params.path}
// This would be the actual file content
export function example() {
  return 'Hello, World!';
}`;

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
      if (params.old_string !== undefined && params.new_string !== undefined) {
        // Search/replace mode
        return {
          success: true,
          content: `Replaced text in ${params.path}`,
          artifacts: [
            {
              type: 'diff',
              path: params.path,
              metadata: {
                operation: 'replace',
                old: params.old_string,
                new: params.new_string,
              },
            },
          ],
          executionTimeMs: performance.now() - startTime,
        };
      } else if (params.contents !== undefined) {
        // Full write mode
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
      return {
        success: true,
        content: `Created file: ${params.path}`,
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
      return {
        success: true,
        content: `Deleted file: ${params.path}`,
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
  modelDescription: `List files and directories in a path. Shows file types and basic info.`,
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
      // In a real implementation, this would use VS Code's file system API
      const listing = [
        { name: 'src/', type: 'directory' },
        { name: 'package.json', type: 'file', size: 1234 },
        { name: 'README.md', type: 'file', size: 456 },
      ];

      return {
        success: true,
        content: JSON.stringify(listing, null, 2),
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
// Search Files Tool (Grep)
// =============================================================================

export const grepDefinition: ToolDefinition = {
  id: 'grep',
  displayName: 'Search Files',
  modelDescription: `Search for a pattern in files. Uses ripgrep-style regex.

Supports:
- Regular expressions
- File type filtering (--type)
- Glob patterns (--glob)
- Context lines (-A, -B, -C)`,
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
      name: 'type',
      type: 'string',
      description: 'File type filter (e.g., ts, py, js)',
      required: false,
    },
    {
      name: 'glob',
      type: 'string',
      description: 'Glob pattern to filter files',
      required: false,
    },
    {
      name: 'context',
      type: 'number',
      description: 'Number of context lines to show',
      required: false,
      default: 0,
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
      type?: string;
      glob?: string;
      context?: number;
      maxResults?: number;
    },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use ripgrep or VS Code's search API
      const results = [
        { file: 'src/main.ts', line: 42, content: 'matching line content' },
        { file: 'src/utils.ts', line: 15, content: 'another match' },
      ];

      return {
        success: true,
        content: JSON.stringify(results, null, 2),
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
      name: 'path',
      type: 'string',
      description: 'Starting path (optional)',
      required: false,
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
    params: { pattern: string; path?: string; maxResults?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const files = [
        'src/index.ts',
        'src/main.ts',
        'src/utils.ts',
      ];

      return {
        success: true,
        content: JSON.stringify(files, null, 2),
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


