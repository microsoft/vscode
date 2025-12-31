/**
 * Terminal Tools Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RunInTerminalTool,
  GetTerminalOutputTool,
  GetTerminalSelectionTool,
  ListTerminalsTool,
  runInTerminalDefinition,
  getTerminalOutputDefinition,
  getTerminalSelectionDefinition,
  listTerminalsDefinition,
} from '../terminal/terminalTools';
import type { ToolInvocationContext } from '../AriaToolRegistry';

// Mock VS Code
vi.mock('vscode', () => ({
  window: {
    terminals: [],
    activeTerminal: null,
    createTerminal: vi.fn(() => ({
      name: 'Test Terminal',
      show: vi.fn(),
      sendText: vi.fn(),
      dispose: vi.fn(),
    })),
    onDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ThemeIcon: vi.fn((id: string) => ({ id })),
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
  },
}));

const mockContext: ToolInvocationContext = {
  mode: 'agent',
  sessionId: 'test-session-123',
  workspacePath: '/test/workspace',
};

describe('Terminal Tool Definitions', () => {
  it('run_terminal has correct definition', () => {
    expect(runInTerminalDefinition.id).toBe('run_terminal');
    expect(runInTerminalDefinition.category).toBe('terminal');
    expect(runInTerminalDefinition.isReadOnly).toBe(false);
    expect(runInTerminalDefinition.requiresConfirmation).toBe(true);
    expect(runInTerminalDefinition.parameters).toHaveLength(4);
  });

  it('get_terminal_output has correct definition', () => {
    expect(getTerminalOutputDefinition.id).toBe('get_terminal_output');
    expect(getTerminalOutputDefinition.isReadOnly).toBe(true);
    expect(getTerminalOutputDefinition.requiresConfirmation).toBe(false);
  });

  it('get_terminal_selection has correct definition', () => {
    expect(getTerminalSelectionDefinition.id).toBe('get_terminal_selection');
    expect(getTerminalSelectionDefinition.isReadOnly).toBe(true);
    expect(getTerminalSelectionDefinition.parameters).toHaveLength(0);
  });

  it('list_terminals has correct definition', () => {
    expect(listTerminalsDefinition.id).toBe('list_terminals');
    expect(listTerminalsDefinition.isReadOnly).toBe(true);
  });
});

describe('RunInTerminalTool', () => {
  let tool: RunInTerminalTool;

  beforeEach(() => {
    tool = new RunInTerminalTool();
  });

  it('validates required parameters', () => {
    const noCommand = tool.validate({});
    expect(noCommand.valid).toBe(false);
    expect(noCommand.error).toContain('command');

    const noExplanation = tool.validate({ command: 'echo test' });
    expect(noExplanation.valid).toBe(false);
    expect(noExplanation.error).toContain('explanation');

    const valid = tool.validate({
      command: 'echo test',
      explanation: 'Test command',
    });
    expect(valid.valid).toBe(true);
  });

  it('executes command and returns result', async () => {
    const result = await tool.execute(
      {
        command: 'echo "Hello World"',
        explanation: 'Test echo command',
        isBackground: false,
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.executionTimeMs).toBeGreaterThan(0);
  });

  it('handles background commands', async () => {
    const result = await tool.execute(
      {
        command: 'npm run dev',
        explanation: 'Start dev server',
        isBackground: true,
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain('background');
    expect(result.artifacts?.[0].metadata?.isBackground).toBe(true);
  });
});

describe('GetTerminalOutputTool', () => {
  let tool: GetTerminalOutputTool;

  beforeEach(() => {
    tool = new GetTerminalOutputTool();
  });

  it('returns error when no terminal found', async () => {
    const result = await tool.execute(
      { terminalId: 'nonexistent' },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('ListTerminalsTool', () => {
  let tool: ListTerminalsTool;

  beforeEach(() => {
    tool = new ListTerminalsTool();
  });

  it('returns terminal list as JSON', async () => {
    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const terminals = JSON.parse(result.content as string);
    expect(Array.isArray(terminals)).toBe(true);
  });
});

