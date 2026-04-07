/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LanguageModelToolInformation } from 'vscode';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { URI } from '../../../../util/vs/base/common/uri';
import { applyPromptOverrides, resetPromptOverrideWarnings } from '../promptOverride';

function makeMessages(...specs: Array<{ role: Raw.ChatRole; content: string }>): Raw.ChatMessage[] {
	return specs.map(s => ({
		role: s.role,
		content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: s.content }],
	})) as Raw.ChatMessage[];
}

function makeTools(...names: string[]): LanguageModelToolInformation[] {
	return names.map(name => ({
		name,
		description: `Default description for ${name}`,
		inputSchema: undefined,
		tags: [],
		source: undefined,
	})) as LanguageModelToolInformation[];
}

describe('applyPromptOverrides', () => {
	let logService: TestLogService;
	let fileSystemService: MockFileSystemService;

	beforeEach(() => {
		logService = new TestLogService();
		fileSystemService = new MockFileSystemService();
		resetPromptOverrideWarnings();
	});

	test('returns unchanged and logs warning when file is not found', async () => {
		const warnSpy = vi.spyOn(logService, 'warn');
		const fileUri = URI.file('/nonexistent.yaml');

		const messages = makeMessages({ role: Raw.ChatRole.System, content: 'original' });
		const tools = makeTools('tool_a');

		const result = await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);

		expect(result.messages).toEqual(messages);
		expect(result.tools).toEqual(tools);
		expect(warnSpy).toHaveBeenCalledOnce();
	});

	test('returns unchanged and logs warning on invalid YAML', async () => {
		const warnSpy = vi.spyOn(logService, 'warn');
		const fileUri = URI.file('/bad.yaml');
		fileSystemService.mockFile(fileUri, '{{{{not valid yaml');

		const messages = makeMessages({ role: Raw.ChatRole.System, content: 'original' });
		const result = await applyPromptOverrides(fileUri, messages, makeTools(), fileSystemService, logService);

		expect(result.messages).toEqual(messages);
		expect(warnSpy).toHaveBeenCalledOnce();
	});

	test('replaces all system messages with systemPrompt override', async () => {
		const fileUri = URI.file('/override.yaml');
		fileSystemService.mockFile(fileUri, 'systemPrompt: "Custom system prompt"');

		const messages = makeMessages(
			{ role: Raw.ChatRole.System, content: 'System 1' },
			{ role: Raw.ChatRole.System, content: 'System 2' },
			{ role: Raw.ChatRole.User, content: 'Hello' },
			{ role: Raw.ChatRole.Assistant, content: 'Hi' },
		);

		const result = await applyPromptOverrides(fileUri, messages, makeTools(), fileSystemService, logService);

		expect(result.messages).toHaveLength(3);
		expect(result.messages[0]).toEqual({
			role: Raw.ChatRole.System,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Custom system prompt' }],
		});
		expect(result.messages[1]).toEqual({
			role: Raw.ChatRole.User,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }],
		});
		expect(result.messages[2]).toEqual({
			role: Raw.ChatRole.Assistant,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hi' }],
		});
	});

	test('overrides matching tool descriptions', async () => {
		const fileUri = URI.file('/override.yaml');
		fileSystemService.mockFile(fileUri, [
			'toolDescriptions:',
			'  tool_a:',
			'    description: "Overridden A"',
		].join('\n'));

		const tools = makeTools('tool_a', 'tool_b');

		const result = await applyPromptOverrides(fileUri, makeMessages(), tools, fileSystemService, logService);

		expect(result.tools[0].description).toBe('Overridden A');
		expect(result.tools[1].description).toBe('Default description for tool_b');
	});

	test('applies both system prompt and tool description overrides', async () => {
		const fileUri = URI.file('/override.yaml');
		fileSystemService.mockFile(fileUri, [
			'systemPrompt: "New system"',
			'toolDescriptions:',
			'  tool_x:',
			'    description: "New tool_x desc"',
		].join('\n'));

		const messages = makeMessages(
			{ role: Raw.ChatRole.System, content: 'Old system' },
			{ role: Raw.ChatRole.User, content: 'Hello' },
		);
		const tools = makeTools('tool_x');

		const result = await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);

		expect(result.messages[0]).toEqual({
			role: Raw.ChatRole.System,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'New system' }],
		});
		expect(result.messages[1]).toEqual({
			role: Raw.ChatRole.User,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'Hello' }],
		});
		expect(result.tools[0].description).toBe('New tool_x desc');
	});

	test('returns unchanged for empty YAML file', async () => {
		const fileUri = URI.file('/empty.yaml');
		fileSystemService.mockFile(fileUri, '');

		const messages = makeMessages({ role: Raw.ChatRole.System, content: 'original' });
		const tools = makeTools('tool_a');

		const result = await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);

		expect(result.messages).toEqual(messages);
		expect(result.tools).toEqual(tools);
	});

	test('silently ignores tool names not found in available tools', async () => {
		const fileUri = URI.file('/override.yaml');
		fileSystemService.mockFile(fileUri, [
			'toolDescriptions:',
			'  nonexistent_tool:',
			'    description: "Does not matter"',
		].join('\n'));

		const tools = makeTools('tool_a');

		const result = await applyPromptOverrides(fileUri, makeMessages(), tools, fileSystemService, logService);

		expect(result.tools[0].description).toBe('Default description for tool_a');
	});

	test('warns only once per file path, then uses trace for repeated failures', async () => {
		const warnSpy = vi.spyOn(logService, 'warn');
		const traceSpy = vi.spyOn(logService, 'trace');
		const fileUri = URI.file('/missing.yaml');

		const messages = makeMessages({ role: Raw.ChatRole.System, content: 'original' });
		const tools = makeTools('tool_a');

		// First call should warn
		await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);
		expect(warnSpy).toHaveBeenCalledOnce();

		// Second call should use trace instead
		await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);
		expect(warnSpy).toHaveBeenCalledOnce(); // still only one warn
		expect(traceSpy).toHaveBeenCalled();
	});

	test('re-warns after a successful read followed by a new failure', async () => {
		const warnSpy = vi.spyOn(logService, 'warn');
		const fileUri = URI.file('/flaky.yaml');

		const messages = makeMessages({ role: Raw.ChatRole.System, content: 'original' });
		const tools = makeTools('tool_a');

		// First call fails — should warn
		await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);
		expect(warnSpy).toHaveBeenCalledOnce();

		// Now the file exists and succeeds — clears the warned state
		fileSystemService.mockFile(fileUri, 'systemPrompt: "hello"');
		await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);

		// Remove the file again — should warn again since previous read succeeded
		fileSystemService.mockError(fileUri, new Error('ENOENT'));
		await applyPromptOverrides(fileUri, messages, tools, fileSystemService, logService);
		expect(warnSpy).toHaveBeenCalledTimes(2);
	});
});
