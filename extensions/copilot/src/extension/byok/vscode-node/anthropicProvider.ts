/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { CancellationToken, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelDataPart, LanguageModelResponsePart2, LanguageModelTextPart, LanguageModelThinkingPart, LanguageModelToolCallPart, LanguageModelToolResultPart, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { CustomDataPartMimeTypes } from '../../../platform/endpoint/common/endpointTypes';
import { modelSupportsToolSearch } from '../../../platform/endpoint/common/chatModelCapabilities';
import { buildToolInputSchema } from '../../../platform/endpoint/node/messagesApi';
import { ILogService } from '../../../platform/log/common/logService';
import { ContextManagementResponse, CUSTOM_TOOL_SEARCH_NAME, getContextManagementFromConfig, isAnthropicContextEditingEnabled, isAnthropicMemoryToolEnabled } from '../../../platform/networking/common/anthropic';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { IResponseDelta, OpenAiFunctionTool } from '../../../platform/networking/common/fetch';
import { APIUsage } from '../../../platform/networking/common/openai';
import { CopilotChatAttr, emitInferenceDetailsEvent, GenAiAttr, GenAiMetrics, GenAiOperationName, type OTelModelOptions, StdAttr, truncateForOTel } from '../../../platform/otel/common/index';
import { IOTelService, SpanKind, SpanStatusCode } from '../../../platform/otel/common/otelService';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { retrieveCapturingTokenByCorrelation, runWithCapturingToken } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { toErrorMessage } from '../../../util/common/errorMessage';
import { RecordedProgress } from '../../../util/common/progressRecorder';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { anthropicMessagesToRawMessagesForLogging, apiMessageToAnthropicMessage } from '../common/anthropicMessageConverter';
import { BYOKKnownModels, BYOKModelCapabilities, LMResponsePart } from '../common/byokProvider';
import { AbstractLanguageModelChatProvider, ExtendedLanguageModelChatInformation, LanguageModelChatConfiguration } from './abstractLanguageModelChatProvider';
import { byokKnownModelsToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

export class AnthropicLMProvider extends AbstractLanguageModelChatProvider {

	public static readonly providerName = 'Anthropic';

	constructor(
		knownModels: BYOKKnownModels | undefined,
		byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IOTelService private readonly _otelService: IOTelService,
		@IToolDeferralService private readonly _toolDeferralService: IToolDeferralService,
	) {
		super(AnthropicLMProvider.providerName.toLowerCase(), AnthropicLMProvider.providerName, knownModels, byokStorageService, logService);

	}

	private _getThinkingBudget(modelId: string, maxOutputTokens: number): number | undefined {
		const modelCapabilities = this._knownModels?.[modelId];
		const modelSupportsThinking = modelCapabilities?.thinking ?? false;
		if (!modelSupportsThinking) {
			return undefined;
		}
		return Math.min(32000, maxOutputTokens - 1, 16000);
	}

	// Filters the byok known models based on what the anthropic API knows as well
	protected async getAllModels(silent: boolean, apiKey: string | undefined): Promise<ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration>[]> {
		if (!apiKey && silent) {
			return [];
		}

		try {
			const response = await new Anthropic({ apiKey }).models.list();
			const modelList: Record<string, BYOKModelCapabilities> = {};
			for (const model of response.data) {
				if (this._knownModels && this._knownModels[model.id]) {
					modelList[model.id] = this._knownModels[model.id];
				} else {
					// Mix in generic capabilities for models we don't know
					modelList[model.id] = {
						maxInputTokens: 100000,
						maxOutputTokens: 16000,
						name: model.display_name,
						toolCalling: true,
						vision: false,
						thinking: false
					};
				}
			}
			return byokKnownModelsToAPIInfoWithEffort(this._name, modelList);
		} catch (error) {
			this._logService.error(error, `Error fetching available ${AnthropicLMProvider.providerName} models`);
			throw new Error(error.message ? error.message : error);
		}
	}

	async provideLanguageModelChatResponse(model: ExtendedLanguageModelChatInformation<LanguageModelChatConfiguration>, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<void> {
		// Restore CapturingToken context if correlation ID was passed through modelOptions.
		// This handles the case where AsyncLocalStorage context was lost crossing VS Code IPC.
		const correlationId = (options as { modelOptions?: OTelModelOptions }).modelOptions?._capturingTokenCorrelationId;
		const capturingToken = correlationId ? retrieveCapturingTokenByCorrelation(correlationId) : undefined;

		// Restore OTel trace context to link spans back to the agent trace
		const parentTraceContext = (options as { modelOptions?: OTelModelOptions }).modelOptions?._otelTraceContext ?? undefined;

		// OTel span handle — created outside doRequest, enriched inside with usage data
		let otelSpan: ReturnType<typeof this._otelService.startSpan> | undefined;

		const doRequest = async () => {
			const issuedTime = Date.now();
			const apiKey = model.configuration?.apiKey;
			if (!apiKey) {
				throw new Error('API key not found for the model');
			}

			const anthropicClient = new Anthropic({ apiKey });

			// Convert the messages from the API format into messages that we can use against anthropic
			const { system, messages: convertedMessages } = apiMessageToAnthropicMessage(messages as LanguageModelChatMessage[]);

			const requestId = generateUuid();
			const pendingLoggedChatRequest = this._requestLogger.logChatRequest(
				'AnthropicBYOK',
				{
					model: model.id,
					modelMaxPromptTokens: model.maxInputTokens,
					urlOrRequestMetadata: anthropicClient.baseURL,
				},
				{
					model: model.id,
					messages: anthropicMessagesToRawMessagesForLogging(convertedMessages, system),
					ourRequestId: requestId,
					location: ChatLocation.Other,
					body: {
						tools: options.tools?.map((tool): OpenAiFunctionTool => ({
							type: 'function',
							function: {
								name: tool.name,
								description: tool.description,
								parameters: tool.inputSchema
							}
						}))
					},
				});

			const memoryToolEnabled = isAnthropicMemoryToolEnabled(model.id, this._configurationService, this._experimentationService);

			// Requires the client-side tool_search tool in the request: without it, defer-loaded tools can't be retrieved.
			// If the user disables tool_search in the tool picker, it won't be present here and tool search is skipped.
			const toolSearchEnabled = modelSupportsToolSearch(model.id)
				&& !!options.tools?.some(t => t.name === CUSTOM_TOOL_SEARCH_NAME);

			// Build tools array, handling both standard tools and native Anthropic tools
			const tools: Anthropic.Beta.BetaToolUnion[] = [];

			let hasMemoryTool = false;
			for (const tool of (options.tools ?? [])) {
				// Handle native Anthropic memory tool (only for models that support it)
				if (tool.name === 'memory' && memoryToolEnabled) {

					hasMemoryTool = true;
					tools.push({
						name: 'memory',
						type: 'memory_20250818'
					} as Anthropic.Beta.BetaMemoryTool20250818);
					continue;
				}

				// Mark tools for deferred loading when tool search is enabled, except for frequently used tools
				const shouldDefer = toolSearchEnabled ? !this._toolDeferralService.isNonDeferredTool(tool.name) : undefined;

				if (!tool.inputSchema) {
					tools.push({
						name: tool.name,
						description: tool.description,
						input_schema: {
							type: 'object',
							properties: {},
							required: []
						},
						...(shouldDefer ? { defer_loading: shouldDefer } : {})
					});
					continue;
				}

				tools.push({
					name: tool.name,
					description: tool.description,
					input_schema: buildToolInputSchema(tool.inputSchema as Record<string, unknown>),
					...(shouldDefer ? { defer_loading: shouldDefer } : {})
				});
			}

			// Check if web search is enabled and append web_search tool if not already present.
			// We need to do this because there is no local web_search tool definition we can replace.
			const webSearchEnabled = this._configurationService.getExperimentBasedConfig(ConfigKey.AnthropicWebSearchToolEnabled, this._experimentationService);
			if (webSearchEnabled && !tools.some(tool => 'name' in tool && tool.name === 'web_search')) {
				const maxUses = this._configurationService.getConfig(ConfigKey.AnthropicWebSearchMaxUses);
				const allowedDomains = this._configurationService.getConfig(ConfigKey.AnthropicWebSearchAllowedDomains);
				const blockedDomains = this._configurationService.getConfig(ConfigKey.AnthropicWebSearchBlockedDomains);
				const userLocation = this._configurationService.getConfig(ConfigKey.AnthropicWebSearchUserLocation);
				const shouldDeferWebSearch = toolSearchEnabled ? !this._toolDeferralService.isNonDeferredTool('web_search') : undefined;

				const webSearchTool: Anthropic.Beta.BetaWebSearchTool20250305 = {
					name: 'web_search',
					type: 'web_search_20250305',
					max_uses: maxUses,
					...(shouldDeferWebSearch ? { defer_loading: shouldDeferWebSearch } : {})
				};

				// Add domain filtering if configured
				// Cannot use both allowed and blocked domains simultaneously
				if (allowedDomains && allowedDomains.length > 0) {
					webSearchTool.allowed_domains = allowedDomains;
				} else if (blockedDomains && blockedDomains.length > 0) {
					webSearchTool.blocked_domains = blockedDomains;
				}

				// Add user location if configured
				// Note: All fields are optional according to Anthropic docs
				if (userLocation && (userLocation.city || userLocation.region || userLocation.country || userLocation.timezone)) {
					webSearchTool.user_location = {
						type: 'approximate',
						...userLocation
					};
				}

				tools.push(webSearchTool);
			}

			const thinkingBudget = this._getThinkingBudget(model.id, model.maxOutputTokens);

			// Check if model supports adaptive thinking
			const modelCapabilities = this._knownModels?.[model.id];
			const supportsAdaptiveThinking = modelCapabilities?.adaptiveThinking ?? false;

			// Build context management configuration
			const thinkingEnabled = supportsAdaptiveThinking || (thinkingBudget ?? 0) > 0;
			const contextManagement = isAnthropicContextEditingEnabled(model.id, this._configurationService, this._experimentationService) ? getContextManagementFromConfig(
				this._configurationService,
				this._experimentationService,
				thinkingEnabled
			) : undefined;

			// Build betas array for beta API features (adaptive thinking doesn't need interleaved-thinking beta)
			const betas: string[] = [];
			if (thinkingBudget && !supportsAdaptiveThinking) {
				betas.push('interleaved-thinking-2025-05-14');
			}
			if (hasMemoryTool || contextManagement) {
				betas.push('context-management-2025-06-27');
			}
			if (toolSearchEnabled) {
				betas.push('advanced-tool-use-2025-11-20');
			}

			const rawEffort = options.modelConfiguration?.reasoningEffort;
			const supportsEffort = modelCapabilities?.supportsReasoningEffort;
			const effort = supportsEffort && typeof rawEffort === 'string' && supportsEffort.includes(rawEffort)
				? rawEffort as 'low' | 'medium' | 'high' | 'max'
				: undefined;

			const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
				model: model.id,
				messages: convertedMessages,
				max_tokens: model.maxOutputTokens,
				stream: true,
				system: [system],
				tools: tools.length > 0 ? tools : undefined,
				thinking: supportsAdaptiveThinking
					? { type: 'adaptive' as const }
					: thinkingBudget ? { type: 'enabled' as const, budget_tokens: thinkingBudget } : undefined,
				...(effort ? { output_config: { effort } } : {}),
				context_management: contextManagement as Anthropic.Beta.Messages.BetaContextManagementConfig | undefined,
			};

			const wrappedProgress = new RecordedProgress(progress);

			try {
				const result = await this._makeRequest(anthropicClient, wrappedProgress, params, betas, token, issuedTime);
				if (result.ttft) {
					pendingLoggedChatRequest.markTimeToFirstToken(result.ttft);
				}
				const responseDeltas: IResponseDelta[] = wrappedProgress.items.map((i): IResponseDelta => {
					if (i instanceof LanguageModelTextPart) {
						return { text: i.value };
					} else if (i instanceof LanguageModelToolCallPart) {
						return {
							text: '',
							copilotToolCalls: [{
								name: i.name,
								arguments: JSON.stringify(i.input),
								id: i.callId
							}]
						};
					} else if (i instanceof LanguageModelToolResultPart) {
						// Handle tool results - extract text from content
						const resultText = i.content.map(c => c instanceof LanguageModelTextPart ? c.value : '').join('');
						return {
							text: `[Tool Result ${i.callId}]: ${resultText}`
						};
					} else {
						return { text: '' };
					}
				});
				// TODO: @bhavyaus - Add telemetry tracking for context editing (contextEditingApplied, contextEditingClearedTokens, contextEditingEditCount) like messagesApi.ts does
				if (result.contextManagement) {
					responseDeltas.push({
						text: '',
						contextManagement: result.contextManagement
					});
				}
				pendingLoggedChatRequest.resolve({
					type: ChatFetchResponseType.Success,
					requestId,
					serverRequestId: requestId,
					usage: result.usage,
					value: ['value'],
					resolvedModel: model.id
				}, responseDeltas);

				// Enrich OTel span with usage data from the Anthropic response
				if (otelSpan && result.usage) {
					otelSpan.setAttributes({
						[GenAiAttr.USAGE_INPUT_TOKENS]: result.usage.prompt_tokens ?? 0,
						[GenAiAttr.USAGE_OUTPUT_TOKENS]: result.usage.completion_tokens ?? 0,
						...(result.usage.prompt_tokens_details?.cached_tokens
							? { [GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS]: result.usage.prompt_tokens_details.cached_tokens }
							: {}),
						[GenAiAttr.RESPONSE_MODEL]: model.id,
						[GenAiAttr.RESPONSE_ID]: requestId,
						[GenAiAttr.RESPONSE_FINISH_REASONS]: ['stop'],
						[GenAiAttr.CONVERSATION_ID]: requestId,
						...(result.ttft ? { [CopilotChatAttr.TIME_TO_FIRST_TOKEN]: result.ttft } : {}),
						[GenAiAttr.REQUEST_MAX_TOKENS]: model.maxOutputTokens ?? 0,
					});
					// Opt-in content capture
					if (this._otelService.config.captureContent) {
						const responseText = wrappedProgress.items
							.filter((p): p is LanguageModelTextPart => p instanceof LanguageModelTextPart)
							.map(p => p.value).join('');
						const toolCalls = wrappedProgress.items
							.filter((p): p is LanguageModelToolCallPart => p instanceof LanguageModelToolCallPart)
							.map(tc => ({ type: 'tool_call' as const, id: tc.callId, name: tc.name, arguments: tc.input }));
						const parts: Array<{ type: string; content?: string; id?: string; name?: string; arguments?: unknown }> = [];
						if (responseText) { parts.push({ type: 'text', content: responseText }); }
						parts.push(...toolCalls);
						if (parts.length > 0) {
							otelSpan.setAttribute(GenAiAttr.OUTPUT_MESSAGES, truncateForOTel(JSON.stringify([{ role: 'assistant', parts }])));
						}
					}
				}

				// Record OTel metrics for this Anthropic LLM call
				if (result.usage) {
					const durationSec = (Date.now() - issuedTime) / 1000;
					const metricAttrs = { operationName: GenAiOperationName.CHAT, providerName: 'anthropic', requestModel: model.id, responseModel: model.id };
					GenAiMetrics.recordOperationDuration(this._otelService, durationSec, metricAttrs);
					if (result.usage.prompt_tokens) { GenAiMetrics.recordTokenUsage(this._otelService, result.usage.prompt_tokens, 'input', metricAttrs); }
					if (result.usage.completion_tokens) { GenAiMetrics.recordTokenUsage(this._otelService, result.usage.completion_tokens, 'output', metricAttrs); }
					if (result.ttft) { GenAiMetrics.recordTimeToFirstToken(this._otelService, model.id, result.ttft / 1000); }
				}

				// Emit OTel inference details event
				emitInferenceDetailsEvent(
					this._otelService,
					{ model: model.id, maxTokens: model.maxOutputTokens },
					result.usage ? {
						id: requestId,
						model: model.id,
						finishReasons: ['stop'],
						inputTokens: result.usage.prompt_tokens,
						outputTokens: result.usage.completion_tokens,
					} : undefined,
				);

				// Send success telemetry matching response.success format
				/* __GDPR__
					"response.success" : {
						"owner": "digitarald",
						"comment": "Report quality details for a successful service response.",
						"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason for why a response finished" },
						"filterReason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason for why a response was filtered" },
						"source": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Source of the initial request" },
						"initiatorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was initiated by a user or an agent" },
						"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selection for the response" },
						"modelInvoked": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Actual model invoked for the response" },
						"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type for the response- chat completions or responses" },
						"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Id of the current turn request" },
						"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id if available" },
						"associatedRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Another request ID that this request is associated with (eg, the originating request of a summarization request)." },
						"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort level" },
						"reasoningSummary": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning summary level" },
						"fetcher": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The fetcher used for the request" },
						"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The transport used for the request (http or websocket)" },
						"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum total token window", "isMeasurement": true },
						"clientPromptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens, locally counted", "isMeasurement": true },
						"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens, server side counted", "isMeasurement": true },
						"promptCacheTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of prompt tokens hitting cache as reported by server", "isMeasurement": true },
						"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Maximum generated tokens", "isMeasurement": true },
						"tokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of generated tokens", "isMeasurement": true },
						"reasoningTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of reasoning tokens", "isMeasurement": true },
						"acceptedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
						"rejectedPredictionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the prediction that appeared in the completion", "isMeasurement": true },
						"completionTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens in the output", "isMeasurement": true },
						"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token", "isMeasurement": true },
						"timeToFirstTokenEmitted": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to first token emitted (visible text)", "isMeasurement": true },
						"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time to complete the request", "isMeasurement": true },
						"issuedTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the request was issued", "isMeasurement": true },
						"isVisionRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request was for a vision model", "isMeasurement": true },
						"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for a BYOK model", "isMeasurement": true },
						"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request was for an Auto model", "isMeasurement": true },
						"bytesReceived": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of bytes received in the response", "isMeasurement": true },
						"retryAfterError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the original request." },
						"retryAfterErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the original request if available" },
						"connectivityTestError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error of the connectivity test." },
						"connectivityTestErrorGitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub request id of the connectivity test request if available" },
						"retryAfterFilterCategory": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the response was filtered and this is a retry attempt, this contains the original filtered content category." },
						"suspendEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system suspend event was seen during the request", "isMeasurement": true },
						"resumeEventSeen": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether a system resume event was seen during the request", "isMeasurement": true }
					}
				*/
				this._telemetryService.sendTelemetryEvent('response.success', { github: true, microsoft: true }, {
					source: 'byok.anthropic',
					model: model.id,
					requestId,
				}, {
					totalTokenMax: model.maxInputTokens ?? -1,
					tokenCountMax: model.maxOutputTokens ?? -1,
					promptTokenCount: result.usage?.prompt_tokens,
					promptCacheTokenCount: result.usage?.prompt_tokens_details?.cached_tokens,
					tokenCount: result.usage?.total_tokens,
					completionTokens: result.usage?.completion_tokens,
					timeToFirstToken: result.ttft,
					timeToFirstTokenEmitted: result.ttfte,
					timeToComplete: Date.now() - issuedTime,
					issuedTime,
					isBYOK: 1,
				});
			} catch (err) {
				this._logService.error(`BYOK Anthropic error: ${toErrorMessage(err, true)}`);
				pendingLoggedChatRequest.resolve({
					type: ChatFetchResponseType.Unknown,
					requestId,
					serverRequestId: requestId,
					reason: err.message
				}, wrappedProgress.items.map((i): IResponseDelta => {
					if (i instanceof LanguageModelTextPart) {
						return { text: i.value };
					} else if (i instanceof LanguageModelToolCallPart) {
						return {
							text: '',
							copilotToolCalls: [{
								name: i.name,
								arguments: JSON.stringify(i.input),
								id: i.callId
							}]
						};
					} else if (i instanceof LanguageModelToolResultPart) {
						// Handle tool results - extract text from content
						const resultText = i.content.map(c => c instanceof LanguageModelTextPart ? c.value : '').join('');
						return {
							text: `[Tool Result ${i.callId}]: ${resultText}`
						};
					} else {
						return { text: '' };
					}
				}));
				throw err;
			}
		};

		// Create OTel span and execute with trace context + CapturingToken
		const executeRequest = async () => {
			otelSpan = this._otelService.startSpan(`chat ${model.id}`, {
				kind: SpanKind.CLIENT,
				attributes: {
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
					[GenAiAttr.PROVIDER_NAME]: 'anthropic',
					[GenAiAttr.REQUEST_MODEL]: model.id,
					[GenAiAttr.AGENT_NAME]: 'AnthropicBYOK',
					[CopilotChatAttr.MAX_PROMPT_TOKENS]: model.maxInputTokens,
					[StdAttr.SERVER_ADDRESS]: 'api.anthropic.com',
				},
			});
			// Opt-in: capture input messages in OTel GenAI format
			if (this._otelService.config.captureContent) {
				try {
					const roleNames: Record<number, string> = { 1: 'user', 2: 'assistant', 3: 'system' };
					const inputMsgs = messages.map(m => {
						const msg = m as LanguageModelChatMessage;
						const role = roleNames[msg.role] ?? String(msg.role);
						const parts: Array<{ type: string; content?: string | unknown; id?: string; name?: string; arguments?: unknown; response?: unknown }> = [];
						if (Array.isArray(msg.content)) {
							for (const p of msg.content) {
								if (p instanceof LanguageModelTextPart) {
									parts.push({ type: 'text', content: p.value });
								} else if (p instanceof LanguageModelToolCallPart) {
									parts.push({ type: 'tool_call', id: p.callId, name: p.name, arguments: p.input });
								} else if (p instanceof LanguageModelToolResultPart) {
									const resultText = p.content.map((c: unknown) => c instanceof LanguageModelTextPart ? c.value : '').join('');
									parts.push({ type: 'tool_call_response', id: p.callId, response: resultText });
								}
							}
						}
						if (parts.length === 0) {
							parts.push({ type: 'text', content: '[non-text content]' });
						}
						return { role, parts };
					});
					otelSpan.setAttribute(GenAiAttr.INPUT_MESSAGES, truncateForOTel(JSON.stringify(inputMsgs)));
				} catch { /* swallow */ }
			}
			try {
				const result = capturingToken
					? await runWithCapturingToken(capturingToken, doRequest)
					: await doRequest();
				otelSpan.setStatus(SpanStatusCode.OK);
				return result;
			} catch (err) {
				otelSpan.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
				throw err;
			} finally {
				otelSpan.end();
			}
		};

		if (parentTraceContext) {
			return this._otelService.runWithTraceContext(parentTraceContext, executeRequest);
		}
		return executeRequest();
	}

	async provideTokenCount(model: LanguageModelChatInformation, text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Promise<number> {
		// Simple estimation - actual token count would require Claude's tokenizer
		return Math.ceil(text.toString().length / 4);
	}

	private async _makeRequest(anthropicClient: Anthropic, progress: RecordedProgress<LMResponsePart>, params: Anthropic.Beta.Messages.MessageCreateParamsStreaming, betas: string[], token: CancellationToken, issuedTime: number): Promise<{ ttft: number | undefined; ttfte: number | undefined; usage: APIUsage | undefined; contextManagement: ContextManagementResponse | undefined }> {
		const start = Date.now();
		let ttft: number | undefined;
		let ttfte: number | undefined;

		const stream = await anthropicClient.beta.messages.create({
			...params,
			...(betas.length > 0 && { betas })
		});

		let pendingToolCall: {
			toolId?: string;
			name?: string;
			jsonInput?: string;
		} | undefined;
		let pendingThinking: {
			thinking?: string;
			signature?: string;
		} | undefined;
		let pendingRedactedThinking: {
			data: string;
		} | undefined;
		let pendingServerToolCall: {
			toolId?: string;
			name?: string;
			jsonInput?: string;
			type?: string;
		} | undefined;
		let usage: APIUsage | undefined;
		let contextManagementResponse: ContextManagementResponse | undefined;

		let hasText = false;
		for await (const chunk of stream) {
			if (token.isCancellationRequested) {
				break;
			}

			if (ttft === undefined) {
				ttft = Date.now() - start;
			}
			this._logService.trace(`chunk: ${JSON.stringify(chunk)}`);

			if (chunk.type === 'content_block_start') {
				if ('content_block' in chunk && chunk.content_block.type === 'tool_use') {
					pendingToolCall = {
						toolId: chunk.content_block.id,
						name: chunk.content_block.name,
						jsonInput: ''
					};
				} else if ('content_block' in chunk && chunk.content_block.type === 'server_tool_use') {
					// Handle server-side tool use (e.g., web_search)
					pendingServerToolCall = {
						toolId: chunk.content_block.id,
						name: chunk.content_block.name,
						jsonInput: '',
						type: chunk.content_block.name
					};
					progress.report(new LanguageModelTextPart('\n'));

				} else if ('content_block' in chunk && chunk.content_block.type === 'thinking') {
					pendingThinking = {
						thinking: '',
						signature: ''
					};
				} else if ('content_block' in chunk && chunk.content_block.type === 'redacted_thinking') {
					const redactedBlock = chunk.content_block as Anthropic.Messages.RedactedThinkingBlock;
					pendingRedactedThinking = {
						data: redactedBlock.data
					};
				} else if ('content_block' in chunk && chunk.content_block.type === 'web_search_tool_result') {
					if (!pendingServerToolCall || !pendingServerToolCall.toolId) {
						continue;
					}

					const resultBlock = chunk.content_block as Anthropic.Messages.WebSearchToolResultBlock;
					// Handle potential error in web search
					if (!Array.isArray(resultBlock.content)) {
						this._logService.error(`Web search error: ${(resultBlock.content as Anthropic.Messages.WebSearchToolResultError).error_code}`);
						continue;
					}

					const results = resultBlock.content.map((result: Anthropic.Messages.WebSearchResultBlock) => ({
						type: 'web_search_result',
						url: result.url,
						title: result.title,
						page_age: result.page_age,
						encrypted_content: result.encrypted_content
					}));

					// Format according to Anthropic's web_search_tool_result specification
					const toolResult = {
						type: 'web_search_tool_result',
						tool_use_id: pendingServerToolCall.toolId,
						content: results
					};

					const searchResults = JSON.stringify(toolResult, null, 2);

					// TODO: @bhavyaus - instead of just pushing text, create a specialized WebSearchResult part
					progress.report(new LanguageModelToolResultPart(
						pendingServerToolCall.toolId!,
						[new LanguageModelTextPart(searchResults)]
					));
					pendingServerToolCall = undefined;
				}
				continue;
			}

			if (chunk.type === 'content_block_delta') {
				if (chunk.delta.type === 'text_delta') {
					progress.report(new LanguageModelTextPart(chunk.delta.text || ''));
					if (!hasText && chunk.delta.text?.length > 0) {
						ttfte = Date.now() - issuedTime;
					}
					hasText ||= chunk.delta.text?.length > 0;
				} else if (chunk.delta.type === 'citations_delta') {
					if ('citation' in chunk.delta) {
						// TODO: @bhavyaus - instead of just pushing text, create a specialized Citation part
						const citation = chunk.delta.citation as Anthropic.Messages.CitationsWebSearchResultLocation;
						if (citation.type === 'web_search_result_location') {
							// Format citation according to Anthropic specification
							const citationData = {
								type: 'web_search_result_location',
								url: citation.url,
								title: citation.title,
								encrypted_index: citation.encrypted_index,
								cited_text: citation.cited_text
							};

							// Format citation as readable blockquote with source link
							const referenceText = `\n> "${citation.cited_text}" — [${vscode.l10n.t('Source')}](${citation.url})\n\n`;

							// Report formatted reference text to user
							progress.report(new LanguageModelTextPart(referenceText));

							// Store the citation data in the correct format for multi-turn conversations
							progress.report(new LanguageModelToolResultPart(
								'citation',
								[new LanguageModelTextPart(JSON.stringify(citationData, null, 2))]
							));
						}
					}
				} else if (chunk.delta.type === 'thinking_delta') {
					if (pendingThinking) {
						pendingThinking.thinking = (pendingThinking.thinking || '') + (chunk.delta.thinking || '');
						progress.report(new LanguageModelThinkingPart(chunk.delta.thinking || ''));
					}
				} else if (chunk.delta.type === 'signature_delta') {
					// Accumulate signature
					if (pendingThinking) {
						pendingThinking.signature = (pendingThinking.signature || '') + (chunk.delta.signature || '');
					}
				} else if (chunk.delta.type === 'input_json_delta' && pendingToolCall) {
					pendingToolCall.jsonInput = (pendingToolCall.jsonInput || '') + (chunk.delta.partial_json || '');

					try {
						// Try to parse the accumulated JSON to see if it's complete
						const parsedJson = JSON.parse(pendingToolCall.jsonInput);
						progress.report(new LanguageModelToolCallPart(
							pendingToolCall.toolId!,
							pendingToolCall.name!,
							parsedJson
						));
						pendingToolCall = undefined;
					} catch {
						// JSON is not complete yet, continue accumulating
						continue;
					}
				} else if (chunk.delta.type === 'input_json_delta' && pendingServerToolCall) {
					pendingServerToolCall.jsonInput = (pendingServerToolCall.jsonInput || '') + (chunk.delta.partial_json || '');
				}
			}

			if (chunk.type === 'content_block_stop') {
				if (pendingToolCall) {
					try {
						const parsedJson = JSON.parse(pendingToolCall.jsonInput || '{}');
						progress.report(
							new LanguageModelToolCallPart(
								pendingToolCall.toolId!,
								pendingToolCall.name!,
								parsedJson
							)
						);
					} catch (e) {
						console.error('Failed to parse tool call JSON:', e);
					}
					pendingToolCall = undefined;
				} else if (pendingThinking) {
					if (pendingThinking.signature) {
						const finalThinkingPart = new LanguageModelThinkingPart('');
						finalThinkingPart.metadata = {
							signature: pendingThinking.signature,
							_completeThinking: pendingThinking.thinking
						};
						progress.report(finalThinkingPart);
					}
					pendingThinking = undefined;
				} else if (pendingRedactedThinking) {
					pendingRedactedThinking = undefined;
				}
			}

			if (chunk.type === 'message_start') {
				// TODO final output tokens: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":46}}
				usage = {
					completion_tokens: -1,
					prompt_tokens: chunk.message.usage.input_tokens + (chunk.message.usage.cache_creation_input_tokens ?? 0) + (chunk.message.usage.cache_read_input_tokens ?? 0),
					total_tokens: -1,
					// Cast needed: Anthropic returns cache_creation_input_tokens which APIUsage.prompt_tokens_details doesn't define
					prompt_tokens_details: {
						cached_tokens: chunk.message.usage.cache_read_input_tokens ?? 0,
						cache_creation_input_tokens: chunk.message.usage.cache_creation_input_tokens
					} as any
				};
			} else if (usage && chunk.type === 'message_delta') {
				if (chunk.usage.output_tokens) {
					usage.completion_tokens = chunk.usage.output_tokens;
					usage.total_tokens = usage.prompt_tokens + chunk.usage.output_tokens;
				}
				// Handle context management response
				if ('context_management' in chunk && chunk.context_management) {
					contextManagementResponse = chunk.context_management as ContextManagementResponse;
					const totalClearedTokens = contextManagementResponse.applied_edits.reduce(
						(sum, edit) => sum + (edit.cleared_input_tokens || 0),
						0
					);
					this._logService.info(`BYOK Anthropic context editing applied: cleared ${totalClearedTokens} tokens across ${contextManagementResponse.applied_edits.length} edits`);
					// Emit context management via LanguageModelDataPart so it flows through to toolCallingLoop
					progress.report(new LanguageModelDataPart(
						new TextEncoder().encode(JSON.stringify(contextManagementResponse)),
						CustomDataPartMimeTypes.ContextManagement
					));
				}
			}
		}

		return { ttft, ttfte, usage, contextManagement: contextManagementResponse };
	}
}
