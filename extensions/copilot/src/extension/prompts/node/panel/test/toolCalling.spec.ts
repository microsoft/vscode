/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import type * as vscode from 'vscode';
import { IChatHookService, type IPreToolUseHookResult } from '../../../../../platform/chat/common/chatHookService';
import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../../../platform/endpoint/common/endpointProvider';
import { DeferredPromise } from '../../../../../util/vs/base/common/async';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../../util/vs/base/common/event';
import { constObservable } from '../../../../../util/vs/base/common/observable';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import type { Conversation } from '../../../../prompt/common/conversation';
import type { IBuildPromptContext, IToolCallRound } from '../../../../prompt/common/intents';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService, type IToolValidationResult } from '../../../../tools/common/toolsService';
import { renderPromptElement } from '../../base/promptRenderer';
import { ChatToolCalls } from '../toolCalling';

class CapturingChatHookService implements IChatHookService {
	declare readonly _serviceBrand: undefined;

	public lastPreToolUseCall: {
		readonly toolName: string;
		readonly toolInput: unknown;
		readonly toolCallId: string;
		readonly hooks: vscode.ChatRequestHooks | undefined;
		readonly sessionId: string | undefined;
		readonly token: vscode.CancellationToken | undefined;
	} | undefined;

	public postToolUseCalled = false;

	constructor(
		private readonly hookResult: IPreToolUseHookResult | undefined,
	) { }

	logConfiguredHooks(): void { }

	async executeHook(): Promise<never[]> {
		return [];
	}

	async executePreToolUseHook(
		toolName: string,
		toolInput: unknown,
		toolCallId: string,
		hooks: vscode.ChatRequestHooks | undefined,
		sessionId?: string,
		token?: vscode.CancellationToken,
	): Promise<IPreToolUseHookResult | undefined> {
		this.lastPreToolUseCall = { toolName, toolInput, toolCallId, hooks, sessionId, token };
		return this.hookResult;
	}

	async executePostToolUseHook(): Promise<undefined> {
		this.postToolUseCalled = true;
		return undefined;
	}
}

class CapturingToolsService implements IToolsService {
	declare readonly _serviceBrand: undefined;

	onWillInvokeTool = Event.None;

	readonly tools: ReadonlyArray<vscode.LanguageModelToolInformation>;
	readonly copilotTools = new Map();
	readonly modelSpecificTools = constObservable([]);

	public lastInvocation: {
		readonly name: string;
		readonly options: vscode.LanguageModelToolInvocationOptions<unknown>;
		readonly endpointModel: string | undefined;
		readonly token: vscode.CancellationToken;
	} | undefined;

	public lastToolResult: vscode.LanguageModelToolResult2 | undefined;

	constructor(tool: vscode.LanguageModelToolInformation) {
		this.tools = [tool];
	}

	getCopilotTool(): undefined {
		return undefined;
	}

	invokeTool(): Thenable<vscode.LanguageModelToolResult2> {
		throw new Error('Not implemented in test');
	}

	async invokeToolWithEndpoint(
		name: string,
		options: vscode.LanguageModelToolInvocationOptions<unknown>,
		endpoint: { model: string } | undefined,
		token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelToolResult2> {
		this.lastInvocation = { name, options, endpointModel: endpoint?.model, token };
		const result = new LanguageModelToolResult([new LanguageModelTextPart('tool-ok')]);
		this.lastToolResult = result;
		return result;
	}

	getTool(name: string): vscode.LanguageModelToolInformation | undefined {
		return this.tools.find(t => t.name === name);
	}

	getToolByToolReferenceName(): undefined {
		return undefined;
	}

	validateToolInput(_name: string, input: string): IToolValidationResult {
		return { inputObj: JSON.parse(input) };
	}

	validateToolName(): undefined {
		return undefined;
	}

	getEnabledTools(): vscode.LanguageModelToolInformation[] {
		return [];
	}
}

class ParallelAwareToolsService implements IToolsService {
	declare readonly _serviceBrand: undefined;

