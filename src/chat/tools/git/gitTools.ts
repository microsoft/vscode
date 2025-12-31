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
 *
 * These tools are wired to the VS Code Git Extension API.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Git Extension API Types
// =============================================================================

interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
  onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: RepositoryState;
  status(): Promise<void>;
  diff(cached?: boolean): Promise<string>;
  diffWithHEAD(path?: string): Promise<string>;
  diffWith(ref: string, path?: string): Promise<string>;
  diffBetween(ref1: string, ref2: string, path?: string): Promise<string>;
  add(resources: vscode.Uri[]): Promise<void>;
  revert(resources: vscode.Uri[]): Promise<void>;
  commit(message: string, opts?: { all?: boolean; amend?: boolean }): Promise<void>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  deleteBranch(name: string, force?: boolean): Promise<void>;
  getBranch(name: string): Promise<Branch>;
  getBranches(query?: { remote?: boolean }): Promise<Branch[]>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean, force?: boolean): Promise<void>;
  pull(unshallow?: boolean): Promise<void>;
  fetch(remote?: string, ref?: string, depth?: number): Promise<void>;
  log(options?: { maxEntries?: number; path?: string }): Promise<Commit[]>;
}

interface RepositoryState {
  HEAD?: Branch;
  refs: Ref[];
  remotes: Remote[];
  submodules: Submodule[];
  rebaseCommit?: Commit;
  mergeChanges: Change[];
  indexChanges: Change[];
  workingTreeChanges: Change[];
}

interface Branch {
  name?: string;
  commit?: string;
  upstream?: { remote: string; name: string };
  ahead?: number;
  behind?: number;
}

interface Ref {
  type: number;
  name?: string;
  commit?: string;
  remote?: string;
}

interface Remote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}

interface Submodule {
  name: string;
  path: string;
  url: string;
}

interface Change {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}

interface Commit {
  hash: string;
  message: string;
  parents: string[];
  authorDate?: Date;
  authorName?: string;
  authorEmail?: string;
  commitDate?: Date;
}

// =============================================================================
// Git API Helper
// =============================================================================

class GitAPIHelper {
  private static instance: GitAPIHelper;
  private gitApi: GitAPI | undefined;
  private initPromise: Promise<GitAPI | undefined> | undefined;

  private constructor() {}

  static getInstance(): GitAPIHelper {
    if (!GitAPIHelper.instance) {
      GitAPIHelper.instance = new GitAPIHelper();
    }
    return GitAPIHelper.instance;
  }

  async getAPI(): Promise<GitAPI | undefined> {
    if (this.gitApi) {
      return this.gitApi;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeAPI();
    return this.initPromise;
  }

  private async initializeAPI(): Promise<GitAPI | undefined> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExtension) {
        console.warn('[GitTools] Git extension not found');
        return undefined;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitApi = gitExtension.exports.getAPI(1);
      return this.gitApi;
    } catch (error) {
      console.error('[GitTools] Failed to initialize Git API:', error);
      return undefined;
    }
  }

  async getRepository(workspacePath?: string): Promise<Repository | undefined> {
    const api = await this.getAPI();
    if (!api || api.repositories.length === 0) {
      return undefined;
    }

    if (workspacePath) {
      return api.repositories.find((repo) =>
        workspacePath.startsWith(repo.rootUri.fsPath)
      );
    }

    return api.repositories[0];
  }
}

