/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ChatSubagentToolInvocationData, ChatToolInvocationPart } from '../../../../../vscodeTypes';
import { ClaudeToolNames } from '../claudeTools';
import { completeToolInvocation, createFormattedToolInvocation } from '../toolInvocationFormatter';

function createToolUseBlock(name: string, input: object): Anthropic.Beta.Messages.BetaToolUseBlock {
	return {
		type: 'tool_use',
		id: 'test-tool-id-123',
		name,
		input
	};
}

function createToolResultBlock(toolUseId: string, content: Anthropic.Messages.ToolResultBlockParam['content'], isError?: boolean): Anthropic.Messages.ToolResultBlockParam {
	return {
		type: 'tool_result',
		tool_use_id: toolUseId,
		content,
		is_error: isError
	};
}

describe('createFormattedToolInvocation', () => {
	describe('Bash tool', () => {
		it('formats bash invocation with command', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'npm install' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.Bash);
			expect(result!.toolCallId).toBe('test-tool-id-123');
			expect(result!.isConfirmed).toBeUndefined();
			expect(result!.invocationMessage).toBe('');
			expect(result!.toolSpecificData).toEqual({
				commandLine: { original: 'npm install' },
				language: 'bash'
			});
		});

		it('handles missing command input', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolSpecificData).toEqual({
				commandLine: { original: undefined },
				language: 'bash'
			});
		});
	});

	describe('Read tool', () => {
		it('formats read invocation with file path', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/path/to/file.ts' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.Read);
			expect(result!.isConfirmed).toBeUndefined();
			expect(result!.invocationMessage).toBeDefined();
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain(URI.file('/path/to/file.ts').toString());
		});

		it('handles missing file path', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain('Read');
		});
	});

	describe('Glob tool', () => {
		it('formats glob invocation with pattern', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Glob, { pattern: '**/*.ts' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.Glob);
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain('**/*.ts');
		});

		it('handles missing pattern', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Glob, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toBeDefined();
		});
	});

	describe('Grep tool', () => {
		it('formats grep invocation with pattern', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Grep, { pattern: 'function\\s+\\w+' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.Grep);
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain('function\\s+\\w+');
		});

		it('handles missing pattern', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Grep, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
		});
	});

	describe('LS tool', () => {
		it('formats ls invocation with path', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.LS, { path: '/project/src' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.LS);
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain(URI.file('/project/src').toString());
		});

		it('handles missing path', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.LS, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
		});
	});

	describe('Edit tools', () => {
		it('returns undefined for Edit tool (diff shown separately)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Edit, { file_path: '/path/to/file.ts' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeUndefined();
		});

		it('returns undefined for MultiEdit tool (diff shown separately)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.MultiEdit, { file_path: '/path/to/file.ts' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeUndefined();
		});

		it('returns undefined for Write tool (diff shown separately)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Write, { file_path: '/path/to/file.ts' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeUndefined();
		});
	});

	describe('ExitPlanMode tool', () => {
		it('formats exit plan mode with plan', () => {
			const plan = '1. First step\n2. Second step\n3. Third step';
			const toolUse = createToolUseBlock(ClaudeToolNames.ExitPlanMode, { plan });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.ExitPlanMode);
			expect(result!.invocationMessage).toBe(`Here is Claude's plan:\n\n${plan}`);
		});

		it('handles missing plan', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.ExitPlanMode, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.invocationMessage).toBe('Here is Claude\'s plan:\n\n');
		});
	});

	describe('Task tool', () => {
		it('formats task invocation with description', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Task, {
				description: 'Analyze codebase structure',
				subagent_type: 'analyzer',
				prompt: 'Please analyze the structure'
			});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe(ClaudeToolNames.Task);
			const message = result!.invocationMessage as { value: string };
			expect(message.value).toContain('Analyze codebase structure');
		});

		it('handles missing description', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Task, {});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
		});
	});

	describe('TodoWrite tool', () => {
		it('returns undefined (suppressed - too common)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.TodoWrite, {
				todos: [{ content: 'Task 1', status: 'pending', activeForm: 'active' }]
			});

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeUndefined();
		});
	});

	describe('Unknown tool', () => {
		it('formats unknown tool with generic message', () => {
			const toolUse = createToolUseBlock('UnknownTool', { someInput: 'value' });

			const result = createFormattedToolInvocation(toolUse);

			expect(result).toBeDefined();
			expect(result!.toolName).toBe('UnknownTool');
			expect(result!.invocationMessage).toContain('UnknownTool');
		});
	});

	describe('common properties', () => {
		it('sets isConfirmed to true when complete=true is passed', () => {
			const tools = [
				ClaudeToolNames.Bash,
				ClaudeToolNames.Read,
				ClaudeToolNames.Glob,
				ClaudeToolNames.Grep,
				ClaudeToolNames.LS,
				ClaudeToolNames.ExitPlanMode,
				ClaudeToolNames.Task
			];

			for (const tool of tools) {
				const toolUse = createToolUseBlock(tool, {});
				const result = createFormattedToolInvocation(toolUse, true);
				expect(result?.isConfirmed).toBe(true);
			}
		});

		it('leaves isConfirmed undefined when complete is not passed', () => {
			const tools = [
				ClaudeToolNames.Bash,
				ClaudeToolNames.Read,
				ClaudeToolNames.Glob,
				ClaudeToolNames.Grep,
				ClaudeToolNames.LS,
				ClaudeToolNames.ExitPlanMode,
				ClaudeToolNames.Task
			];

			for (const tool of tools) {
				const toolUse = createToolUseBlock(tool, {});
				const result = createFormattedToolInvocation(toolUse);
				expect(result?.isConfirmed).toBeUndefined();
			}
		});

		it('uses tool call id from tool use block', () => {
			const toolUse: Anthropic.Beta.Messages.BetaToolUseBlock = {
				type: 'tool_use',
				id: 'unique-call-id-456',
				name: ClaudeToolNames.Bash,
				input: { command: 'ls' }
			};

			const result = createFormattedToolInvocation(toolUse);

			expect(result!.toolCallId).toBe('unique-call-id-456');
		});
	});
});

