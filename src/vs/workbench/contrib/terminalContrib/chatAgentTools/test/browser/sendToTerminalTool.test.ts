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
import { ITerminalChatService, ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ChatPermissionLevel } from '../../../../chat/common/constants.js';

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
		const commandProperty = SendToTerminalToolData.inputSchema?.properties?.command as { description?: string } | undefined;
		assert.ok(SendToTerminalToolData.modelDescription.includes('Send input text to a terminal session'));
		assert.ok(SendToTerminalToolData.modelDescription.includes('may be empty or whitespace to press Enter'));
		assert.ok(commandProperty?.description?.includes('Provide an empty or whitespace string to send just Enter'));
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

	function createPreparationContext(id: string, command: string, chatSessionResource?: URI): IToolInvocationPreparationContext {
		return {
			parameters: { id, command },
			toolCallId: 'test-call',
			chatSessionResource,
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

	test('prepareToolInvocation skips confirmation when answering a question carousel', async () => {
		const sessionResource = URI.parse('chat-session://test-session');
		const mockSession = {
			getRequests: () => [{
				response: {
					response: {
						value: [{
							kind: 'questionCarousel' as const,
							terminalId: KNOWN_TERMINAL_ID,
							questions: [{ id: 'q1', title: 'package name?', message: 'package name?' }],
							data: { q1: 'my-package' },
						}]
					}
				}
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'my-package', sessionResource),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.strictEqual(prepared.confirmationMessages, undefined, 'should skip confirmation when the command matches a carousel answer');
	});

	test('prepareToolInvocation does not skip confirmation when the command does not match a carousel answer', async () => {
		const sessionResource = URI.parse('chat-session://test-session');
		const mockSession = {
			getRequests: () => [{
				response: {
					response: {
						value: [{
							kind: 'questionCarousel' as const,
							terminalId: KNOWN_TERMINAL_ID,
							questions: [{ id: 'q1', title: 'package name?', message: 'package name?' }],
							data: { q1: 'my-package' },
						}]
					}
				}
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'different-package', sessionResource),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.ok(prepared.confirmationMessages, 'should require confirmation when the command does not match a carousel answer');
	});

	test('prepareToolInvocation skips confirmation only for exact matches in multi-question carousels', async () => {
		const sessionResource = URI.parse('chat-session://test-session');
		const carousel = {
			kind: 'questionCarousel' as const,
			terminalId: KNOWN_TERMINAL_ID,
			questions: [
				{ id: 'q1', title: 'package name?', message: 'package name?' },
				{ id: 'q2', title: 'entry point?', message: 'entry point?' }
			],
			data: { q1: 'my-package', q2: 'src/index.ts' },
		};
		// Simulate one prior send_to_terminal invocation after the carousel
		// so that positional matching targets question[1] (entry point)
		const priorSendInvocation = {
			kind: 'toolInvocation' as const,
			toolId: 'send_to_terminal',
		};
		const mockSession = {
			getRequests: () => [{
				response: {
					response: {
						value: [carousel, priorSendInvocation]
					}
				}
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const exactMatchPrepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'src/index.ts', sessionResource),
			CancellationToken.None,
		);

		assert.ok(exactMatchPrepared);
		assert.strictEqual(exactMatchPrepared.confirmationMessages, undefined, 'should skip confirmation when the command exactly matches a carousel answer');

		const mismatchedPrepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'src/index.js', sessionResource),
			CancellationToken.None,
		);

		assert.ok(mismatchedPrepared);
		assert.ok(mismatchedPrepared.confirmationMessages, 'should require confirmation when the command does not exactly match any carousel answer');
	});

	test('prepareToolInvocation uses positional matching for identical answers (all defaults)', async () => {
		const sessionResource = URI.parse('chat-session://test-session');
		const carousel = {
			kind: 'questionCarousel' as const,
			terminalId: KNOWN_TERMINAL_ID,
			questions: [
				{ id: 'q1', title: 'package name?', message: 'package name?' },
				{ id: 'q2', title: 'version?', message: 'version?' },
				{ id: 'q3', title: 'description?', message: 'description?' },
			],
			data: { q1: '', q2: '', q3: '' },
		};

		// First call: no prior send_to_terminal → positional index 0 → "package name?"
		const mockSession0 = {
			getRequests: () => [{
				response: { response: { value: [carousel] } }
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession0);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const first = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, '', sessionResource),
			CancellationToken.None,
		);
		assert.ok(first);
		assert.strictEqual(first.confirmationMessages, undefined);
		const firstMsg = first.pastTenseMessage as IMarkdownString;
		assert.ok(firstMsg.value.includes('package'), 'first call should show package name question');

		// Second call: one prior send_to_terminal → positional index 1 → "version?"
		const priorSend1 = { kind: 'toolInvocation' as const, toolId: 'send_to_terminal' };
		const mockSession1 = {
			getRequests: () => [{
				response: { response: { value: [carousel, priorSend1] } }
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession1);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const second = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, '', sessionResource),
			CancellationToken.None,
		);
		assert.ok(second);
		assert.strictEqual(second.confirmationMessages, undefined);
		const secondMsg = second.pastTenseMessage as IMarkdownString;
		assert.ok(secondMsg.value.includes('version'), 'second call should show version question');

		// Third call: two prior send_to_terminal → positional index 2 → "description?"
		const priorSend2 = { kind: 'toolInvocation' as const, toolId: 'send_to_terminal' };
		const mockSession2 = {
			getRequests: () => [{
				response: { response: { value: [carousel, priorSend1, priorSend2] } }
			}],
		};
		instantiationService.stub(IChatService, 'getSession', () => mockSession2);
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const third = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, '', sessionResource),
			CancellationToken.None,
		);
		assert.ok(third);
		assert.strictEqual(third.confirmationMessages, undefined);
		const thirdMsg = third.pastTenseMessage as IMarkdownString;
		assert.ok(thirdMsg.value.includes('description'), 'third call should show description question');
	});

	test('prepareToolInvocation shows confirmation in default permission mode', async () => {
		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'hello'),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.ok(prepared.confirmationMessages, 'should show confirmation in default mode');
		assert.strictEqual(prepared.confirmationMessages.title, 'Send to Terminal');
	});

	test('prepareToolInvocation skips confirmation in auto-approve mode', async () => {
		const sessionResource = URI.parse('chat-session://test-session');
		instantiationService.stub(IChatWidgetService, {
			getWidgetBySessionResource: () => ({
				input: {
					currentModeInfo: {
						permissionLevel: ChatPermissionLevel.AutoApprove,
					},
				},
			}) as unknown as IChatWidget,
			lastFocusedWidget: undefined,
		});
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'hello', sessionResource),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.strictEqual(prepared.confirmationMessages, undefined, 'should skip confirmation in auto-approve mode');
	});

	test('prepareToolInvocation Focus Terminal link does not contain $(terminal)', async () => {
		const mockExecution = createMockExecution('output');
		(mockExecution.instance as { instanceId: number }).instanceId = 42;
		(mockExecution.instance as { title: string }).title = 'node';
		RunInTerminalTool.getExecution = () => mockExecution;
		instantiationService.stub(ITerminalService, {
			getInstanceFromId: () => undefined,
		});
		tool = store.add(instantiationService.createInstance(SendToTerminalTool));

		const prepared = await tool.prepareToolInvocation(
			createPreparationContext(KNOWN_TERMINAL_ID, 'hello'),
			CancellationToken.None,
		);

		assert.ok(prepared);
		assert.ok(prepared.confirmationMessages);
		const message = prepared.confirmationMessages.message as IMarkdownString;
		assert.ok(!message.value.includes('$(terminal)'), 'Focus Terminal link should not contain literal $(terminal)');
		assert.ok(message.value.includes('Focus Terminal'), 'should contain Focus Terminal link text');
	});
});
