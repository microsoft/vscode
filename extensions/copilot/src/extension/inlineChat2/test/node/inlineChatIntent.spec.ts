/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, Mock, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { InlineChatIntent } from '../../node/inlineChatIntent';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ILogService } from '../../../../platform/log/common/logService';
import { IToolsService } from '../../../tools/common/toolsService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IEditSurvivalTrackerService } from '../../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { Conversation, Turn } from '../../../prompt/common/conversation';
import { ChatLocation, ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { ChatTelemetryBuilder } from '../../../prompt/node/chatParticipantTelemetry';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ChatRequestEditorData } from '../../../../vscodeTypes';
import { CopilotInteractiveEditorResponse } from '../../../inlineChat/node/promptCraftingTypes';
import { IToolCall } from '../../../prompt/common/intents';
import { ToolCallRound } from '../../../prompt/common/toolCallRound';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../util/vs/base/common/uri';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IOTelService, SpanStatusCode } from '../../../../platform/otel/common/otelService';
import { CapturingOTelService } from '../../../../platform/otel/common/test/capturingOTelService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, GitHubCopilotAttr } from '../../../../platform/otel/common/genAiAttributes';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { BasePromptElementProps } from '@vscode/prompt-tsx';
import { ToolName } from '../../../tools/common/toolNames';

type TestToolCall = { id: string; name: string; arguments: string };

interface TestModelResponse {
	readonly value: string;
	readonly requestId?: string;
	readonly modelCallId?: string;
	readonly resolvedModel?: string;
	readonly usage?: {
		readonly prompt_tokens?: number;
		readonly completion_tokens?: number;
		readonly prompt_tokens_details?: {
			readonly cached_tokens?: number;
			readonly cache_creation_input_tokens?: number;
		};
		readonly completion_tokens_details?: {
			readonly reasoning_tokens?: number;
		};
	};
	readonly toolCalls?: readonly TestToolCall[];
	readonly advanceTimeMs?: number;
}

interface InlineChatHarnessOptions {
	readonly responses?: readonly TestModelResponse[];
	readonly toolResults?: readonly { readonly hasError?: boolean }[];
	readonly advanceTime?: (ms: number) => void;
	readonly markEditOnSuccessfulTool?: boolean;
}


