/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ICreateEndpointBodyOptions, IEndpointBody } from '../../../platform/networking/common/networking';

import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKModelCapabilities, resolveBYOKThinkingOptions } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

interface OpenRouterModelData {
	id: string;
	name: string;
	supported_parameters?: string[];
	reasoning?: { supported_efforts?: string[] | null; default_effort?: string; default_enabled?: boolean; supports_max_tokens?: boolean; mandatory?: boolean };
	architecture?: {
		input_modalities?: string[];
	};
	/**
	 * The model's actual maximum context window, independent of which provider
	 * OpenRouter ranks highest. Prefer this over `top_provider.context_length`,
	 * which only reflects the primary provider and can be far smaller for
	 * multi-provider models.
	 * @see https://openrouter.ai/docs/guides/overview/models
	 */
	context_length?: number;
	top_provider: {
		context_length: number;
		/** Maximum tokens the primary provider will produce in a response. */
		max_completion_tokens?: number;
	};
}

/**
 * Fallback output-token budget used only when OpenRouter does not report
 * `top_provider.max_completion_tokens` for a model. The value is heuristic — most
 * tool-capable models do report an explicit budget, in which case this is unused.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

export class OpenRouterLMProvider extends AbstractOpenAICompatibleLMProvider {

	public static readonly providerName = 'OpenRouter';
	public static readonly providerId = this.providerName.toLowerCase();

	constructor(
		byokStorageService: IBYOKStorageService,
		@IFetcherService fetcherService: IFetcherService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService
	) {
		super(
			OpenRouterLMProvider.providerId,
			OpenRouterLMProvider.providerName,
			undefined,
			byokStorageService,
			fetcherService,
			logService,
			instantiationService,
			configurationService,
			expService
		);
	}

	protected override getModelsBaseUrl(): string | undefined {
		return 'https://openrouter.ai/api/v1';
	}

	protected override getModelsDiscoveryUrl(modelsBaseUrl: string): string {
		return `${modelsBaseUrl}/models?supported_parameters=tools`;
	}

	protected override resolveModelCapabilities(modelData: unknown): BYOKModelCapabilities | undefined {
		const openRouterModelData = modelData as OpenRouterModelData;
		const supportedParameters = openRouterModelData.supported_parameters ?? [];
		const reasoning = openRouterModelData.reasoning;
		const thinking = !!reasoning || supportedParameters.includes('reasoning') || supportedParameters.includes('reasoning_effort');
		const efforts = reasoning
			? reasoning.supported_efforts === null ? ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'] : reasoning.supported_efforts ?? []
			: thinking ? ['low', 'medium', 'high'] : undefined;
		const supportsReasoningEffort = efforts ? [...new Set(efforts)].filter(effort => !reasoning?.mandatory || effort !== 'none') : undefined;
		// Prefer the model-level `context_length` (the real capability) over
		// `top_provider.context_length`, which only reflects OpenRouter's
		// highest-ranked provider and can be much smaller for multi-provider models.
		const contextWindow = openRouterModelData.context_length ?? openRouterModelData.top_provider.context_length;
		// Reserve output tokens from the window. Clamp the reserve so a small-context
		// model (or a missing/oversized `max_completion_tokens`) never yields a
		// non-positive prompt budget.
		const requestedMaxOutputTokens = openRouterModelData.top_provider.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
		const maxOutputTokens = Math.min(requestedMaxOutputTokens, Math.floor(contextWindow / 2));
		return {
			name: openRouterModelData.name,
			toolCalling: openRouterModelData.supported_parameters ? supportedParameters.includes('tools') : this._knownModels?.[openRouterModelData.id]?.toolCalling ?? false,
			vision: openRouterModelData.architecture?.input_modalities?.includes('image') ?? this._knownModels?.[openRouterModelData.id]?.vision ?? false,
			maxInputTokens: contextWindow - maxOutputTokens,
			maxOutputTokens,
			supportsReasoningEffort,
			thinking: thinking ? true : undefined,
			defaultReasoningEffort: reasoning?.default_effort,
			supportsThinkingDisable: thinking ? !reasoning?.mandatory : undefined,
		};
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<LanguageModelChatConfiguration>): Promise<OpenAIEndpoint> {
		const modelInfo = this.getModelInfo(model.id, model.url);
		const supports = modelInfo.capabilities.supports;
		const nativeThinking = supports.adaptive_thinking === true || (Number.isFinite(supports.min_thinking_budget) && Number.isFinite(supports.max_thinking_budget) && supports.min_thinking_budget! >= 1024 && supports.max_thinking_budget! >= supports.min_thinking_budget!);
		const isAnthropic = isAnthropicModelId(model.id) && (!supports.thinking || nativeThinking);
		modelInfo.supported_endpoints = [isAnthropic ? ModelSupportedEndpoint.Messages : ModelSupportedEndpoint.ChatCompletions];

		const url = isAnthropic
			? `${model.url}/messages`
			: `${model.url}/chat/completions`;

		return this._instantiationService.createInstance(OpenRouterEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}
}

/**
 * Checks whether an OpenRouter model ID refers to an Anthropic model.
 * OpenRouter model IDs follow the format `provider/model-name`, e.g.
 * `anthropic/claude-sonnet-4` or `anthropic/claude-opus-4`.
 */
