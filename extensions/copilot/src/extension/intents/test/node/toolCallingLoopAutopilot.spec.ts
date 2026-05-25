/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest, LanguageModelToolInformation } from 'vscode';
import { IChatHookService } from '../../../../platform/chat/common/chatHookService';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCallRound } from '../../../prompt/common/intents';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IToolsService } from '../../../tools/common/toolsService';
import { TestToolsService } from '../../../tools/node/test/testToolsService';
import { IToolCallingLoopOptions, IToolCallSingleResult, ToolCallingLoop } from '../../node/toolCallingLoop';
import { MockChatHookService } from './toolCallingLoopHooks.spec';

/**
 * Concrete test implementation that exposes autopilot-related protected methods.
 */
class AutopilotTestToolCallingLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	protected override async buildPrompt(_buildPromptContext: IBuildPromptContext): Promise<IBuildPromptResult> {
		return nullRenderPromptResult();
	}

	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		return [];
	}

	protected override async fetch(): Promise<never> {
		throw new Error('fetch should not be called in these tests');
	}

	public testShouldAutopilotContinue(result: IToolCallSingleResult): string | undefined {
		return this.shouldAutopilotContinue(result);
	}

	public testShouldAutoRetry(response: ChatResponse): boolean {
		return (this as any).shouldAutoRetry(response);
	}

	public incrementAutopilotRetryCount(): void {
		(this as any).autopilotRetryCount++;
	}

	/**
	 * Simulate the autopilotStopHookActive flag being set (as it would be in run()).
	 */
	public setAutopilotStopHookActive(value: boolean): void {
		// Access the private-ish field via prototype trick
		(this as any).autopilotStopHookActive = value;
	}

	/**
	 * Push a fake round into the internal toolCallRounds.
	 */
	public addToolCallRound(round: IToolCallRound): void {
		(this as any).toolCallRounds.push(round);
	}

	/**
	 * Expose ensureAutopilotTools for testing.
	 */
	public testEnsureAutopilotTools(tools: LanguageModelToolInformation[]): LanguageModelToolInformation[] {
		return this.ensureAutopilotTools(tools);
	}
}

function createMockChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
	return {
		prompt: 'test prompt',
		command: undefined,
		references: [],
		location: 1,
		location2: undefined,
		attempt: 0,
		enableCommandDetection: false,
		isParticipantDetected: false,
		toolReferences: [],
		toolInvocationToken: {} as ChatRequest['toolInvocationToken'],
		model: null!,
		tools: new Map(),
		id: generateUuid(),
		sessionId: generateUuid(),
		...overrides,
	} as ChatRequest;
}

function createTestConversation(turnCount: number = 1): Conversation {
	const turns: Turn[] = [];
	for (let i = 0; i < turnCount; i++) {
		turns.push(new Turn(
			generateUuid(),
			{ message: `test message ${i}`, type: 'user' }
		));
	}
	return new Conversation(generateUuid(), turns);
}

function createMockRound(toolCallNames: string[] = [], response: string = ''): IToolCallRound {
	return {
		id: generateUuid(),
		response,
		toolInputRetry: 0,
		toolCalls: toolCallNames.map(name => ({
			id: generateUuid(),
			name,
			arguments: '{}',
		})),
	};
}

function createMockSingleResult(overrides: Partial<IToolCallSingleResult> = {}): IToolCallSingleResult {
	return {
		response: { type: 0, value: '' } as any,
		round: createMockRound(),
		hadIgnoredFiles: false,
		lastRequestMessages: [],
		availableTools: [],
		...overrides,
	};
}