	onWillInvokeTool = Event.None;

	readonly tools: ReadonlyArray<vscode.LanguageModelToolInformation>;
	readonly copilotTools = new Map();
	readonly modelSpecificTools = constObservable([]);

	public readonly startedCallIds: string[] = [];
	private readonly pendingCalls = new Map<string, DeferredPromise<vscode.LanguageModelToolResult2>>();
	private readonly startedWaiters: Array<{ expectedCount: number; deferred: DeferredPromise<void> }> = [];

	constructor(tool: vscode.LanguageModelToolInformation) {
		this.tools = [tool];
	}

	getCopilotTool(): undefined {
		return undefined;
	}

	invokeTool(): Thenable<vscode.LanguageModelToolResult2> {
		throw new Error('Not implemented in test');
	}

	invokeToolWithEndpoint(
		_name: string,
		options: vscode.LanguageModelToolInvocationOptions<unknown>,
		_endpoint: { model: string } | undefined,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelToolResult2> {
		const callId = options.chatStreamToolCallId ?? `missing-${this.startedCallIds.length}`;
		this.startedCallIds.push(callId);
		this.resolveStartedWaiters();
		const deferred = new DeferredPromise<vscode.LanguageModelToolResult2>();
		this.pendingCalls.set(callId, deferred);
		return deferred.p;
	}

	waitForStartedCalls(expectedCount: number): Promise<void> {
		if (this.startedCallIds.length >= expectedCount) {
			return Promise.resolve();
		}

		const deferred = new DeferredPromise<void>();
		this.startedWaiters.push({ expectedCount, deferred });
		return deferred.p;
	}

	private resolveStartedWaiters(): void {
		for (let index = this.startedWaiters.length - 1; index >= 0; index--) {
			const waiter = this.startedWaiters[index];
			if (this.startedCallIds.length >= waiter.expectedCount) {
				void waiter.deferred.complete();
				this.startedWaiters.splice(index, 1);
			}
		}
	}

	resolveCall(callId: string, value = 'tool-ok'): void {
		const pending = this.pendingCalls.get(callId);
		if (!pending) {
			throw new Error(`Missing pending call: ${callId}`);
		}

		void pending.complete(new LanguageModelToolResult([new LanguageModelTextPart(value)]));
		this.pendingCalls.delete(callId);
	}

	getTool(name: string): vscode.LanguageModelToolInformation | undefined {
		return this.tools.find(t => t.name === name);
	}

	getToolByToolReferenceName(): undefined {
		return undefined;
	}

	validateToolInput(_name: string, input: string): IToolValidationResult {
		return { inputObj: JSON.parse(input) };
	}

	validateToolName(): undefined {
		return undefined;
	}

	getEnabledTools(): vscode.LanguageModelToolInformation[] {
		return [];
	}
}

describe('ChatToolCalls (toolCalling.tsx)', () => {
	test('starts multiple sub-agent tool calls in parallel', async () => {
		const toolName = ToolName.CoreRunSubagent;
		const firstCallId = 'subagent-call-1';
		const secondCallId = 'subagent-call-2';

		const toolInfo: vscode.LanguageModelToolInformation = {
			name: toolName,
			description: 'sub-agent tool',
			source: undefined,
			inputSchema: undefined,
			tags: [],
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		const toolsService = new ParallelAwareToolsService(toolInfo);
		testingServiceCollection.define(IToolsService, toolsService);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');

		const round: IToolCallRound = {
			id: 'round-1',
			response: 'calling sub-agents',
			toolInputRetry: 0,
			toolCalls: [
				{ name: toolName, arguments: JSON.stringify({ query: 'one' }), id: firstCallId },
				{ name: toolName, arguments: JSON.stringify({ query: 'two' }), id: secondCallId },
			],
		};

		const promptContext: IBuildPromptContext = {
			query: 'test',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			conversation: { sessionId: 'session-123' } as unknown as Conversation,
			request: {} as vscode.ChatRequest,
			tools: {
				toolReferences: [],
				toolInvocationToken: {} as vscode.ChatParticipantToolToken,
				availableTools: [toolInfo],
			},
		};

		const renderPromise = renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
			promptContext,
			toolCallRounds: [round],
			toolCallResults: undefined,
		});

		await toolsService.waitForStartedCalls(2);

		expect(toolsService.startedCallIds).toEqual([firstCallId, secondCallId]);

		toolsService.resolveCall(firstCallId);
		toolsService.resolveCall(secondCallId);

		await renderPromise;
	});

	test('calls preToolUse hook with validated input and respects hook output', async () => {
		const toolName = 'myTool';
		const toolArgs = JSON.stringify({ x: 1 });
		const toolCallId = 'call-1';
		const hookContext = 'extra policy context';

		const updatedInput = { x: 2, safe: true };
		const hooks: vscode.ChatRequestHooks = { PreToolUse: [] };

		const hookResult: IPreToolUseHookResult = {
			permissionDecision: 'ask',
			permissionDecisionReason: 'Needs confirmation',
			updatedInput,
			additionalContext: [hookContext],
		};

		const toolInfo: vscode.LanguageModelToolInformation = {
			name: toolName,
			description: 'test tool',
			source: undefined,
			inputSchema: undefined,
			tags: [],
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		const toolsService = new CapturingToolsService(toolInfo);
		const hookService = new CapturingChatHookService(hookResult);
		testingServiceCollection.define(IToolsService, toolsService);
		testingServiceCollection.define(IChatHookService, hookService);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');

		const round: IToolCallRound = {
			id: 'round-1',
			response: 'calling tool',
			toolInputRetry: 0,
			toolCalls: [{ name: toolName, arguments: toolArgs, id: toolCallId }],
		};

		const conversation = { sessionId: 'session-123' } as unknown as Conversation;
		const promptContext: IBuildPromptContext = {
			query: 'test',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			conversation,
			request: { hooks } as unknown as vscode.ChatRequest,
			tools: {
				toolReferences: [],
				toolInvocationToken: {} as vscode.ChatParticipantToolToken,
				availableTools: [toolInfo],
			},
		};

		await renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
			promptContext,
			toolCallRounds: [round],
			toolCallResults: undefined,
		});

		// Hook called with validated (original) input
		expect(hookService.lastPreToolUseCall).toEqual({
			toolName,
			toolInput: { x: 1 },
			toolCallId,
			hooks,
			sessionId: 'session-123',
			token: CancellationToken.None,
		});

		// Tool invoked with updatedInput from hook
		expect(toolsService.lastInvocation?.name).toBe(toolName);
		expect(toolsService.lastInvocation?.options.input).toEqual(updatedInput);
		expect(toolsService.lastInvocation?.options.preToolUseResult).toEqual({
			permissionDecision: 'ask',
			permissionDecisionReason: 'Needs confirmation',
			updatedInput,
		});

		// Hook additionalContext is appended to the tool result content
		const contentText = (toolsService.lastToolResult?.content ?? [])
			.filter((p): p is LanguageModelTextPart => p instanceof LanguageModelTextPart)
			.map(p => p.value)
			.join('\n');
		expect(contentText).toContain('<PreToolUse-context>');
		expect(contentText).toContain(hookContext);
	});

