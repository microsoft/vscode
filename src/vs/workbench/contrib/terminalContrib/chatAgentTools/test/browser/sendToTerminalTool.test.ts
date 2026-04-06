/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import type { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SendToTerminalTool, SendToTerminalToolData } from '../../browser/tools/sendToTerminalTool.js';
import { RunInTerminalTool, type IActiveTerminalExecution } from '../../browser/tools/runInTerminalTool.js';
import type { IToolInvocation, IToolInvocationPreparationContext } from '../../../../chat/common/tools/languageModelToolsService.js';
import type { ITerminalExecuteStrategyResult } from '../../browser/executeStrategy/executeStrategy.js';
import { ITerminalChatService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';

suite('SendToTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
	const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
	let tool: SendToTerminalTool;
	let originalGetExecution: typeof RunInTerminalTool.getExecution;
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(IChatService, {
			onDidDisposeSession: Event.None,
			getSession: () => undefined,
		});
		instantiationService.stub(ITerminalChatService, {
			hasChatSessionAutoApproval: () => false,
		});
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));
		originalGetExecution = RunInTerminalTool.getExecution;
	});

	teardown(() => {
		RunInTerminalTool.getExecution = originalGetExecution;
	});

	function createInvocation(id: string, command: string): IToolInvocation {
		return {
			parameters: { id, command },
			callId: 'test-call',
			context: { sessionId: 'test-session' },
			toolId: 'send_to_terminal',
			tokenBudget: 1000,
			isComplete: () => false,
			isCancellationRequested: false,
		} as unknown as IToolInvocation;
	}

	function createMockExecution(output: string): IActiveTerminalExecution & { sentTexts: { text: string; shouldExecute: boolean }[] } {
		const sentTexts: { text: string; shouldExecute: boolean }[] = [];
		return {
			completionPromise: Promise.resolve({ output } as ITerminalExecuteStrategyResult),
			instance: {
				sendText: async (text: string, shouldExecute: boolean) => {
					sentTexts.push({ text, shouldExecute });
				},
			} as unknown as ITerminalInstance,
			getOutput: () => output,
			sentTexts,
		};
	}

	test('tool description documents terminal IDs and use cases', () => {
		const idProperty = SendToTerminalToolData.inputSchema?.properties?.id as { description?: string; pattern?: string } | undefined;
		assert.ok(SendToTerminalToolData.modelDescription.includes('existing persistent terminal session'));
		assert.ok(idProperty?.pattern?.includes('[0-9a-fA-F]{8}'));
	});

	test('returns error for unknown terminal id', async () => {
		RunInTerminalTool.getExecution = () => undefined;

		const result = await tool.invoke(
			createInvocation(UNKNOWN_TERMINAL_ID, 'ls'),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('No active terminal execution found'));
		assert.ok(value.includes(UNKNOWN_TERMINAL_ID));
	});

	test('sends command to terminal and returns acknowledgment', async () => {
		const mockExecution = createMockExecution('$ ls\nfile1.txt\nfile2.txt');
		RunInTerminalTool.getExecution = () => mockExecution;

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID, 'ls'),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('Successfully sent command'));
		assert.ok(value.includes(KNOWN_TERMINAL_ID));
		assert.ok(value.includes('get_terminal_output'), 'should direct agent to use get_terminal_output');

		// Verify sendText was called with shouldExecute=true
		assert.strictEqual(mockExecution.sentTexts.length, 1);
		assert.strictEqual(mockExecution.sentTexts[0].text, 'ls');
		assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
	});

	test('sends multi-word command correctly', async () => {
		const mockExecution = createMockExecution('output');
		RunInTerminalTool.getExecution = () => mockExecution;

		await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID, 'echo hello world'),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(mockExecution.sentTexts.length, 1);
		assert.strictEqual(mockExecution.sentTexts[0].text, 'echo hello world');
		assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
	});

	function createPreparationContext(id: string, command: string): IToolInvocationPreparationContext {
		return {
			parameters: { id, command },
			toolCallId: 'test-call',
		} as unknown as IToolInvocationPreparationContext;
	}

	test('prepareToolInvocation shows command in messages', async () => {
		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'ls -la'),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.ok(prepared.invocationMessage);
		assert.ok(prepared.pastTenseMessage);
		assert.ok(prepared.confirmationMessages);
		assert.ok(prepared.confirmationMessages.title);
		assert.ok(prepared.confirmationMessages.message);
	});

	test('prepareToolInvocation truncates long commands', async () => {
		const longCommand = 'a'.repeat(100);
		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, longCommand),
			CancellationToken.None,
		);

		assert.ok(prepared);
		const message = prepared.invocationMessage as IMarkdownString;
		assert.ok(message.value.includes('...'));
	});

	test('prepareToolInvocation normalizes newlines in command', async () => {
		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'echo hello\necho world'),
			CancellationToken.None,
		);

		assert.ok(prepared);
		const message = prepared.invocationMessage as IMarkdownString;
		assert.ok(!message.value.includes('\n'), 'newlines should be collapsed to spaces');
	});
});