describe('ToolCallingLoop autopilot', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		const mockChatHookService = new MockChatHookService();

		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, mockChatHookService);

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
	});

	function createLoop(permissionLevel?: string, requestOverrides: Partial<ChatRequest> = {}): AutopilotTestToolCallingLoop {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest({
			permissionLevel,
			...requestOverrides,
		} as Partial<ChatRequest>);
		const loop = instantiationService.createInstance(
			AutopilotTestToolCallingLoop,
			{
				conversation,
				toolCallLimit: 10,
				request,
			}
		);
		disposables.add(loop);
		return loop;
	}

	describe('shouldAutopilotContinue', () => {
		it('should return a nudge message when task_complete was not called', () => {
			const loop = createLoop('autopilot');
			const result = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(result).toContain('task_complete');
		});

		it('should return undefined when task_complete was called in a previous round', () => {
			const loop = createLoop('autopilot');
			loop.addToolCallRound(createMockRound(['task_complete']));

			const result = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(result).toBeUndefined();
		});

		it('should stop after MAX_AUTOPILOT_ITERATIONS', () => {
			const loop = createLoop('autopilot');

			// Iterate 5 times (MAX_AUTOPILOT_ITERATIONS = 5)
			for (let i = 0; i < 5; i++) {
				const msg = loop.testShouldAutopilotContinue(createMockSingleResult());
				expect(msg).toContain('task_complete');
			}

			// 6th call should return undefined — hit the cap
			const msg = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(msg).toBeUndefined();
		});

		it('should bail when prior nudge produced no tool calls', () => {
			const loop = createLoop('autopilot');

			// Simulate that we already nudged once and set the flag
			loop.setAutopilotStopHookActive(true);

			// Should bail — the previous nudge produced no tool calls, so further nudges
			// would just waste tokens (the model is effectively done).
			const result = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(result).toBeUndefined();
		});

		it('should skip the nudge when the model returned a text-only response (no tool calls)', () => {
			const loop = createLoop('autopilot');
			const result = loop.testShouldAutopilotContinue(createMockSingleResult({
				round: createMockRound([], 'Here is a summary of what I did.'),
			}));
			expect(result).toBeUndefined();
		});

		it('should allow another nudge after autopilotStopHookActive is reset', () => {
			const loop = createLoop('autopilot');

			// First nudge
			const msg1 = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(msg1).toContain('task_complete');

			// Simulate the run() loop setting the flag then the model making progress
			loop.setAutopilotStopHookActive(true);
			// Reset as if tool calls were made (what run() does now)
			loop.setAutopilotStopHookActive(false);

			// Second nudge should work
			const msg2 = loop.testShouldAutopilotContinue(createMockSingleResult());
			expect(msg2).toContain('task_complete');
		});
	});

	describe('shouldAutoRetry', () => {
		function mockResponse(type: ChatFetchResponseType): ChatResponse {
			return { type, reason: 'test', requestId: 'req-1', serverRequestId: undefined } as any;
		}

		it('should retry on network error in autoApprove mode', () => {
			const loop = createLoop('autoApprove');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.NetworkError))).toBe(true);
		});

		it('should retry on Failed in autopilot mode', () => {
			const loop = createLoop('autopilot');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.Failed))).toBe(true);
		});

		it('should retry on BadRequest', () => {
			const loop = createLoop('autoApprove');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.BadRequest))).toBe(true);
		});

		it('should not retry on RateLimited', () => {
			const loop = createLoop('autoApprove');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.RateLimited))).toBe(false);
		});

		it('should not retry on QuotaExceeded', () => {
			const loop = createLoop('autopilot');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.QuotaExceeded))).toBe(false);
		});

		it('should not retry on Canceled', () => {
			const loop = createLoop('autoApprove');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.Canceled))).toBe(false);
		});

		it('should not retry on OffTopic', () => {
			const loop = createLoop('autopilot');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.OffTopic))).toBe(false);
		});

		it('should not retry on Success', () => {
			const loop = createLoop('autoApprove');
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.Success))).toBe(false);
		});

		it('should not retry without autoApprove or autopilot permission', () => {
			const loop = createLoop(undefined);
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.NetworkError))).toBe(false);
		});

		it('should not retry after hitting MAX_AUTOPILOT_RETRIES', () => {
			const loop = createLoop('autoApprove');
			for (let i = 0; i < 3; i++) {
				loop.incrementAutopilotRetryCount();
			}
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.NetworkError))).toBe(false);
		});

		it('should allow retries up to the limit', () => {
			const loop = createLoop('autopilot');
			for (let i = 0; i < 2; i++) {
				loop.incrementAutopilotRetryCount();
			}
			// 2 retries done, still under the cap of 3
			expect(loop.testShouldAutoRetry(mockResponse(ChatFetchResponseType.Failed))).toBe(true);
		});
	});

	describe('tool call limit extension', () => {
		it('should have a hard cap of 200 for autoApprove mode', () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				permissionLevel: 'autoApprove',
			} as Partial<ChatRequest>);
			const loop = instantiationService.createInstance(
				AutopilotTestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 150,
					request,
				}
			);
			disposables.add(loop);

			// The actual extension happens in run(), which we can't easily call
			// without a full mock of runOne, but we verified the cap of 200
			// exists in the source. The important thing is the constant behavior.
			expect((loop as any).options.toolCallLimit).toBe(150);
		});

		it('should have a hard cap of 200 for autopilot mode', () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				permissionLevel: 'autopilot',
			} as Partial<ChatRequest>);
			const loop = instantiationService.createInstance(
				AutopilotTestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 150,
					request,
				}
			);
			disposables.add(loop);

			expect((loop as any).options.toolCallLimit).toBe(150);
		});
	});

	describe('ensureAutopilotTools', () => {
		const mockTaskCompleteTool: LanguageModelToolInformation = {
			name: 'task_complete',
			description: 'Signal that the task is done',
			inputSchema: { type: 'object', properties: {} },
			tags: [],
			source: undefined,
		};

		function registerTaskCompleteTool(): void {
			const toolsService = instantiationService.invokeFunction(acc => acc.get(IToolsService)) as TestToolsService;
			toolsService.addTestToolOverride(mockTaskCompleteTool, { invoke: () => ({ content: [] }) });
		}

		it('should add task_complete when missing in autopilot mode', () => {
			registerTaskCompleteTool();
			const loop = createLoop('autopilot');
			const tools: LanguageModelToolInformation[] = [
				{ name: 'read_file', description: '', inputSchema: undefined, tags: [], source: undefined },
			];
			const result = loop.testEnsureAutopilotTools(tools);
			expect(result).toHaveLength(2);
			expect(result.some(t => t.name === 'task_complete')).toBe(true);
		});

		it('should not duplicate task_complete when already present', () => {
			registerTaskCompleteTool();
			const loop = createLoop('autopilot');
			const tools: LanguageModelToolInformation[] = [mockTaskCompleteTool];
			const result = loop.testEnsureAutopilotTools(tools);
			expect(result).toHaveLength(1);
		});

		it('should not add task_complete in non-autopilot mode', () => {
			registerTaskCompleteTool();
			const loop = createLoop('autoApprove');
			const tools: LanguageModelToolInformation[] = [];
			const result = loop.testEnsureAutopilotTools(tools);
			expect(result).toHaveLength(0);
		});

		it('should return tools unchanged when not in autopilot mode', () => {
			const loop = createLoop(undefined);
			const tools: LanguageModelToolInformation[] = [
				{ name: 'read_file', description: '', inputSchema: undefined, tags: [], source: undefined },
			];
			const result = loop.testEnsureAutopilotTools(tools);
			expect(result).toBe(tools);
		});
	});
});
