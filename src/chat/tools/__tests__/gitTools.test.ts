/**
 * Git Tools Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitStatusTool,
  GitDiffTool,
  GitStageTool,
  GitCommitTool,
  GitBranchTool,
  gitStatusDefinition,
  gitDiffDefinition,
  gitStageDefinition,
  gitCommitDefinition,
  gitBranchDefinition,
} from '../git/gitTools';
import type { ToolInvocationContext } from '../AriaToolRegistry';

// Mock VS Code
const mockRepository = {
  rootUri: { fsPath: '/test/repo' },
  state: {
    HEAD: { name: 'main', commit: 'abc123', upstream: { remote: 'origin', name: 'main' } },
    indexChanges: [],
    workingTreeChanges: [],
    mergeChanges: [],
    rebaseCommit: null,
  },
  status: vi.fn(),
  diff: vi.fn().mockResolvedValue(''),
  diffWithHEAD: vi.fn().mockResolvedValue(''),
  diffWith: vi.fn().mockResolvedValue(''),
  diffBetween: vi.fn().mockResolvedValue(''),
  add: vi.fn(),
  commit: vi.fn(),
  checkout: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  getBranches: vi.fn().mockResolvedValue([]),
  push: vi.fn(),
  pull: vi.fn(),
  fetch: vi.fn(),
  log: vi.fn().mockResolvedValue([]),
};

vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn(() => ({
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [mockRepository],
        }),
      },
      activate: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/repo' } }],
    asRelativePath: (uri: any) => uri.fsPath?.replace('/test/repo/', '') || uri,
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (uri: any, ...paths: string[]) => ({
      fsPath: `${uri.fsPath}/${paths.join('/')}`,
    }),
  },
}));

const mockContext: ToolInvocationContext = {
  mode: 'agent',
  sessionId: 'test-session',
  workspacePath: '/test/repo',
};

describe('Git Tool Definitions', () => {
  it('git_status is read-only', () => {
    expect(gitStatusDefinition.isReadOnly).toBe(true);
    expect(gitStatusDefinition.requiresConfirmation).toBe(false);
  });

  it('git_diff is read-only', () => {
    expect(gitDiffDefinition.isReadOnly).toBe(true);
  });

  it('git_stage requires confirmation', () => {
    expect(gitStageDefinition.isReadOnly).toBe(false);
    expect(gitStageDefinition.requiresConfirmation).toBe(true);
  });

  it('git_commit requires confirmation', () => {
    expect(gitCommitDefinition.isReadOnly).toBe(false);
    expect(gitCommitDefinition.requiresConfirmation).toBe(true);
  });

  it('git_branch has action enum', () => {
    const actionParam = gitBranchDefinition.parameters.find(p => p.name === 'action');
    expect(actionParam?.enum).toContain('list');
    expect(actionParam?.enum).toContain('create');
    expect(actionParam?.enum).toContain('delete');
    expect(actionParam?.enum).toContain('checkout');
  });
});

describe('GitStatusTool', () => {
  let tool: GitStatusTool;

  beforeEach(() => {
    tool = new GitStatusTool();
  });

  it('returns repository status', async () => {
    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const status = JSON.parse(result.content as string);
    expect(status.branch).toBeDefined();
    expect(status.repository).toBeDefined();
  });
});

describe('GitDiffTool', () => {
  let tool: GitDiffTool;

  beforeEach(() => {
    tool = new GitDiffTool();
  });

  it('returns diff for unstaged changes', async () => {
    const result = await tool.execute({}, mockContext);
    expect(result.success).toBe(true);
  });

  it('supports staged diff', async () => {
    const result = await tool.execute({ staged: true }, mockContext);
    expect(result.success).toBe(true);
  });

  it('supports file-specific diff', async () => {
    const result = await tool.execute({ file: 'src/main.ts' }, mockContext);
    expect(result.success).toBe(true);
  });
});

describe('GitStageTool', () => {
  let tool: GitStageTool;

  beforeEach(() => {
    tool = new GitStageTool();
    mockRepository.add.mockClear();
  });

  it('validates files parameter', () => {
    const empty = tool.validate({ files: [] });
    expect(empty.valid).toBe(false);

    const valid = tool.validate({ files: ['src/main.ts'] });
    expect(valid.valid).toBe(true);
  });
});

describe('GitCommitTool', () => {
  let tool: GitCommitTool;

  beforeEach(() => {
    tool = new GitCommitTool();
  });

  it('validates message parameter', () => {
    const noMessage = tool.validate({});
    expect(noMessage.valid).toBe(false);

    const shortMessage = tool.validate({ message: 'ab' });
    expect(shortMessage.valid).toBe(false);

    const valid = tool.validate({ message: 'feat: add feature' });
    expect(valid.valid).toBe(true);
  });
});

describe('GitBranchTool', () => {
  let tool: GitBranchTool;

  beforeEach(() => {
    tool = new GitBranchTool();
  });

  it('validates action parameter', () => {
    const noAction = tool.validate({});
    expect(noAction.valid).toBe(false);

    const createNoName = tool.validate({ action: 'create' });
    expect(createNoName.valid).toBe(false);

    const valid = tool.validate({ action: 'create', name: 'feature-branch' });
    expect(valid.valid).toBe(true);

    const listNoName = tool.validate({ action: 'list' });
    expect(listNoName.valid).toBe(true);
  });
});

