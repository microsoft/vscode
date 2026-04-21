/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, ChatHookResult, ChatHookType, ChatRequest, LanguageModelToolInformation } from 'vscode';
import { IChatHookService, SessionStartHookInput, StopHookInput, SubagentStartHookInput, SubagentStopHookInput } from '../../../../platform/chat/common/chatHookService';
import { NoopOTelService } from '../../../../platform/otel/common/noopOtelService';
import { resolveOTelConfig } from '../../../../platform/otel/common/otelConfig';
import { IOTelService } from '../../../../platform/otel/common/otelService';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IBuildPromptResult, nullRenderPromptResult } from '../../../prompt/node/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IToolCallingLoopOptions, ToolCallingLoop } from '../../node/toolCallingLoop';

/**
 * Configurable mock implementation of IChatHookService for testing.
 *
 * Allows tests to configure:
 * - Hook results to return for specific hook types
 * - Error behavior to simulate hook failures
 * - Call tracking to verify hook invocations
 */
export class MockChatHookService implements IChatHookService {
	declare readonly _serviceBrand: undefined;

	/** Configured results to return per hook type */
	private readonly hookResults = new Map<ChatHookType, ChatHookResult[]>();

	/** Configured errors to throw per hook type */
	private readonly hookErrors = new Map<ChatHookType, Error>();

	/** Tracks all hook calls for verification */
	readonly hookCalls: Array<{ hookType: ChatHookType; input: unknown }> = [];

	logConfiguredHooks(): void { }

	/**
	 * Configure the results that should be returned when a specific hook type is executed.
	 */
	setHookResults(hookType: ChatHookType, results: ChatHookResult[]): void {
		this.hookResults.set(hookType, results);
	}

	/**
	 * Configure an error to throw when a specific hook type is executed.
	 */
	setHookError(hookType: ChatHookType, error: Error): void {
		this.hookErrors.set(hookType, error);
	}

	/**
	 * Clear all hook calls for test isolation.
	 */
	clearCalls(): void {
		this.hookCalls.length = 0;
	}

	/**
	 * Get all calls for a specific hook type.
	 */
	getCallsForHook(hookType: ChatHookType): Array<{ hookType: ChatHookType; input: unknown }> {
		return this.hookCalls.filter(call => call.hookType === hookType);
	}

	async executeHook(hookType: ChatHookType, _hooks: unknown, input: unknown, _sessionId?: string, _token?: CancellationToken): Promise<ChatHookResult[]> {
		// Track the call
		this.hookCalls.push({ hookType, input });

		// Check if we should throw an error
		const error = this.hookErrors.get(hookType);
		if (error) {
			throw error;
		}

		// Return configured results or empty array
		return this.hookResults.get(hookType) || [];
	}

	async executePreToolUseHook(): Promise<undefined> {
		return undefined;
	}

	async executePostToolUseHook(): Promise<undefined> {
		return undefined;
	}
}

/**
 * Minimal concrete implementation of ToolCallingLoop for testing.
 * Exposes the abstract base class methods for testing while providing
 * simple implementations for the abstract methods.
 */
class TestToolCallingLoop extends ToolCallingLoop<IToolCallingLoopOptions> {
	public lastBuildPromptContext: IBuildPromptContext | undefined;
	public additionalContextValue: string | undefined;

	protected override async buildPrompt(buildPromptContext: IBuildPromptContext): Promise<IBuildPromptResult> {
		this.lastBuildPromptContext = buildPromptContext;
		return nullRenderPromptResult();
	}

	protected override async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		return [];
	}

	protected override async fetch(): Promise<never> {
		throw new Error('fetch should not be called in these tests');
	}

	// Expose the protected method for testing
	public async testRunStartHooks(token: CancellationToken): Promise<void> {
		await this.runStartHooks(undefined, token);
	}

	// Expose the protected stop hook methods for testing
	public async testExecuteStopHook(input: StopHookInput, sessionId: string, token: CancellationToken) {
		return this.executeStopHook(input, sessionId, undefined, token);
	}

	public async testExecuteSubagentStopHook(input: SubagentStopHookInput, sessionId: string, token: CancellationToken) {
		return this.executeSubagentStopHook(input, sessionId, undefined, token);
	}

	// Expose additionalHookContext for verification
	public getAdditionalHookContext(): string | undefined {
		// Access via createPromptContext which uses this.additionalHookContext
		const context = this.createPromptContext([], undefined);
		return context.additionalHookContext;
	}
}

function createMockChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
	return {
		prompt: 'test prompt',
		command: undefined,
		references: [],
		location: 1, // ChatLocation.Panel
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

describe('ToolCallingLoop SessionStart hook', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockChatHookService: MockChatHookService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		mockChatHookService = new MockChatHookService();

		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		// Must define the mock service BEFORE creating the accessor
		serviceCollection.define(IChatHookService, mockChatHookService);
		serviceCollection.define(IOTelService, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })));

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
	});

	describe('SessionStart hook execution conditions', () => {
		it('should execute SessionStart hook on the first turn of regular sessions', async () => {
			const conversation = createTestConversation(1); // First turn
			const request = createMockChatRequest();

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// Spy on the hook service
			vi.spyOn(mockChatHookService, 'executeHook');

			await loop.testRunStartHooks(tokenSource.token);

			const sessionStartCalls = mockChatHookService.getCallsForHook('SessionStart');
			expect(sessionStartCalls).toHaveLength(1);
			expect((sessionStartCalls[0].input as SessionStartHookInput).source).toBe('new');
		});

		it('should NOT execute SessionStart hook on subsequent turns', async () => {
			const conversation = createTestConversation(3); // Third turn
			const request = createMockChatRequest();

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const sessionStartCalls = mockChatHookService.getCallsForHook('SessionStart');
			expect(sessionStartCalls).toHaveLength(0);
		});

		it('should NOT execute SessionStart hook for subagent requests', async () => {
			const conversation = createTestConversation(1); // First turn
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-123',
				subAgentName: 'TestSubagent',
			} as Partial<ChatRequest>);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			// SessionStart should NOT be called for subagents
			const sessionStartCalls = mockChatHookService.getCallsForHook('SessionStart');
			expect(sessionStartCalls).toHaveLength(0);

			// SubagentStart should be called instead
			const subagentStartCalls = mockChatHookService.getCallsForHook('SubagentStart');
			expect(subagentStartCalls).toHaveLength(1);
		});
	});

	describe('SessionStart hook result collection', () => {
		it('should collect additionalContext from single hook result', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 1' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from hook 1');
		});

		it('should concatenate additionalContext from multiple hook results', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 1' } },
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 2' } },
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 3' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from hook 1\nContext from hook 2\nContext from hook 3');
		});

		it('should ignore hook results with no additionalContext', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 1' } },
				},
				{
					resultKind: 'success',
					output: {}, // No additionalContext
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 3' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from hook 1\nContext from hook 3');
		});

		it('should silently ignore failed hook results (blocking errors are ignored)', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 1' } },
				},
				{
					resultKind: 'error',
					output: 'Hook error message',
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 3' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// Should NOT throw - blocking errors are silently ignored for SessionStart
			await expect(loop.testRunStartHooks(tokenSource.token)).resolves.not.toThrow();

			// Only non-error results should be processed
			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from hook 1\nContext from hook 3');
		});

		it('should silently ignore stopReason (continue: false) from hook results', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 1' } },
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 2' } },
					stopReason: 'Build failed, should be ignored',
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from hook 3' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// Should NOT throw - stopReason is silently ignored for SessionStart
			await expect(loop.testRunStartHooks(tokenSource.token)).resolves.not.toThrow();

			// Results with stopReason are skipped, only other results are processed
			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from hook 1\nContext from hook 3');
		});
	});

	describe('SessionStart hook error handling', () => {
		it('should handle hook service throwing error gracefully', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookError('SessionStart', new Error('Hook service error'));

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// Should not throw
			await expect(loop.testRunStartHooks(tokenSource.token)).resolves.not.toThrow();

			// additionalContext should be undefined since error occurred
			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBeUndefined();
		});

		it('should handle empty hook results', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', []);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBeUndefined();
		});
	});

	describe('SessionStart hook context integration', () => {
		it('should pass additionalHookContext to prompt builder context', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Custom context for prompt' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			// Verify the context is available through createPromptContext
			const promptContext = loop.getAdditionalHookContext();
			expect(promptContext).toBe('Custom context for prompt');
		});

		it('should combine SessionStart and appended hook context', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest();

			mockChatHookService.setHookResults('SessionStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Context from SessionStart' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);
			loop.appendAdditionalHookContext('Context from UserPromptSubmit');

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Context from SessionStart\nContext from UserPromptSubmit');
		});
	});
});

