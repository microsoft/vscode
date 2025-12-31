/**
 * File Tools Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReadFileTool,
  WriteFileTool,
  CreateFileTool,
  DeleteFileTool,
  ListDirTool,
  GrepTool,
  FindFilesTool,
  readFileDefinition,
  writeFileDefinition,
  createFileDefinition,
  deleteFileDefinition,
  listDirDefinition,
  grepDefinition,
  findFilesDefinition,
} from '../file/fileTools';
import type { ToolInvocationContext } from '../AriaToolRegistry';

// Mock VS Code
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    fs: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('file content')),
      writeFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ type: 1, size: 100, mtime: Date.now() }),
      delete: vi.fn().mockResolvedValue(undefined),
      readDirectory: vi.fn().mockResolvedValue([
        ['file1.ts', 1],
        ['file2.ts', 1],
        ['folder', 2],
      ]),
      createDirectory: vi.fn().mockResolvedValue(undefined),
    },
    asRelativePath: (uri: any) => uri.fsPath?.replace('/test/workspace/', '') || uri,
    findFiles: vi.fn().mockResolvedValue([]),
    findTextInFiles: vi.fn().mockImplementation(async (pattern, options, callback) => {
      // Simulate no results
    }),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (uri: any, ...paths: string[]) => ({
      fsPath: `${uri.fsPath}/${paths.join('/')}`,
    }),
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  },
  RelativePattern: vi.fn((folder: any, pattern: string) => ({ pattern })),
}));

const mockContext: ToolInvocationContext = {
  mode: 'agent',
  sessionId: 'test-session',
  workspacePath: '/test/workspace',
};

describe('File Tool Definitions', () => {
  it('read_file is read-only', () => {
    expect(readFileDefinition.isReadOnly).toBe(true);
    expect(readFileDefinition.requiresConfirmation).toBe(false);
  });

  it('write_file requires confirmation', () => {
    expect(writeFileDefinition.isReadOnly).toBe(false);
    expect(writeFileDefinition.requiresConfirmation).toBe(true);
  });

  it('create_file requires confirmation', () => {
    expect(createFileDefinition.isReadOnly).toBe(false);
    expect(createFileDefinition.requiresConfirmation).toBe(true);
  });

  it('delete_file requires confirmation', () => {
    expect(deleteFileDefinition.isReadOnly).toBe(false);
    expect(deleteFileDefinition.requiresConfirmation).toBe(true);
  });

  it('list_dir is read-only', () => {
    expect(listDirDefinition.isReadOnly).toBe(true);
  });

  it('grep is in search category', () => {
    expect(grepDefinition.category).toBe('search');
    expect(grepDefinition.isReadOnly).toBe(true);
  });

  it('find_files is read-only', () => {
    expect(findFilesDefinition.isReadOnly).toBe(true);
  });
});

describe('ReadFileTool', () => {
  let tool: ReadFileTool;

  beforeEach(() => {
    tool = new ReadFileTool();
  });

  it('validates path parameter', () => {
    const noPath = tool.validate({});
    expect(noPath.valid).toBe(false);

    const valid = tool.validate({ path: 'src/main.ts' });
    expect(valid.valid).toBe(true);
  });

  it('reads file content with line numbers', async () => {
    const result = await tool.execute({ path: 'test.ts' }, mockContext);

    expect(result.success).toBe(true);
    expect(result.content).toContain('|'); // Line number separator
  });

  it('supports offset and limit', async () => {
    const result = await tool.execute(
      { path: 'test.ts', offset: 1, limit: 10 },
      mockContext
    );

    expect(result.success).toBe(true);
  });
});

describe('WriteFileTool', () => {
  let tool: WriteFileTool;

  beforeEach(() => {
    tool = new WriteFileTool();
  });

  it('validates parameters', () => {
    const noPath = tool.validate({});
    expect(noPath.valid).toBe(false);

    const noContent = tool.validate({ path: 'test.ts' });
    expect(noContent.valid).toBe(false);

    const withContents = tool.validate({ path: 'test.ts', contents: 'code' });
    expect(withContents.valid).toBe(true);

    const withOldString = tool.validate({
      path: 'test.ts',
      old_string: 'old',
      new_string: 'new',
    });
    expect(withOldString.valid).toBe(true);

    const oldWithoutNew = tool.validate({
      path: 'test.ts',
      old_string: 'old',
    });
    expect(oldWithoutNew.valid).toBe(false);
  });
});

describe('CreateFileTool', () => {
  let tool: CreateFileTool;

  beforeEach(() => {
    tool = new CreateFileTool();
  });

  it('validates required parameters', () => {
    const noPath = tool.validate({});
    expect(noPath.valid).toBe(false);

    const noContents = tool.validate({ path: 'new.ts' });
    expect(noContents.valid).toBe(false);

    const valid = tool.validate({ path: 'new.ts', contents: 'code' });
    expect(valid.valid).toBe(true);
  });
});

describe('DeleteFileTool', () => {
  let tool: DeleteFileTool;

  beforeEach(() => {
    tool = new DeleteFileTool();
  });

  it('validates path parameter', () => {
    const noPath = tool.validate({});
    expect(noPath.valid).toBe(false);

    const valid = tool.validate({ path: 'file.ts' });
    expect(valid.valid).toBe(true);
  });
});

describe('ListDirTool', () => {
  let tool: ListDirTool;

  beforeEach(() => {
    tool = new ListDirTool();
  });

  it('validates path parameter', () => {
    const noPath = tool.validate({});
    expect(noPath.valid).toBe(false);

    const valid = tool.validate({ path: 'src' });
    expect(valid.valid).toBe(true);
  });

  it('returns directory listing as JSON', async () => {
    const result = await tool.execute({ path: 'src' }, mockContext);

    expect(result.success).toBe(true);
    const entries = JSON.parse(result.content as string);
    expect(Array.isArray(entries)).toBe(true);
  });
});

describe('GrepTool', () => {
  let tool: GrepTool;

  beforeEach(() => {
    tool = new GrepTool();
  });

  it('validates pattern parameter', () => {
    const noPattern = tool.validate({});
    expect(noPattern.valid).toBe(false);

    const valid = tool.validate({ pattern: 'TODO' });
    expect(valid.valid).toBe(true);
  });
});

describe('FindFilesTool', () => {
  let tool: FindFilesTool;

  beforeEach(() => {
    tool = new FindFilesTool();
  });

  it('validates pattern parameter', () => {
    const noPattern = tool.validate({});
    expect(noPattern.valid).toBe(false);

    const valid = tool.validate({ pattern: '*.ts' });
    expect(valid.valid).toBe(true);
  });

  it('returns file paths as JSON', async () => {
    const result = await tool.execute({ pattern: '*.ts' }, mockContext);

    expect(result.success).toBe(true);
    const files = JSON.parse(result.content as string);
    expect(Array.isArray(files)).toBe(true);
  });
});