	test('skips postToolUse hook when preToolUse denies the tool but still appends preToolUse context', async () => {
		const toolName = 'blockedTool';
		const toolArgs = JSON.stringify({ cmd: 'dangerous' });
		const toolCallId = 'call-denied';
		const denyContext = 'This tool was blocked by policy';

		const hookResult: IPreToolUseHookResult = {
			permissionDecision: 'deny',
			permissionDecisionReason: 'Blocked by security policy',
			additionalContext: [denyContext],
		};

		const toolInfo: vscode.LanguageModelToolInformation = {
			name: toolName,
			description: 'blocked tool',
			source: undefined,
			inputSchema: undefined,
			tags: [],
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		const toolsService = new CapturingToolsService(toolInfo);
		const hookService = new CapturingChatHookService(hookResult);
		testingServiceCollection.define(IToolsService, toolsService);
		testingServiceCollection.define(IChatHookService, hookService);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');

		const round: IToolCallRound = {
			id: 'round-1',
			response: 'calling tool',
			toolInputRetry: 0,
			toolCalls: [{ name: toolName, arguments: toolArgs, id: toolCallId }],
		};

		const hooks: vscode.ChatRequestHooks = { PreToolUse: [] };
		const promptContext: IBuildPromptContext = {
			query: 'test',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			conversation: { sessionId: 'session-deny' } as unknown as Conversation,
			request: { hooks } as unknown as vscode.ChatRequest,
			tools: {
				toolReferences: [],
				toolInvocationToken: {} as vscode.ChatParticipantToolToken,
				availableTools: [toolInfo],
			},
		};

		await renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
			promptContext,
			toolCallRounds: [round],
			toolCallResults: undefined,
		});

		// PreToolUse hook was called
		expect(hookService.lastPreToolUseCall).toBeDefined();

		// PostToolUse hook should NOT have been called since PreToolUse denied the tool
		expect(hookService.postToolUseCalled).toBe(false);

		// The tool is still invoked with the deny preToolUseResult passed through
		expect(toolsService.lastInvocation).toBeDefined();
		expect(toolsService.lastInvocation?.name).toBe('blockedTool');
		expect(toolsService.lastInvocation?.options.preToolUseResult).toEqual({
			permissionDecision: 'deny',
			permissionDecisionReason: 'Blocked by security policy',
			updatedInput: undefined,
		});
		// PreToolUse context should still be appended to the tool result
		const contentText = (toolsService.lastToolResult?.content ?? [])
			.filter((p): p is LanguageModelTextPart => p instanceof LanguageModelTextPart)
			.map(p => p.value)
			.join('\n');
		expect(contentText).toContain('<PreToolUse-context>');
		expect(contentText).toContain(denyContext);
		expect(contentText).not.toContain('<PostToolUse-context>');
	});