describe('ToolCallingLoop SubagentStart hook', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockChatHookService: MockChatHookService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		mockChatHookService = new MockChatHookService();

		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, mockChatHookService);
		serviceCollection.define(IOTelService, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })));

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
	});

	describe('SubagentStart hook execution', () => {
		it('should execute SubagentStart hook for subagent requests', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-456',
				subAgentName: 'PlanAgent',
			} as Partial<ChatRequest>);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const subagentStartCalls = mockChatHookService.getCallsForHook('SubagentStart');
			expect(subagentStartCalls).toHaveLength(1);

			const input = subagentStartCalls[0].input as SubagentStartHookInput;
			expect(input.agent_id).toBe('subagent-456');
			expect(input.agent_type).toBe('PlanAgent');
		});

		it('should use default agent_type when subAgentName is not provided', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-789',
				// subAgentName not provided
			} as Partial<ChatRequest>);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const subagentStartCalls = mockChatHookService.getCallsForHook('SubagentStart');
			expect(subagentStartCalls).toHaveLength(1);

			const input = subagentStartCalls[0].input as SubagentStartHookInput;
			expect(input.agent_type).toBe('default');
		});

		it('should execute SubagentStart hook only once when runStartHooks and run are both called', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-dedup',
				subAgentName: 'DedupAgent',
			} as Partial<ChatRequest>);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// First call: runStartHooks should execute SubagentStart once
			await loop.testRunStartHooks(tokenSource.token);

			// Second call: run() should NOT execute SubagentStart again
			// run() will throw because fetch() is not implemented, but SubagentStart
			// happens before fetch, so we need to verify it wasn't called again
			await expect(loop.run(undefined, tokenSource.token)).rejects.toThrow();

			// SubagentStart should have been called exactly once (from runStartHooks only)
			const subagentStartCalls = mockChatHookService.getCallsForHook('SubagentStart');
			expect(subagentStartCalls).toHaveLength(1);
		});
	});

	describe('SubagentStart hook result collection', () => {
		it('should collect additionalContext from SubagentStart hook', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-test',
				subAgentName: 'TestAgent',
			} as Partial<ChatRequest>);

			mockChatHookService.setHookResults('SubagentStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Subagent-specific context' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('Subagent-specific context');
		});

		it('should concatenate additionalContext from multiple SubagentStart hooks', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-multi',
				subAgentName: 'MultiHookAgent',
			} as Partial<ChatRequest>);

			mockChatHookService.setHookResults('SubagentStart', [
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'First subagent context' } },
				},
				{
					resultKind: 'success',
					output: { hookSpecificOutput: { additionalContext: 'Second subagent context' } },
				},
			]);

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			await loop.testRunStartHooks(tokenSource.token);

			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBe('First subagent context\nSecond subagent context');
		});
	});

	describe('SubagentStart hook error handling', () => {
		it('should handle SubagentStart hook error gracefully', async () => {
			const conversation = createTestConversation(1);
			const request = createMockChatRequest({
				subAgentInvocationId: 'subagent-error',
				subAgentName: 'ErrorAgent',
			} as Partial<ChatRequest>);

			mockChatHookService.setHookError('SubagentStart', new Error('Subagent hook failed'));

			const loop = instantiationService.createInstance(
				TestToolCallingLoop,
				{
					conversation,
					toolCallLimit: 10,
					request,
				}
			);
			disposables.add(loop);

			// Should not throw
			await expect(loop.testRunStartHooks(tokenSource.token)).resolves.not.toThrow();

			// additionalContext should be undefined since error occurred
			const additionalContext = loop.getAdditionalHookContext();
			expect(additionalContext).toBeUndefined();
		});
	});
});