suite('InlineChatIntent', () => {

	test('Metadata is set on the latest turn', async () => {
		const mockInstantiationService = {
			createInstance: vi.fn((ctor, ...args) => {
				if (ctor.name === 'InlineChatProgressMessages') {
					return {
						getContextualMessage: vi.fn().mockResolvedValue('mock message')
					};
				}
				if (ctor.name === 'InlineChatToolCalling') {
					return {
						run: vi.fn().mockResolvedValue({
							lastResponse: { type: ChatFetchResponseType.Success, value: 'mocked success!' },
							telemetry: { telemetryMessageId: 'test-msg-id' },
							needsExitTool: false
						})
					};
				}
				return {};
			})
		} as unknown as IInstantiationService;

		const mockEndpointProvider = {
			getChatEndpoint: vi.fn().mockResolvedValue({ supportsToolCalls: true })
		} as unknown as IEndpointProvider;

		const mockAuthService = {
			getCopilotToken: vi.fn()
		} as unknown as IAuthenticationService;

		const mockLogService = {
			warn: vi.fn(),
			error: vi.fn(),
			trace: vi.fn()
		} as unknown as ILogService;

		const mockIgnoreService = {
			isCopilotIgnored: vi.fn().mockResolvedValue(false)
		} as unknown as IIgnoreService;

		const mockEditTracker = {
			collectAIEdits: vi.fn()
		};
		const mockEditSurvivalTrackerService = {
			initialize: vi.fn().mockReturnValue(mockEditTracker)
		} as unknown as IEditSurvivalTrackerService;

		const mockOctoKitService = {
			getGitHubOutageStatus: vi.fn()
		} as unknown as IOctoKitService;

		const intent = new InlineChatIntent(
			mockInstantiationService,
			mockEndpointProvider,
			mockAuthService,
			mockLogService,
			mockIgnoreService,
			mockEditSurvivalTrackerService,
			mockOctoKitService
		);

		const mockTurn = {
			setMetadata: vi.fn()
		};

		const conversation = new Conversation('someId', [mockTurn as unknown as Turn]);

		const document = createTextDocumentData(URI.parse('file:///test.ts'), 'test content', 'typescript').document;
		const request = {
			prompt: 'test prompt',
			location2: new ChatRequestEditorData({} as vscode.TextEditor, document, {} as vscode.Selection, {} as vscode.Range),
			toolInvocationToken: {} as vscode.ChatParticipantToolToken
		} as unknown as vscode.ChatRequest;

		const stream = {
			progress: vi.fn(),
			text: vi.fn()
		} as unknown as vscode.ChatResponseStream;

		const token = CancellationToken.None;

		const documentContext = { document: TextDocumentSnapshot.create(document) } as IDocumentContext;
		const chatTelemetry = {} as ChatTelemetryBuilder;

		await intent.handleRequest(conversation, request, stream, token, documentContext, 'agent', ChatLocation.Editor, chatTelemetry);

		expect(mockTurn.setMetadata).toHaveBeenCalledTimes(1);
		const metadata = mockTurn.setMetadata.mock.calls[0][0];
		expect(metadata).toBeInstanceOf(CopilotInteractiveEditorResponse);
		expect(metadata.messageId).toBe('test-msg-id');
		expect(metadata.promptQuery.query).toBe('test prompt');
		expect(metadata.promptQuery.document).toBe(documentContext.document);
	});

	test('Inline tool loop emits an invoke_agent OTel root span', async () => {
		const harness = createInlineChatHarness();

		try {
			await harness.run();
		} finally {
			harness.restore();
		}

		expect(harness.otelService.spans).toEqual([
			expect.objectContaining({
				name: 'invoke_agent Inline Chat',
				statusCode: SpanStatusCode.OK,
				ended: true,
				attributes: expect.objectContaining({
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
					[GenAiAttr.AGENT_NAME]: 'Inline Chat',
					[GenAiAttr.CONVERSATION_ID]: 'someId',
					[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
					[GenAiAttr.RESPONSE_MODEL]: 'gpt-4o-2024-08-06',
					[GenAiAttr.USAGE_INPUT_TOKENS]: 10,
					[GenAiAttr.USAGE_OUTPUT_TOKENS]: 5,
					[CopilotChatAttr.SESSION_ID]: 'someId',
					[CopilotChatAttr.USER_REQUEST]: 'test prompt',
					[CopilotChatAttr.TURN_COUNT]: 1,
					[GitHubCopilotAttr.AGENT_TYPE]: 'builtin',
				})
			})
		]);
	});

	test('Bail-out exit tool is invoked inside the invoke_agent span', async () => {
		const harness = createInlineChatHarness();

		let invokeToolCalledWhileSpanActive = false;
		(harness.mockToolsService.invokeTool as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => {
			if (name === 'inline_chat_exit') {
				const rootSpan = harness.otelService.spans.find(s => s.name === 'invoke_agent Inline Chat');
				invokeToolCalledWhileSpanActive = rootSpan !== undefined && rootSpan.ended === false;
			}
			return undefined;
		});

		try {
			await harness.run();
		} finally {
			harness.restore();
		}

		// Default harness response has no tool calls -> needsExitTool === true,
		// so the bail-out invocation must run while the invoke_agent span is still active.
		expect(harness.mockToolsService.invokeTool).toHaveBeenCalledWith(
			'inline_chat_exit',
			expect.anything(),
			expect.anything()
		);
		expect(invokeToolCalledWhileSpanActive).toBe(true);
	});

	test('Inline tool loop aggregates tokens, tool rounds, and metrics across recovered tool failures', async () => {
		let now = 1000;
		const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
		const firstToolCall = { id: 'tool-call-1', name: ToolName.ApplyPatch, arguments: '{}' };
		const secondToolCall = { id: 'tool-call-2', name: ToolName.ApplyPatch, arguments: '{}' };
		const harness = createInlineChatHarness({
			responses: [
				{
					value: 'first try',
					requestId: 'request-1',
					modelCallId: 'model-call-1',
					resolvedModel: 'gpt-4o-2024-08-06',
					usage: {
						prompt_tokens: 10,
						completion_tokens: 5,
						prompt_tokens_details: { cached_tokens: 2 },
					},
					toolCalls: [firstToolCall],
					advanceTimeMs: 200,
				},
				{
					value: 'second try',
					requestId: 'request-2',
					modelCallId: 'model-call-2',
					resolvedModel: 'gpt-4o-2024-08-06',
					usage: {
						prompt_tokens: 20,
						completion_tokens: 7,
						prompt_tokens_details: { cached_tokens: 3, cache_creation_input_tokens: 4 },
						completion_tokens_details: { reasoning_tokens: 6 },
					},
					toolCalls: [secondToolCall],
					advanceTimeMs: 300,
				},
			],
			toolResults: [{ hasError: true }, { hasError: false }],
			advanceTime: ms => now += ms,
			markEditOnSuccessfulTool: true,
		});

		try {
			await harness.run();
		} finally {
			harness.restore();
			nowSpy.mockRestore();
		}

		const rootSpan = harness.otelService.spans[0];
		const sendToolCallingTelemetryMock = harness.telemetry.sendToolCallingTelemetry as Mock;
		const invokeToolWithEndpointMock = harness.mockToolsService.invokeToolWithEndpoint as unknown as Mock;
		expect(sendToolCallingTelemetryMock).toHaveBeenCalledTimes(1);
		const recordedRounds = sendToolCallingTelemetryMock.mock.calls[0][0] as ToolCallRound[];
		const rounds = recordedRounds.map(round => ({
			response: round.response,
			toolCalls: round.toolCalls.map((toolCall: IToolCall) => ({ id: toolCall.id, name: toolCall.name })),
		}));

		expect({
			rootSpan: {
				statusCode: rootSpan.statusCode,
				attributes: rootSpan.attributes,
			},
			toolInvocations: invokeToolWithEndpointMock.mock.calls.length,
			rounds,
		}).toEqual({
			rootSpan: {
				statusCode: SpanStatusCode.OK,
				attributes: expect.objectContaining({
					[CopilotChatAttr.TURN_COUNT]: 2,
					[GenAiAttr.RESPONSE_ID]: 'model-call-2',
					[GenAiAttr.USAGE_INPUT_TOKENS]: 30,
					[GenAiAttr.USAGE_OUTPUT_TOKENS]: 12,
					[GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS]: 5,
					[GenAiAttr.USAGE_CACHE_CREATION_INPUT_TOKENS]: 4,
					[GenAiAttr.USAGE_REASONING_OUTPUT_TOKENS]: 6,
				}),
			},
			toolInvocations: 2,
			rounds: [
				{ response: 'first try', toolCalls: [{ id: 'tool-call-1', name: ToolName.ApplyPatch }] },
				{ response: 'second try', toolCalls: [{ id: 'tool-call-2', name: ToolName.ApplyPatch }] },
			],
		});

		// Assert metrics individually so the test is not brittle to call ordering
		// or to harmless additions of unrelated metrics.
		expect(harness.otelService.metrics).toEqual(expect.arrayContaining([
			{
				name: 'copilot_chat.agent.invocation.duration',
				value: expect.closeTo(0.5, 2),
				attributes: { [GenAiAttr.AGENT_NAME]: 'Inline Chat' },
			},
			{
				name: 'copilot_chat.agent.turn.count',
				value: 2,
				attributes: { [GenAiAttr.AGENT_NAME]: 'Inline Chat' },
			},
		]));
	});

	test('Inline tool loop records error status when the loop fails before recovery', async () => {
		const harness = createInlineChatHarness();
		harness.mockEndpoint.makeChatRequest2.mockRejectedValueOnce(new Error('model failed'));

		try {
			const result = await harness.run();
			expect(result).toMatchObject({
				errorDetails: {
					message: 'model failed',
				}
			});
		} finally {
			harness.restore();
		}

		expect(harness.otelService.spans).toEqual([
			expect.objectContaining({
				name: 'invoke_agent Inline Chat',
				statusCode: SpanStatusCode.ERROR,
				statusMessage: 'model failed',
				ended: true,
				attributes: expect.objectContaining({
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
					['error.type']: 'Error',
				})
			})
		]);
	});

});

function createInlineChatHarness(options: InlineChatHarnessOptions = {}) {
		const otelService = new CapturingOTelService();
		const document = createTextDocumentData(URI.parse('file:///test.ts'), 'test content', 'typescript').document;
		const availableTool = {
			name: ToolName.ApplyPatch,
			description: 'Apply a patch',
			inputSchema: {}
		} as vscode.LanguageModelToolInformation;

		const mockLogService = {
			warn: vi.fn(),
			error: vi.fn(),
			trace: vi.fn()
		} as unknown as ILogService;

		const telemetry = {
			telemetryMessageId: 'test-msg-id',
			sessionId: 'someId',
			editCount: 0,
			markEmittedEdits: vi.fn(),
			markReceivedToken: vi.fn(),
			sendTelemetry: vi.fn(),
			sendToolCallingTelemetry: vi.fn()
		};
		let toolResultIndex = 0;

		const mockToolsService = {
			getTool: vi.fn((name: string) => name === ToolName.ApplyPatch ? availableTool : undefined),
			invokeTool: vi.fn(),
			validateToolInput: vi.fn().mockReturnValue({ inputObj: {} }),
			getCopilotTool: vi.fn(),
			invokeToolWithEndpoint: vi.fn().mockImplementation(async () => {
				const result = options.toolResults?.[toolResultIndex++] ?? { hasError: false };
				if (!result.hasError && options.markEditOnSuccessfulTool) {
					telemetry.editCount = 1;
				}
				return result;
			})
		} as unknown as IToolsService;

		const mockInstantiationService = {
			createInstance: vi.fn((ctor: new (...args: unknown[]) => unknown, ...args: unknown[]) => {
				if (ctor.name === 'InlineChatProgressMessages') {
					return {
						getContextualMessage: vi.fn().mockResolvedValue('mock message')
					};
				}
				if (ctor.name === 'InlineChatToolCalling') {
					return new ctor(
						args[0],
						mockInstantiationService,
						mockLogService,
						mockToolsService,
						{ getExperimentBasedConfig: vi.fn() } as unknown as IConfigurationService,
						{} as IExperimentationService,
						otelService as IOTelService,
					);
				}
				// Fail loudly when an unexpected class is instantiated so that
				// renames or new collaborators surface as a clear test failure
				// rather than silently returning an empty stub.
				throw new Error(`Unhandled createInstance for ${ctor.name}. Update the inline chat test harness.`);
			}),
			invokeFunction: vi.fn().mockResolvedValue([availableTool])
		} as unknown as IInstantiationService;

		const responses = options.responses ?? [{
			value: 'mocked success!',
			requestId: 'request-1',
			modelCallId: 'model-call-1',
			resolvedModel: 'gpt-4o-2024-08-06',
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5
			}
		}];
		let responseIndex = 0;

		const mockEndpoint = {
			supportsToolCalls: true,
			model: 'gpt-4o',
			acquireTokenizer: vi.fn().mockReturnValue({
				countToolTokens: vi.fn().mockResolvedValue(7)
			}),
			makeChatRequest2: vi.fn().mockImplementation(async (requestOptions: { finishedCb?: (text: string, index: number, delta: { copilotToolCalls?: readonly TestToolCall[] }) => Promise<undefined> }) => {
				const response = responses[responseIndex++];
				if (!response) {
					throw new Error('No mock response configured');
				}
				if (response.advanceTimeMs !== undefined) {
					options.advanceTime?.(response.advanceTimeMs);
				}
				if (response.toolCalls) {
					await requestOptions.finishedCb?.('', 0, { copilotToolCalls: response.toolCalls });
				}
				return {
					type: ChatFetchResponseType.Success,
					value: response.value,
					requestId: response.requestId ?? `request-${responseIndex}`,
					modelCallId: response.modelCallId,
					resolvedModel: response.resolvedModel ?? 'gpt-4o-2024-08-06',
					usage: response.usage,
				};
			})
		};

		const mockEndpointProvider = {
			getChatEndpoint: vi.fn().mockResolvedValue(mockEndpoint)
		} as unknown as IEndpointProvider;

		const mockAuthService = {
			getCopilotToken: vi.fn()
		} as unknown as IAuthenticationService;

		const mockIgnoreService = {
			isCopilotIgnored: vi.fn().mockResolvedValue(false)
		} as unknown as IIgnoreService;

		const mockEditTracker = {
			collectAIEdits: vi.fn()
		};
		const mockEditSurvivalTrackerService = {
			initialize: vi.fn().mockReturnValue(mockEditTracker)
		} as unknown as IEditSurvivalTrackerService;

		const mockOctoKitService = {
			getGitHubOutageStatus: vi.fn()
		} as unknown as IOctoKitService;

		const renderSpy = vi.spyOn(PromptRenderer, 'create').mockReturnValue({
			render: vi.fn().mockResolvedValue({
				messages: [],
				tokenCount: 3,
				references: []
			})
		} as unknown as PromptRenderer<BasePromptElementProps>);

		const intent = new InlineChatIntent(
			mockInstantiationService,
			mockEndpointProvider,
			mockAuthService,
			mockLogService,
			mockIgnoreService,
			mockEditSurvivalTrackerService,
			mockOctoKitService
		);

		const mockTurn = {
			setMetadata: vi.fn()
		};
		const conversation = new Conversation('someId', [mockTurn as unknown as Turn]);
		const request = {
			prompt: 'test prompt',
			location2: new ChatRequestEditorData({} as vscode.TextEditor, document, { isEmpty: true } as vscode.Selection, {} as vscode.Range),
			toolInvocationToken: {} as vscode.ChatParticipantToolToken,
			references: [],
			tools: new Map()
		} as unknown as vscode.ChatRequest;

		const stream = {
			progress: vi.fn(),
			text: vi.fn()
		} as unknown as vscode.ChatResponseStream;

		const documentContext = { document: TextDocumentSnapshot.create(document) } as IDocumentContext;
		const chatTelemetry = {
			makeRequest: vi.fn().mockReturnValue(telemetry)
		} as unknown as ChatTelemetryBuilder;

		return {
			otelService,
			telemetry,
			mockEndpoint,
			mockToolsService,
			run: () => intent.handleRequest(conversation, request, stream, CancellationToken.None, documentContext, 'agent', ChatLocation.Editor, chatTelemetry),
			restore: () => renderSpy.mockRestore(),
		};
}
