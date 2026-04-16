/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import * as l10n from '@vscode/l10n';
import { OpenAI, Raw } from '@vscode/prompt-tsx';
import type { CancellationToken } from 'vscode';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { deepClone, mixin } from '../../../util/vs/base/common/objects';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IChatMLFetcher, Source } from '../../chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../chat/common/commonTypes';
import { getTextPart } from '../../chat/common/globalStringUtils';
import { CHAT_MODEL, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { isAnthropicContextEditingEnabled } from '../../networking/common/anthropic';
import { FinishedCallback, getRequestId, ICopilotToolCall, OptionalChatRequestParams } from '../../networking/common/fetch';
import { IFetcherService, Response } from '../../networking/common/fetcherService';
import { createCapiRequestBody, IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../networking/common/networking';
import { CAPIChatMessage, ChatCompletion, FinishedCompletionReason, RawMessageConversionCallback } from '../../networking/common/openai';
import { prepareChatCompletionForReturn } from '../../networking/node/chatStream';
import { IChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { SSEProcessor } from '../../networking/node/stream';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService, TelemetryProperties } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { ICAPIClientService } from '../common/capiClient';
import { isGeminiFamily, modelSupportsContextEditing, modelSupportsToolSearch } from '../common/chatModelCapabilities';
import { IDomainService } from '../common/domainService';
import { CustomModel, IChatModelInformation, ModelSupportedEndpoint } from '../common/endpointProvider';
import { createMessagesRequestBody, processResponseFromMessagesEndpoint } from './messagesApi';
import { createResponsesRequestBody, getResponsesApiCompactionThreshold, processResponseFromChatEndpoint } from './responsesApi';

/**
 * The default processor for the stream format from CAPI
 */
export async function defaultChatResponseProcessor(
	telemetryService: ITelemetryService,
	logService: ILogService,
	response: Response,
	expectedNumChoices: number,
	finishCallback: FinishedCallback,
	telemetryData: TelemetryData,
	cancellationToken?: CancellationToken | undefined
) {
	const processor = await SSEProcessor.create(logService, telemetryService, expectedNumChoices, response, cancellationToken);
	const finishedCompletions = processor.processSSE(finishCallback);
	const chatCompletions = AsyncIterableObject.map(finishedCompletions, (solution) => {
		const loggedReason = solution.reason ?? 'client-trimmed';
		const dataToSendToTelemetry = telemetryData.extendedBy({
			completionChoiceFinishReason: loggedReason,
			headerRequestId: solution.requestId.headerRequestId
		});
		telemetryService.sendGHTelemetryEvent('completion.finishReason', dataToSendToTelemetry.properties, dataToSendToTelemetry.measurements);
		return prepareChatCompletionForReturn(telemetryService, logService, solution, telemetryData);
	});
	return chatCompletions;
}

export async function defaultNonStreamChatResponseProcessor(response: Response, finishCallback: FinishedCallback, telemetryData: TelemetryData) {
	const textResponse = await response.text();
	const jsonResponse = JSON.parse(textResponse);
	const completions: ChatCompletion[] = [];
	for (let i = 0; i < (jsonResponse?.choices?.length || 0); i++) {
		const choice = jsonResponse.choices[i];
		const message: Raw.AssistantChatMessage = {
			role: choice.message.role,
			content: choice.message.content,
			name: choice.message.name,
			// Normalize property name: OpenAI API uses snake_case (tool_calls) but our types expect camelCase (toolCalls)
			// See: https://platform.openai.com/docs/api-reference/chat/object#chat-object-choices-message-tool_calls
			toolCalls: choice.message.toolCalls ?? choice.message.tool_calls,
		};
		const messageText = getTextPart(message.content);
		const requestId = response.headers.get('X-Request-ID') ?? generateUuid();
		const ghRequestId = response.headers.get('x-github-request-id') ?? '';
		const { serverExperiments } = getRequestId(response.headers);


		const completion: ChatCompletion = {
			blockFinished: false,
			choiceIndex: i,
			model: jsonResponse.model,
			filterReason: undefined,
			finishReason: choice.finish_reason as FinishedCompletionReason,
			message: message,
			usage: jsonResponse.usage,
			tokens: [], // This is used for repetition detection so not super important to be accurate
			requestId: { headerRequestId: requestId, gitHubRequestId: ghRequestId, completionId: jsonResponse.id, created: jsonResponse.created, deploymentId: '', serverExperiments },
			telemetryData: telemetryData
		};
		const functionCall: ICopilotToolCall[] = [];
		for (const tool of message.toolCalls ?? []) {
			functionCall.push({
				name: tool.function?.name ?? '',
				arguments: tool.function?.arguments ?? '',
				id: tool.id ?? '',
			});
		}
		await finishCallback(messageText, i, {
			text: messageText,
			copilotToolCalls: functionCall,
		});
		completions.push(completion);
	}

	return AsyncIterableObject.fromArray(completions);
}

export class ChatEndpoint implements IChatEndpoint {
	private readonly _maxTokens: number;
	private readonly _maxOutputTokens: number;
	public readonly model: string;
	public readonly name: string;
	public readonly version: string;
	public readonly modelProvider: string;
	public readonly family: string;
	public readonly tokenizer: TokenizerType;
	public readonly showInModelPicker: boolean;
	public readonly isFallback: boolean;
	public readonly supportsToolCalls: boolean;
	public readonly supportsVision: boolean;
	public readonly supportsPrediction: boolean;
	public readonly supportsAdaptiveThinking?: boolean;
	public readonly minThinkingBudget?: number;
	public readonly maxThinkingBudget?: number;
	public readonly supportsReasoningEffort?: string[];
	public readonly supportsToolSearch?: boolean;
	public readonly supportsContextEditing?: boolean;
	public readonly isPremium?: boolean | undefined;
	public readonly multiplier?: number | undefined;
	public readonly restrictedToSkus?: string[] | undefined;
	public readonly customModel?: CustomModel | undefined;
	public readonly maxPromptImages?: number | undefined;

	private readonly _supportsStreaming: boolean;

	constructor(
		public readonly modelMetadata: IChatModelInformation,
		@IDomainService protected readonly _domainService: IDomainService,
		@IChatMLFetcher private readonly _chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider private readonly _tokenizerProvider: ITokenizerProvider,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IChatWebSocketManager private readonly _chatWebSocketService: IChatWebSocketManager,
		@ILogService _logService: ILogService,
	) {
		// This metadata should always be present, but if not we will default to 8192 tokens
		this._maxTokens = modelMetadata.capabilities.limits?.max_prompt_tokens ?? 8192;
		// This metadata should always be present, but if not we will default to 4096 tokens
		this._maxOutputTokens = modelMetadata.capabilities.limits?.max_output_tokens ?? 4096;
		this.model = modelMetadata.id;
		this.modelProvider = modelMetadata.vendor;
		this.name = modelMetadata.name;
		this.version = modelMetadata.version;
		this.family = modelMetadata.capabilities.family;
		this.tokenizer = modelMetadata.capabilities.tokenizer;
		this.showInModelPicker = modelMetadata.model_picker_enabled;
		this.isPremium = modelMetadata.billing?.is_premium;
		this.multiplier = modelMetadata.billing?.multiplier;
		this.restrictedToSkus = modelMetadata.billing?.restricted_to;
		this.isFallback = modelMetadata.is_chat_fallback;
		this.supportsToolCalls = !!modelMetadata.capabilities.supports.tool_calls;
		this.supportsVision = !!modelMetadata.capabilities.supports.vision;
		this.supportsPrediction = !!modelMetadata.capabilities.supports.prediction;
		this.supportsAdaptiveThinking = modelMetadata.capabilities.supports.adaptive_thinking;
		this.minThinkingBudget = modelMetadata.capabilities.supports.min_thinking_budget;
		this.maxThinkingBudget = modelMetadata.capabilities.supports.max_thinking_budget;
		this.supportsReasoningEffort = modelMetadata.capabilities.supports.reasoning_effort;
		this.supportsToolSearch = modelMetadata.capabilities.supports.tool_search ?? modelSupportsToolSearch(this.model);
		this.supportsContextEditing = modelMetadata.capabilities.supports.context_editing ?? modelSupportsContextEditing(this.model);
		this._supportsStreaming = !!modelMetadata.capabilities.supports.streaming;
		this.customModel = modelMetadata.custom_model;
		this.maxPromptImages = modelMetadata.capabilities.limits?.vision?.max_prompt_images;
	}

	// TODO: Thread enableThinking through the fetch pipeline (INetworkRequestOptions / chatMLFetcher positional params)
	// so getExtraHeaders can gate the interleaved-thinking header on whether thinking is actually enabled for the
	// request, rather than using the location check. Once plumbed, replace isAllowedConversationAgentModel with
	// an enableThinking check for the thinking header (keep location gate for context management / tool search).
	public getExtraHeaders(_location?: ChatLocation): Record<string, string> {
		const headers: Record<string, string> = { ...this.modelMetadata.requestHeaders };

		if (this.useMessagesApi) {

			const modelProviderPreference = this._configurationService.getConfig(ConfigKey.TeamInternal.ModelProviderPreference);
			if (modelProviderPreference) {
				headers['X-Model-Provider-Preference'] = modelProviderPreference;
			}

			const betas: string[] = [];

			if (!this.supportsAdaptiveThinking) {
				betas.push('interleaved-thinking-2025-05-14');
			}
			if (this.supportsToolSearch) {
				betas.push('advanced-tool-use-2025-11-20');
			}
			if (isAnthropicContextEditingEnabled(this, this._configurationService, this._expService)) {
				betas.push('context-management-2025-06-27');
			}
			if (betas.length > 0) {
				headers['anthropic-beta'] = betas.join(',');
			}
		}

		return headers;
	}

	public get modelMaxPromptTokens(): number {
		return this._maxTokens;
	}

	public get maxOutputTokens(): number {
		return this._maxOutputTokens;
	}

	public get urlOrRequestMetadata(): string | RequestMetadata {
		// Use override or respect setting.
		// TODO unlikely but would break if it changes in the middle of a request being constructed
		return this.modelMetadata.urlOrRequestMetadata ??
			(this.useResponsesApi ? { type: RequestType.ChatResponses } :
				this.useMessagesApi ? { type: RequestType.ChatMessages } : { type: RequestType.ChatCompletions });
	}

	protected get useResponsesApi(): boolean {
		if (this.modelMetadata.supported_endpoints
			&& !this.modelMetadata.supported_endpoints.includes(ModelSupportedEndpoint.ChatCompletions)
			&& this.modelMetadata.supported_endpoints.includes(ModelSupportedEndpoint.Responses)
		) {
			return true;
		}

		return !!this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.Responses);
	}

	protected get useWebSocketResponsesApi(): boolean {
		return !!this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.WebSocketResponses);
	}

	protected get useMessagesApi(): boolean {
		const enableMessagesApi = this._configurationService.getExperimentBasedConfig(ConfigKey.UseAnthropicMessagesApi, this._expService);
		return !!(enableMessagesApi && this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.Messages));
	}

	public get degradationReason(): string | undefined {
		return this.modelMetadata.warning_messages?.at(0)?.message ?? this.modelMetadata.info_messages?.at(0)?.message;
	}

	public get apiType(): string {
		return this.useResponsesApi ? 'responses' :
			this.useMessagesApi ? 'messages' : 'chatCompletions';
	}

	interceptBody(body: IEndpointBody | undefined): void {
		// Remove tool calls from requests that don't support them
		// We really shouldn't make requests to models that don't support tool calls with tools though
		if (body && !this.supportsToolCalls) {
			delete body['tools'];
		}

		// If the model doesn't support streaming, don't ask for a streamed request
		if (body && !this._supportsStreaming) {
			body.stream = false;
		}

		// If it's o1 we must modify the body significantly as the request is very different
		if (body?.messages && (this.family.startsWith('o1') || this.model === CHAT_MODEL.O1 || this.model === CHAT_MODEL.O1MINI)) {
			const newMessages: CAPIChatMessage[] = body.messages.map((message: CAPIChatMessage): CAPIChatMessage => {
				if (message.role === OpenAI.ChatRole.System) {
					return {
						role: OpenAI.ChatRole.User,
						content: message.content,
					};
				} else {
					return message;
				}
			});
			// Add the messages & model back
			body['messages'] = newMessages;
		}
	}

	createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		// Validate image count if endpoint has max_prompt_images limit (Gemini only for now)
		if (isGeminiFamily(this) && this.maxPromptImages !== undefined) {
			const imageCount = this.countImages(options.messages, this.maxPromptImages);
			if (imageCount > this.maxPromptImages) {
				const errorMsg = l10n.t('Too many images in request: {0} images provided, but the model supports a maximum of {1} images.', imageCount, this.maxPromptImages);
				throw new Error(errorMsg);
			}
		}

		if (this.useResponsesApi) {
			const body = this._instantiationService.invokeFunction(createResponsesRequestBody, options, this.model, this);
			return this.customizeResponsesBody(body);
		} else if (this.useMessagesApi) {
			const body = this._instantiationService.invokeFunction(createMessagesRequestBody, options, this.model, this);
			return this.customizeMessagesBody(body);
		} else {
			const body = createCapiRequestBody(options, this.model, this.getCompletionsCallback());
			return this.customizeCapiBody(body, options);
		}
	}

	private countImages(messages: Raw.ChatMessage[], maxAllowed?: number): number {
		let imageCount = 0;
		for (const message of messages) {
			if (Array.isArray(message.content)) {
				for (const part of message.content) {
					if (part.type === Raw.ChatCompletionContentPartKind.Image) {
						imageCount++;
						// Early exit if we've already exceeded the limit
						if (maxAllowed !== undefined && imageCount > maxAllowed) {
							return imageCount;
						}
					}
				}
			}
		}
		return imageCount;
	}

	protected getCompletionsCallback(): RawMessageConversionCallback | undefined {
		return undefined;
	}

	protected customizeMessagesBody(body: IEndpointBody): IEndpointBody {
		return body;
	}

	protected customizeResponsesBody(body: IEndpointBody): IEndpointBody {
		return body;
	}

	protected customizeCapiBody(body: IEndpointBody, options: ICreateEndpointBodyOptions): IEndpointBody {

		// Apply Gemini function calling mode if configured
		const hasTools = !!options.requestOptions?.tools?.length;
		if (hasTools && this.family.toLowerCase().includes('gemini-3')) {
			const geminiFunctionCallingMode = this._configurationService.getExperimentBasedConfig(
				ConfigKey.TeamInternal.GeminiFunctionCallingMode,
				this._expService
			);
			// Only override tool_choice if experiment provides a value and user hasn't specified a function call
			if (geminiFunctionCallingMode && typeof body.tool_choice !== 'object') {
				body.tool_choice = geminiFunctionCallingMode;
			}
		}

		return body;
	}

	public async processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken | undefined
	): Promise<AsyncIterableObject<ChatCompletion>> {
		if (this.useResponsesApi) {
			const compactionThreshold = getResponsesApiCompactionThreshold(this._configurationService, this._expService, this);
			return processResponseFromChatEndpoint(this._instantiationService, telemetryService, logService, response, expectedNumChoices, finishCallback, telemetryData, compactionThreshold);
		} else if (this.useMessagesApi) {
			return processResponseFromMessagesEndpoint(this._instantiationService, telemetryService, logService, response, finishCallback, telemetryData);
		} else if (!this._supportsStreaming) {
			return defaultNonStreamChatResponseProcessor(response, finishCallback, telemetryData);
		} else {
			return defaultChatResponseProcessor(telemetryService, logService, response, expectedNumChoices, finishCallback, telemetryData, cancellationToken);
		}
	}

	public acquireTokenizer(): ITokenizer {
		return this._tokenizerProvider.acquireTokenizer(this);
	}

	public async makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		const useWebSocket = options.useWebSocket ?? !!(
			options.turnId
			&& options.conversationId
			&& this.useWebSocketResponsesApi
			&& this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.ResponsesApiWebSocketEnabled, this._expService)
		);
		const ignoreStatefulMarker = options.ignoreStatefulMarker ?? !(
			useWebSocket
			&& options.conversationId
			&& options.turnId
			&& this._chatWebSocketService.hasActiveConnection(options.conversationId)
		);
		const response = await this._makeChatRequest2({
			...options,
			useWebSocket,
			ignoreStatefulMarker,
		}, token);
		if (response.type === ChatFetchResponseType.InvalidStatefulMarker) {
			return this._makeChatRequest2({
				...options,
				useWebSocket,
				ignoreStatefulMarker: true
			}, token);
		}
		return response;
	}

	protected async _makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken) {
		return this._chatMLFetcher.fetchOne({
			requestOptions: {},
			...options,
			endpoint: this,
		}, token);
	}

	public async makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: Source,
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean,
		telemetryProperties?: TelemetryProperties,
	): Promise<ChatResponse> {
		return this.makeChatRequest2({
			debugName,
			messages,
			finishedCb,
			location,
			source,
			requestOptions,
			userInitiatedRequest,
			telemetryProperties,
		}, token);
	}

	public cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		return this._instantiationService.createInstance(
			ChatEndpoint,
			mixin(deepClone(this.modelMetadata), { capabilities: { limits: { max_prompt_tokens: modelMaxPromptTokens } } }));
	}
}

export class RemoteAgentChatEndpoint extends ChatEndpoint {
	constructor(
		modelMetadata: IChatModelInformation,
		private readonly _requestMetadata: RequestMetadata,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAuthenticationService authService: IAuthenticationService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
		@IExperimentationService experimentService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService
	) {
		super(
			modelMetadata,
			domainService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configService,
			experimentService,
			chatWebSocketService,
			logService
		);
	}

	override processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken | undefined,
		_location?: ChatLocation,
	): Promise<AsyncIterableObject<ChatCompletion>> {
		// We must override this to a num choices > 1 because remote agents can do internal function calls which emit multiple completions even when N > 1
		// It's awful that they do this, but we have to support it
		return defaultChatResponseProcessor(telemetryService, logService, response, 2, finishCallback, telemetryData, cancellationToken);
	}

	public override get urlOrRequestMetadata() {
		return this._requestMetadata;
	}
}