describe('ToolCallingLoop Stop hook', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockChatHookService: MockChatHookService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		mockChatHookService = new MockChatHookService();

		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, mockChatHookService);
		serviceCollection.define(IOTelService, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })));

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
	});

	it('should return shouldContinue=false when no hooks are configured', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(false);
		expect(result.reasons).toBeUndefined();
	});

	it('should block when hook returns decision=block with hookSpecificOutput wrapper', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						hookEventName: 'Stop',
						decision: 'block',
						reason: 'Tests are failing. Fix the implementation until all tests pass before finishing.',
					},
				},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(true);
		expect(result.reasons).toEqual(['Tests are failing. Fix the implementation until all tests pass before finishing.']);
	});

	it('should allow stopping when hook returns decision other than block', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						hookEventName: 'Stop',
						// no decision field
					},
				},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(false);
	});

	it('should allow stopping when hookSpecificOutput is missing', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'success',
				output: {},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(false);
	});

	it('should not block when decision is block but reason is missing', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						decision: 'block',
						// no reason
					},
				},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(false);
	});

	it('should collect blocking reasons from multiple hooks', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						decision: 'block',
						reason: 'Tests are failing.',
					},
				},
			},
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						decision: 'block',
						reason: 'Lint errors found.',
					},
				},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(true);
		expect(result.reasons).toContain('Tests are failing.');
		expect(result.reasons).toContain('Lint errors found.');
	});

	it('should collect error results as blocking reasons', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('Stop', [
			{
				resultKind: 'error',
				output: 'Hook script failed with exit code 2',
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(true);
		expect(result.reasons).toEqual(['Hook script failed with exit code 2']);
	});

	it('should handle hook service errors gracefully', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookError('Stop', new Error('Service unavailable'));

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteStopHook({ stop_hook_active: false }, 'session-1', tokenSource.token);
		expect(result.shouldContinue).toBe(false);
	});
});

describe('ToolCallingLoop SubagentStop hook', () => {
	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let mockChatHookService: MockChatHookService;
	let tokenSource: CancellationTokenSource;

	beforeEach(() => {
		disposables = new DisposableStore();
		mockChatHookService = new MockChatHookService();

		const serviceCollection = disposables.add(createExtensionUnitTestingServices());
		serviceCollection.define(IChatHookService, mockChatHookService);
		serviceCollection.define(IOTelService, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })));

		const accessor = serviceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);

		tokenSource = new CancellationTokenSource();
		disposables.add(tokenSource);
	});

	afterEach(() => {
		disposables.dispose();
		vi.restoreAllMocks();
	});

	it('should block when SubagentStop hook returns decision=block with hookSpecificOutput wrapper', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('SubagentStop', [
			{
				resultKind: 'success',
				output: {
					hookSpecificOutput: {
						hookEventName: 'SubagentStop',
						decision: 'block',
						reason: 'Subagent has not completed its task.',
					},
				},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteSubagentStopHook(
			{ agent_id: 'agent-1', agent_type: 'execution', stop_hook_active: false },
			'session-1',
			tokenSource.token
		);
		expect(result.shouldContinue).toBe(true);
		expect(result.reasons).toEqual(['Subagent has not completed its task.']);
	});

	it('should allow stopping when SubagentStop hookSpecificOutput is missing', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookResults('SubagentStop', [
			{
				resultKind: 'success',
				output: {},
			},
		]);

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteSubagentStopHook(
			{ agent_id: 'agent-1', agent_type: 'execution', stop_hook_active: false },
			'session-1',
			tokenSource.token
		);
		expect(result.shouldContinue).toBe(false);
	});

	it('should handle SubagentStop hook service errors gracefully', async () => {
		const conversation = createTestConversation(1);
		const request = createMockChatRequest();

		mockChatHookService.setHookError('SubagentStop', new Error('Service unavailable'));

		const loop = instantiationService.createInstance(
			TestToolCallingLoop,
			{ conversation, toolCallLimit: 10, request }
		);
		disposables.add(loop);

		const result = await loop.testExecuteSubagentStopHook(
			{ agent_id: 'agent-1', agent_type: 'execution', stop_hook_active: false },
			'session-1',
			tokenSource.token
		);
		expect(result.shouldContinue).toBe(false);
	});
});