// Status enum mapping
const STATUS_MAP: Record<number, string> = {
  0: 'modified',
  1: 'added',
  2: 'deleted',
  3: 'renamed',
  4: 'copied',
  5: 'untracked',
  6: 'ignored',
  7: 'conflict',
};

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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { path?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Refresh status
      await repo.status();

      const state = repo.state;
      const head = state.HEAD;

      const status = {
        repository: repo.rootUri.fsPath,
        branch: head?.name || 'HEAD (detached)',
        commit: head?.commit?.slice(0, 8),
        upstream: head?.upstream
          ? `${head.upstream.remote}/${head.upstream.name}`
          : null,
        ahead: head?.ahead || 0,
        behind: head?.behind || 0,
        staged: state.indexChanges.map((c) => ({
          path: vscode.workspace.asRelativePath(c.uri),
          status: STATUS_MAP[c.status] || 'unknown',
        })),
        modified: state.workingTreeChanges.map((c) => ({
          path: vscode.workspace.asRelativePath(c.uri),
          status: STATUS_MAP[c.status] || 'unknown',
        })),
        conflicts: state.mergeChanges.map((c) => ({
          path: vscode.workspace.asRelativePath(c.uri),
        })),
        isRebasing: !!state.rebaseCommit,
        isMerging: state.mergeChanges.length > 0,
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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { file?: string; staged?: boolean; ref1?: string; ref2?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      let diff: string;

      if (params.ref1 && params.ref2) {
        // Diff between two refs
        diff = await repo.diffBetween(params.ref1, params.ref2, params.file);
      } else if (params.ref1) {
        // Diff with specific ref
        diff = await repo.diffWith(params.ref1, params.file);
      } else if (params.staged) {
        // Staged changes
        diff = await repo.diff(true);
      } else {
        // Unstaged changes (diff with HEAD)
        diff = await repo.diffWithHEAD(params.file);
      }

      if (!diff || diff.trim() === '') {
        return {
          success: true,
          content: 'No changes to show',
          executionTimeMs: performance.now() - startTime,
        };
      }

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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { files: string[] },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      let filesToStage: vscode.Uri[];

      if (params.files.includes('--all') || params.files.includes('.')) {
        // Stage all working tree changes
        filesToStage = repo.state.workingTreeChanges.map((c) => c.uri);
      } else {
        // Stage specific files
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        filesToStage = params.files.map((f) =>
          vscode.Uri.file(f.startsWith('/') ? f : `${workspaceRoot}/${f}`)
        );
      }

      await repo.add(filesToStage);

      return {
        success: true,
        content: `Staged ${filesToStage.length} file(s):\n${filesToStage.map((f) => `  - ${vscode.workspace.asRelativePath(f)}`).join('\n')}`,
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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { message: string; amend?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Check if there are staged changes
      if (repo.state.indexChanges.length === 0 && !params.amend) {
        return {
          success: false,
          content: '',
          error: 'No staged changes to commit. Use git_stage first.',
          executionTimeMs: performance.now() - startTime,
        };
      }

      await repo.commit(params.message, { amend: params.amend });

      // Get the new commit hash
      await repo.status();
      const newCommit = repo.state.HEAD?.commit?.slice(0, 8) || 'unknown';

      return {
        success: true,
        content: `${params.amend ? 'Amended' : 'Created'} commit ${newCommit}: ${params.message}`,
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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { action: string; name?: string; startPoint?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      switch (params.action) {
        case 'list': {
          const [localBranches, remoteBranches] = await Promise.all([
            repo.getBranches({ remote: false }),
            repo.getBranches({ remote: true }),
          ]);

          const currentBranch = repo.state.HEAD?.name;
          const branches = {
            current: currentBranch,
            local: localBranches.map((b) => ({
              name: b.name,
              commit: b.commit?.slice(0, 8),
              isCurrent: b.name === currentBranch,
            })),
            remote: remoteBranches.map((b) => ({
              name: b.name,
              commit: b.commit?.slice(0, 8),
            })),
          };

          return {
            success: true,
            content: JSON.stringify(branches, null, 2),
            executionTimeMs: performance.now() - startTime,
          };
        }

        case 'create': {
          if (!params.name) {
            return {
              success: false,
              content: '',
              error: 'Branch name is required for create action',
              executionTimeMs: performance.now() - startTime,
            };
          }
          await repo.createBranch(params.name, true, params.startPoint);
          return {
            success: true,
            content: `Created and checked out branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };
        }

        case 'delete': {
          if (!params.name) {
            return {
              success: false,
              content: '',
              error: 'Branch name is required for delete action',
              executionTimeMs: performance.now() - startTime,
            };
          }
          await repo.deleteBranch(params.name, false);
          return {
            success: true,
            content: `Deleted branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };
        }

        case 'checkout': {
          if (!params.name) {
            return {
              success: false,
              content: '',
              error: 'Branch name is required for checkout action',
              executionTimeMs: performance.now() - startTime,
            };
          }
          await repo.checkout(params.name);
          return {
            success: true,
            content: `Switched to branch: ${params.name}`,
            executionTimeMs: performance.now() - startTime,
          };
        }

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
    {
      name: 'setUpstream',
      type: 'boolean',
      description: 'Set upstream tracking reference',
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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { remote?: string; branch?: string; force?: boolean; setUpstream?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      const remote = params.remote || 'origin';
      const branch = params.branch || repo.state.HEAD?.name;

      await repo.push(remote, branch, params.setUpstream, params.force);

      return {
        success: true,
        content: `Pushed to ${remote}/${branch}${params.force ? ' (force)' : ''}`,
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
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { remote?: string; branch?: string; rebase?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Fetch first
      await repo.fetch(params.remote);

      // Pull
      await repo.pull();

      // Get updated status
      await repo.status();
      const head = repo.state.HEAD;

      return {
        success: true,
        content: `Pulled from ${params.remote || 'origin'}. Now at ${head?.commit?.slice(0, 8) || 'HEAD'}`,
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
// Git Log Tool
// =============================================================================

export const gitLogDefinition: ToolDefinition = {
  id: 'git_log',
  displayName: 'Git Log',
  modelDescription: `View commit history.`,
  userDescription: 'View git commit history',
  category: 'git',
  parameters: [
    {
      name: 'maxEntries',
      type: 'number',
      description: 'Maximum number of commits to show (default: 10)',
      required: false,
      default: 10,
    },
    {
      name: 'file',
      type: 'string',
      description: 'Show commits for a specific file',
      required: false,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📜',
  tags: ['git', 'log', 'read'],
};

export class GitLogTool implements ToolImplementation {
  private gitHelper = GitAPIHelper.getInstance();

  async execute(
    params: { maxEntries?: number; file?: string },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const repo = await this.gitHelper.getRepository(context.workspacePath);
      if (!repo) {
        return {
          success: false,
          content: '',
          error: 'No Git repository found in workspace',
          executionTimeMs: performance.now() - startTime,
        };
      }

      const commits = await repo.log({
        maxEntries: params.maxEntries || 10,
        path: params.file,
      });

      const formattedLog = commits.map((c) => ({
        hash: c.hash.slice(0, 8),
        message: c.message.split('\n')[0],
        author: c.authorName,
        date: c.authorDate?.toISOString().split('T')[0],
      }));

      return {
        success: true,
        content: JSON.stringify(formattedLog, null, 2),
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
  registry.registerTool(gitLogDefinition, new GitLogTool());
}