	test('replaces images with placeholders for historical turns', async () => {
		const toolName = 'viewImage';
		const toolCallId = 'call-img-1';

		const toolInfo: vscode.LanguageModelToolInformation = {
			name: toolName,
			description: 'view image tool',
			source: undefined,
			inputSchema: undefined,
			tags: [],
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		const toolsService = new CapturingToolsService(toolInfo);
		testingServiceCollection.define(IToolsService, toolsService);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');

		const imageData = new Uint8Array(1024);
		const toolCallResults: Record<string, vscode.LanguageModelToolResult> = {
			[toolCallId]: new LanguageModelToolResult([
				new LanguageModelTextPart('some text result'),
				LanguageModelDataPart.image(imageData, 'image/png'),
			]),
		};

		const round: IToolCallRound = {
			id: 'round-1',
			response: 'viewing image',
			toolInputRetry: 0,
			toolCalls: [{ name: toolName, arguments: '{}', id: toolCallId }],
		};

		const promptContext: IBuildPromptContext = {
			query: 'test',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			conversation: { sessionId: 'session-img' } as unknown as Conversation,
			request: {} as vscode.ChatRequest,
			tools: {
				toolReferences: [],
				toolInvocationToken: {} as vscode.ChatParticipantToolToken,
				availableTools: [toolInfo],
			},
		};

		const { messages } = await renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
			promptContext,
			toolCallRounds: [round],
			toolCallResults,
			isHistorical: true,
		});

		const serialized = JSON.stringify(messages);
		expect(serialized).toContain('Image was previously shown to you');
		expect(serialized).toContain('some text result');
		// Should not contain base64 image data
		expect(serialized).not.toContain('image_url');
	});

	test('enforces shared image budget across tool results', async () => {
		const toolName = 'viewImage';
		const firstCallId = 'call-big-1';
		const secondCallId = 'call-big-2';

		const toolInfo: vscode.LanguageModelToolInformation = {
			name: toolName,
			description: 'view image tool',
			source: undefined,
			inputSchema: undefined,
			tags: [],
		};

		const testingServiceCollection = createExtensionUnitTestingServices();
		const toolsService = new CapturingToolsService(toolInfo);
		testingServiceCollection.define(IToolsService, toolsService);

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');

		// Disable image uploads so images go through the base64 path where the budget applies
		const configService = accessor.get(IConfigurationService);
		await configService.setConfig(ConfigKey.EnableChatImageUpload, false);

		// Each image is 3MB — individually exceeds the 2.5MB shared budget (half of 5MB CAPI limit)
		const bigImage = new Uint8Array(3 * 1024 * 1024);
		const toolCallResults: Record<string, vscode.LanguageModelToolResult> = {
			[firstCallId]: new LanguageModelToolResult([
				LanguageModelDataPart.image(bigImage, 'image/png'),
			]),
			[secondCallId]: new LanguageModelToolResult([
				LanguageModelDataPart.image(bigImage, 'image/png'),
			]),
		};

		const round: IToolCallRound = {
			id: 'round-1',
			response: 'viewing images',
			toolInputRetry: 0,
			toolCalls: [
				{ name: toolName, arguments: '{}', id: firstCallId },
				{ name: toolName, arguments: '{}', id: secondCallId },
			],
		};

		const promptContext: IBuildPromptContext = {
			query: 'test',
			history: [],
			chatVariables: new ChatVariablesCollection(),
			conversation: { sessionId: 'session-budget' } as unknown as Conversation,
			request: {} as vscode.ChatRequest,
			tools: {
				toolReferences: [],
				toolInvocationToken: {} as vscode.ChatParticipantToolToken,
				availableTools: [toolInfo],
			},
		};

		const { messages } = await renderPromptElement(instantiationService, endpoint, ChatToolCalls, {
			promptContext,
			toolCallRounds: [round],
			toolCallResults,
		});

		const serialized = JSON.stringify(messages);
		// Both images exceed the 2.5MB shared budget and should be replaced with placeholders
		expect(serialized).toContain('context image budget exceeded');
		expect(serialized).not.toContain('image_url');
	});

	test('sendInvokedToolTelemetry handles tool results with images without crashing', async () => {
		// Regression test for issue #312813: ensure sendInvokedToolTelemetry uses DI to instantiate
		// PrimitiveToolResult so that @IPromptEndpoint is properly injected when rendering images.
		// Previously, it used raw BasePromptRenderer which bypassed DI, causing 'Cannot read properties
		// of undefined (reading "supportsVision")' when a tool result contained an image.

		const testingServiceCollection = createExtensionUnitTestingServices();
		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpointProvider = accessor.get(IEndpointProvider);
		const endpoint = await endpointProvider.getChatEndpoint('copilot-base');
		const telemetryService = accessor.get(ITelemetryService);
		const configService = accessor.get(IConfigurationService);

		// Disable image uploads in test environment to avoid auth requirement
		await configService.setConfig(ConfigKey.EnableChatImageUpload, false);

		// Import the function we're testing
		const { sendInvokedToolTelemetry } = await import('../toolCalling');

		// Create a tool result with an image
		const imageData = new Uint8Array(1024);
		const toolResult = new LanguageModelToolResult([
			new LanguageModelTextPart('Tool executed successfully'),
			LanguageModelDataPart.image(imageData, 'image/png'),
		]);

		// This should not throw — the endpoint and all services must be properly injected so that
		// onImage() can read this.endpoint.supportsVision without crashing.
		// The function is fire-and-forget (returns undefined), so we just verify it doesn't throw.
		expect(() => {
			sendInvokedToolTelemetry(
				instantiationService,
				endpoint as any, // endpoint satisfies IChatEndpoint
				telemetryService,
				'testTool',
				toolResult,
			);
		}).not.toThrow();

		// Give async rendering a moment to complete without unhandled rejection
		await new Promise(resolve => setTimeout(resolve, 100));
	});
});