function isAnthropicModelId(modelId: string): boolean {
	return modelId.startsWith('anthropic/');
}

/**
 * OpenRouter-specific endpoint that routes Anthropic models through the native
 * Messages API (`/api/v1/messages`) for full prompt caching, thinking, and tool
 * support identical to the direct Anthropic API.
 *
 * @see https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-messages
 */
export class OpenRouterEndpoint extends OpenAIEndpoint {
	constructor(
		modelMetadata: IChatModelInformation,
		apiKey: string,
		modelUrl: string,
		@IDomainService domainService: IDomainService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService,
	) {
		super(modelMetadata, apiKey, modelUrl, domainService, chatMLFetcher, tokenizerProvider, instantiationService, configurationService, expService, chatWebSocketService, logService);
	}

	override cloneWithTokenOverride(modelMaxPromptTokens: number): OpenRouterEndpoint {
		const newModelInfo = {
			...this.modelMetadata,
			capabilities: {
				...this.modelMetadata.capabilities,
				limits: { ...this.modelMetadata.capabilities.limits, max_prompt_tokens: modelMaxPromptTokens },
			},
		};
		return this.instantiationService.createInstance(OpenRouterEndpoint, newModelInfo, this._apiKey, this._modelUrl);
	}

	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		const body = super.createRequestBody(options);
		if (!this.useMessagesApi && !this.useResponsesApi) {
			const supports = this.modelMetadata.capabilities.supports;
			const resolved = resolveBYOKThinkingOptions({ thinking: supports.thinking, adaptiveThinking: supports.adaptive_thinking, supportsReasoningEffort: supports.reasoning_effort, defaultReasoningEffort: this.modelMetadata.defaultReasoningEffort }, this.family, options.modelCapabilities ?? {}, this._configurationService.getConfig(ConfigKey.Advanced.ReasoningEffortOverride));
			if (resolveBYOKThinkingOptions({ thinking: supports.thinking, supportsReasoningEffort: supports.reasoning_effort }, this.family, {}).enableThinking) {
				body.reasoning = resolved.enableThinking ? { enabled: true, exclude: false, ...(resolved.reasoningEffort ? { effort: resolved.reasoningEffort } : {}) } : { enabled: false };
			}
			delete body.reasoning_effort;
		}
		return body;
	}

	/**
	 * Enable the Messages API path for Anthropic models. This bypasses the
	 * experiment flag check in the base class because BYOK models are always
	 * user-controlled — the `supported_endpoints` metadata is already set
	 * correctly by {@link OpenRouterLMProvider.createOpenAIEndPoint}.
	 */
	protected override get useMessagesApi(): boolean {
		return !!this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.Messages);
	}

	public override getExtraHeaders(): Record<string, string> {
		const headers = super.getExtraHeaders();
		if (this.useMessagesApi) {
			Object.assign(headers, this.getAnthropicBetaHeader());
		}
		return headers;
	}
}