describe('completeToolInvocation', () => {
	describe('Bash tool', () => {
		it('populates terminal output data', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'npm install' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'added 150 packages\nDone in 5.2s');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				commandLine: { original: 'npm install' },
				language: 'bash',
				state: undefined,
				output: { text: 'added 150 packages\r\nDone in 5.2s' }
			});
		});

		it('parses exit code from output', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'npm test' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'Tests failed\nexit code: 1');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { state?: { exitCode?: number }; output?: { text: string } };
			expect(data.state?.exitCode).toBe(1);
			expect(data.output?.text).toBe('Tests failed');
		});

		it('parses "exited with" format exit code', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'false' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'Command failed\nexited with 127');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { state?: { exitCode?: number } };
			expect(data.state?.exitCode).toBe(127);
		});

		it('handles empty output', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'true' });
			const toolResult = createToolResultBlock('test-tool-id-123', '');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { output?: { text: string } };
			expect(data.output).toBeUndefined();
		});

		it('converts newlines to CRLF for terminal display', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Bash, { command: 'ls' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'file1.ts\nfile2.ts\nfile3.ts');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { output?: { text: string } };
			expect(data.output?.text).toBe('file1.ts\r\nfile2.ts\r\nfile3.ts');
		});
	});

	describe('Read tool', () => {
		it('populates file content as simple result data', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/path/to/file.ts' });
			const fileContent = 'export function hello() {\n  return "world";\n}';
			const toolResult = createToolResultBlock('test-tool-id-123', fileContent);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				input: '/path/to/file.ts',
				output: fileContent
			});
		});

		it('does not populate data when content is empty', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/path/to/empty.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', '');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});
	});

	describe('LS tool', () => {
		it('populates directory listing as simple result data', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.LS, { path: '/project/src' });
			const listing = 'index.ts\nutils/\ncomponents/';
			const toolResult = createToolResultBlock('test-tool-id-123', listing);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				input: '/project/src',
				output: listing
			});
		});
	});

	describe('Glob tool', () => {
		it('populates search results as simple result data', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Glob, { pattern: '**/*.spec.ts' });
			const results = '/src/a.spec.ts\n/src/b.spec.ts\n/test/c.spec.ts';
			const toolResult = createToolResultBlock('test-tool-id-123', results);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				input: '**/*.spec.ts',
				output: results
			});
		});
	});

	describe('Grep tool', () => {
		it('populates search results as simple result data', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Grep, { pattern: 'TODO' });
			const results = '/src/file.ts:10: // TODO: fix this\n/src/other.ts:25: // TODO: refactor';
			const toolResult = createToolResultBlock('test-tool-id-123', results);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				input: 'TODO',
				output: results
			});
		});
	});

	describe('Edit tools', () => {
		it('does not populate data for Edit tool (has separate UI)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Edit, { file_path: '/path/to/file.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'File edited successfully');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});

		it('does not populate data for Write tool (has separate UI)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Write, { file_path: '/path/to/new.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'File created');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});

		it('does not populate data for TodoWrite tool (has separate UI)', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.TodoWrite, { todos: [] });
			const toolResult = createToolResultBlock('test-tool-id-123', 'Todos updated');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});
	});

	describe('Task tool', () => {
		it('sets result on existing ChatSubagentToolInvocationData', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Task, {
				description: 'Run tests',
				subagent_type: 'runner',
				prompt: 'run the tests'
			});
			const toolResult = createToolResultBlock('test-tool-id-123', 'All 42 tests passed');
			// Simulate the live agent flow: createFormattedToolInvocation sets toolSpecificData,
			// then completeToolInvocation is called with the result
			const invocation = createFormattedToolInvocation(toolUse)!;

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeInstanceOf(ChatSubagentToolInvocationData);
			const data = invocation.toolSpecificData as ChatSubagentToolInvocationData;
			expect(data.description).toBe('Run tests');
			expect(data.agentName).toBe('runner');
			expect(data.prompt).toBe('run the tests');
			expect(data.result).toBe('All 42 tests passed');
		});

		it('preserves existing toolSpecificData when result is empty', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Task, {
				description: 'Empty result task',
				subagent_type: 'worker',
				prompt: 'do something'
			});
			const toolResult = createToolResultBlock('test-tool-id-123', '');
			const invocation = createFormattedToolInvocation(toolUse)!;

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeInstanceOf(ChatSubagentToolInvocationData);
			const data = invocation.toolSpecificData as ChatSubagentToolInvocationData;
			expect(data.description).toBe('Empty result task');
			expect(data.result).toBe('');
		});
	});

	describe('Generic/unknown tools', () => {
		it('populates JSON input and string output', () => {
			const toolUse = createToolUseBlock('CustomTool', { arg1: 'value1', arg2: 42 });
			const toolResult = createToolResultBlock('test-tool-id-123', 'Custom tool completed successfully');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toEqual({
				input: JSON.stringify({ arg1: 'value1', arg2: 42 }, null, 2),
				output: 'Custom tool completed successfully'
			});
		});

		it('does not populate data when output is empty', () => {
			const toolUse = createToolUseBlock('CustomTool', { arg: 'value' });
			const toolResult = createToolResultBlock('test-tool-id-123', '');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});
	});

	describe('content extraction', () => {
		it('handles string content directly', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/file.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', 'plain string content');
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { output: string };
			expect(data.output).toBe('plain string content');
		});

		it('extracts text from content block array', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/file.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', [
				{ type: 'text' as const, text: 'first block' },
				{ type: 'text' as const, text: 'second block' }
			]);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { output: string };
			expect(data.output).toBe('first block\nsecond block');
		});

		it('filters out non-text blocks from content array', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/file.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', [
				{ type: 'text' as const, text: 'text content' },
				{ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'abc' } }
			]);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			const data = invocation.toolSpecificData as { output: string };
			expect(data.output).toBe('text content');
		});

		it('handles undefined content', () => {
			const toolUse = createToolUseBlock(ClaudeToolNames.Read, { file_path: '/file.ts' });
			const toolResult = createToolResultBlock('test-tool-id-123', undefined);
			const invocation = new ChatToolInvocationPart(toolUse.name, toolUse.id);

			completeToolInvocation(toolUse, toolResult, invocation);

			expect(invocation.toolSpecificData).toBeUndefined();
		});
	});
});
