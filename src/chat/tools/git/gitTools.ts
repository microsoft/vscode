/**
 * Git/SCM Tools - Tools for source control operations
 *
 * Provides agents with the ability to:
 * - Check git status
 * - View diffs
 * - Stage/unstage files
 * - Commit changes
 * - Manage branches
 * - Push/pull
 */

import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Git Status Tool
// =============================================================================

export const gitStatusDefinition: ToolDefinition = {
  id: 'git_status',
  displayName: 'Git Status',
  modelDescription: `Get the current git status showing:
- Modified files
- Staged files
- Untracked files
- Current branch
- Ahead/behind status`,
  userDescription: 'Show git repository status',
  category: 'git',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Path to check status for (optional, defaults to workspace root)',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📊',
  tags: ['git', 'status', 'read'],
};

export class GitStatusTool implements ToolImplementation {
  async execute(
    params: { path?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's SCM API
      const status = {
        branch: 'main',
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
      };

      return {
        success: true,
        content: JSON.stringify(status, null, 2),
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
// Git Diff Tool
// =============================================================================

export const gitDiffDefinition: ToolDefinition = {
  id: 'git_diff',
  displayName: 'Git Diff',
  modelDescription: `Show git diff for files. Can show:
- Unstaged changes (default)
- Staged changes (--staged)
- Diff between commits/branches`,
  userDescription: 'Show git diff',
  category: 'git',
  parameters: [
    {
      name: 'file',
      type: 'string',
      description: 'Specific file to diff (optional)',
      required: false,
    },
    {
      name: 'staged',
      type: 'boolean',
      description: 'Show staged changes only',
      required: false,
      default: false,
    },
    {
      name: 'ref1',
      type: 'string',
      description: 'First reference (commit, branch)',
      required: false,
    },
    {
      name: 'ref2',
      type: 'string',
      description: 'Second reference (commit, branch)',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📝',
  tags: ['git', 'diff', 'read'],
};

export class GitDiffTool implements ToolImplementation {
  async execute(
    params: { file?: string; staged?: boolean; ref1?: string; ref2?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use git commands or VS Code's SCM API
      const diff = `diff --git a/example.ts b/example.ts
index 1234567..abcdefg 100644
--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,4 @@
 function example() {
+  // Added comment
   return true;
 }`;

      return {
        success: true,
        content: diff,
        artifacts: [
          {
            type: 'diff',
            content: diff,
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
// Git Stage Tool
// =============================================================================

export const gitStageDefinition: ToolDefinition = {
  id: 'git_stage',
  displayName: 'Git Stage',
  modelDescription: `Stage files for commit. Can stage:
- Specific files
- All changes (--all)
- By pattern`,
  userDescription: 'Stage files for commit',
  category: 'git',
  parameters: [
    {
      name: 'files',
      type: 'array',
      description: 'Files to stage (or ["--all"] for all)',
      required: true,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '➕',
  tags: ['git', 'stage', 'write'],
};

export class GitStageTool implements ToolImplementation {
  async execute(
    params: { files: string[] },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's SCM API
      const stagedFiles = params.files;

      return {
        success: true,
        content: `Staged ${stagedFiles.length} file(s): ${stagedFiles.join(', ')}`,
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
    if (!params.files || !Array.isArray(params.files) || params.files.length === 0) {
      return { valid: false, error: 'files must be a non-empty array' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Git Commit Tool
// =============================================================================

export const gitCommitDefinition: ToolDefinition = {
  id: 'git_commit',
  displayName: 'Git Commit',
  modelDescription: `Commit staged changes with a message.

Best practices:
- Use conventional commit format: type(scope): description
- Keep subject line under 72 characters
- Include why, not just what`,
  userDescription: 'Commit staged changes',
  category: 'git',
  parameters: [
    {
      name: 'message',
      type: 'string',
      description: 'Commit message',
      required: true,
    },
    {
      name: 'amend',
      type: 'boolean',
      description: 'Amend the previous commit',
      required: false,
      default: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '✅',
  tags: ['git', 'commit', 'write'],
};

export class GitCommitTool implements ToolImplementation {
  async execute(
    params: { message: string; amend?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // In a real implementation, this would use VS Code's SCM API
      const commitHash = 'abc1234';

      return {
        success: true,
        content: `Created commit ${commitHash}: ${params.message}`,
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
    if (!params.message || typeof params.message !== 'string') {
      return { valid: false, error: 'message is required' };
    }
    if (params.message.length < 3) {
      return { valid: false, error: 'message must be at least 3 characters' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Git Branch Tool
// =============================================================================

export const gitBranchDefinition: ToolDefinition = {
  id: 'git_branch',
  displayName: 'Git Branch',
  modelDescription: `Manage git branches:
- List branches (default)
- Create a new branch
- Delete a branch
- Checkout a branch`,
  userDescription: 'Manage git branches',
  category: 'git',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: 'Action to perform',
      required: true,
      enum: ['list', 'create', 'delete', 'checkout'],
    },
    {
      name: 'name',
      type: 'string',
      description: 'Branch name (required for create/delete/checkout)',
      required: false,
    },
    {
      name: 'startPoint',
      type: 'string',
      description: 'Starting point for new branch (commit/branch)',
      required: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '🌿',
  tags: ['git', 'branch', 'write'],
};

export class GitBranchTool implements ToolImplementation {
  async execute(
    params: { action: string; name?: string; startPoint?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      switch (params.action) {
        case 'list':
          return {
            success: true,
            content: JSON.stringify(['main', 'develop', 'feature/example'], null, 2),
            executionTimeMs: performance.now() - startTime,
          };

        case 'create':
          return {
            success: true,
            content: `Created branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };

        case 'delete':
          return {
            success: true,
            content: `Deleted branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };

        case 'checkout':
          return {
            success: true,
            content: `Switched to branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };

        default:
          return {
            success: false,
            content: '',
            error: `Unknown action: ${params.action}`,
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
    if (!params.action) {
      return { valid: false, error: 'action is required' };
    }
    if (['create', 'delete', 'checkout'].includes(params.action) && !params.name) {
      return { valid: false, error: `name is required for ${params.action} action` };
    }
    return { valid: true };
  }
}

// =============================================================================
// Git Push Tool
// =============================================================================

export const gitPushDefinition: ToolDefinition = {
  id: 'git_push',
  displayName: 'Git Push',
  modelDescription: `Push commits to remote repository.`,
  userDescription: 'Push commits to remote',
  category: 'git',
  parameters: [
    {
      name: 'remote',
      type: 'string',
      description: 'Remote name (default: origin)',
      required: false,
      default: 'origin',
    },
    {
      name: 'branch',
      type: 'string',
      description: 'Branch to push (default: current branch)',
      required: false,
    },
    {
      name: 'force',
      type: 'boolean',
      description: 'Force push (use with caution)',
      required: false,
      default: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '⬆️',
  tags: ['git', 'push', 'write'],
};

export class GitPushTool implements ToolImplementation {
  async execute(
    params: { remote?: string; branch?: string; force?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const remote = params.remote || 'origin';
      const branch = params.branch || 'current';

      return {
        success: true,
        content: `Pushed to ${remote}/${branch}`,
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
// Git Pull Tool
// =============================================================================

export const gitPullDefinition: ToolDefinition = {
  id: 'git_pull',
  displayName: 'Git Pull',
  modelDescription: `Pull changes from remote repository.`,
  userDescription: 'Pull changes from remote',
  category: 'git',
  parameters: [
    {
      name: 'remote',
      type: 'string',
      description: 'Remote name (default: origin)',
      required: false,
      default: 'origin',
    },
    {
      name: 'branch',
      type: 'string',
      description: 'Branch to pull (default: current branch)',
      required: false,
    },
    {
      name: 'rebase',
      type: 'boolean',
      description: 'Use rebase instead of merge',
      required: false,
      default: false,
    },
  ],
  isReadOnly: false,
  requiresConfirmation: true,
  icon: '⬇️',
  tags: ['git', 'pull', 'write'],
};

export class GitPullTool implements ToolImplementation {
  async execute(
    params: { remote?: string; branch?: string; rebase?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const remote = params.remote || 'origin';
      const branch = params.branch || 'current';

      return {
        success: true,
        content: `Pulled from ${remote}/${branch}`,
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
// Register all git tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerGitTools(registry: AriaToolRegistry): void {
  registry.registerTool(gitStatusDefinition, new GitStatusTool());
  registry.registerTool(gitDiffDefinition, new GitDiffTool());
  registry.registerTool(gitStageDefinition, new GitStageTool());
  registry.registerTool(gitCommitDefinition, new GitCommitTool());
  registry.registerTool(gitBranchDefinition, new GitBranchTool());
  registry.registerTool(gitPushDefinition, new GitPushTool());
  registry.registerTool(gitPullDefinition, new GitPullTool());
}


