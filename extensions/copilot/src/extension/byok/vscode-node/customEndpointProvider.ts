/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { EndpointEditToolName, IChatModelInformation, IChatModelRequestOptions, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { byokKnownModelToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

export type CustomEndpointApiType = 'chat-completions' | 'responses' | 'messages';

export function resolveCustomEndpointUrl(modelId: string, url: string, apiType?: CustomEndpointApiType): string {
	// The fully resolved url was already passed in
	if (hasExplicitApiPath(url)) {
		return url;
	}

	// Remove the trailing slash
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}

	const defaultApiPath = apiTypeToPath(apiType);

	// Check if URL already contains any version pattern like /v1, /v2, etc
	const versionPattern = /\/v\d+$/;
	if (versionPattern.test(url)) {
		return `${url}${defaultApiPath}`;
	}

	// For standard OpenAI-compatible endpoints, just append the standard path
	return `${url}/v1${defaultApiPath}`;
}

function apiTypeToPath(apiType: CustomEndpointApiType | undefined): string {
	switch (apiType) {
		case 'responses': return '/responses';
		case 'messages': return '/messages';
		case 'chat-completions':
		default:
			return '/chat/completions';
	}
}

export function hasExplicitApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions') || url.includes('/messages');
}

function inferApiTypeFromUrl(url: string): CustomEndpointApiType {
	if (url.includes('/messages')) {
		return 'messages';
	}
	if (url.includes('/responses')) {
		return 'responses';
	}
	return 'chat-completions';
}

function apiTypeToSupportedEndpoints(apiType: CustomEndpointApiType): ModelSupportedEndpoint[] | undefined {
	switch (apiType) {
		case 'responses':
			return [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses];
		case 'messages':
			return [ModelSupportedEndpoint.Messages];
		case 'chat-completions':
		default:
			return undefined;
	}
}

export interface CustomEndpointModelProviderConfig extends LanguageModelChatConfiguration {
	url?: string;
	apiType?: CustomEndpointApiType;
	models?: CustomEndpointModelConfig[];
}

interface _CustomEndpointModelConfig {
	name: string;
	url: string;
	apiType?: CustomEndpointApiType;
	/** Optional when {@link contextWindow} is set; then derived as `contextWindow - maxOutputTokens`. */
	maxInputTokens?: number;
	maxOutputTokens: number;
	/** The model's full context window (input + output) in tokens, e.g. 1000000 for a 1M model. */
	contextWindow?: number;
	toolCalling: boolean;
	vision: boolean;
	thinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	requestHeaders?: Record<string, string>;
	modelOptions?: IChatModelRequestOptions;
	zeroDataRetentionEnabled?: boolean;
	supportsReasoningEffort?: string[];
	reasoningEffortFormat?: 'chat-completions' | 'responses' | 'messages';
}

export interface CustomEndpointModelConfig extends _CustomEndpointModelConfig {
	id: string;
}

export class CustomEndpointBYOKModelProvider extends AbstractOpenAICompatibleLMProvider<CustomEndpointModelProviderConfig> {

	public static readonly providerName = 'CustomEndpoint';
	public static readonly providerId = this.providerName.toLowerCase();

	constructor(
		_byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
	) {
		super(CustomEndpointBYOKModelProvider.providerId, CustomEndpointBYOKModelProvider.providerName, undefined, _byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No-op: Custom Endpoint models are configured via the JSON snippet flow, not by an API-key-only prompt.
		return;
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: CustomEndpointModelProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>[]> {
		if (configuration?.url) {
			return super.getAllModels(silent, apiKey, configuration);
		}
		const models: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>[] = [];
		if (Array.isArray(configuration?.models)) {
			for (const modelConfig of configuration.models) {
				models.push({
					...byokKnownModelToAPIInfoWithEffort(this._name, modelConfig.id, modelConfig),
					url: modelConfig.url
				});
			}
		}
		return models;
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>): Promise<OpenAIEndpoint> {
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const apiTypeOverride = modelConfiguration?.apiType ?? model.configuration?.apiType;
		const url = resolveCustomEndpointUrl(model.id, model.url, apiTypeOverride);
		const apiType: CustomEndpointApiType = apiTypeOverride ?? inferApiTypeFromUrl(url);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			contextWindow: modelConfiguration?.contextWindow,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: modelConfiguration?.thinking ?? false,
			streaming: modelConfiguration?.streaming,
			requestHeaders: modelConfiguration?.requestHeaders,
			modelOptions: modelConfiguration?.modelOptions,
			zeroDataRetentionEnabled: modelConfiguration?.zeroDataRetentionEnabled,
			supportsReasoningEffort: modelConfiguration?.supportsReasoningEffort,
			reasoningEffortFormat: modelConfiguration?.reasoningEffortFormat
		};
		const modelInfo = resolveModelInfo(model.id, this._name, undefined, modelCapabilities);
		const supportedEndpoints = apiTypeToSupportedEndpoints(apiType);
		if (supportedEndpoints) {
			modelInfo.supported_endpoints = supportedEndpoints;
		}
		return this._instantiationService.createInstance(CustomEndpointOAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}

	protected getModelsBaseUrl(configuration: CustomEndpointModelProviderConfig | undefined): string | undefined {
		return configuration?.url;
	}
}

/**
 * Custom-endpoint specific subclass that:
 * 1. Bypasses the `UseAnthropicMessagesApi` experiment flag — the user explicitly
 *    selected the Messages API for their endpoint, so we honor that unconditionally.
 * 2. Sends Anthropic-style auth (`x-api-key`) and `anthropic-version` plus beta
 *    headers when the Messages API is in use, instead of `Authorization: Bearer`.
 * 3. Lets users override the auth header via `requestHeaders` for endpoints
 *    behind APIM, gateways, vanity domains, etc. where the URL-based heuristic
 *    cannot infer the correct header. The reserved auth headers `api-key` and
 *    `authorization` are permitted through the sanitizer (only for this
 *    subclass), and the literal token `${apiKey}` in a header value is
 *    replaced with the configured API key so the secret stays in
 *    `${input:...}` secret storage. When the user supplies any well-known auth
 *    header, the default inferred auth header is suppressed to avoid sending
 *    conflicting credentials.
 */
export class CustomEndpointOAIEndpoint extends OpenAIEndpoint {
	/**
	 * Reserved auth headers that we permit users to override via `requestHeaders`
	 * for this subclass only. Other well-known auth headers like `x-api-key`,
	 * `x-goog-api-key`, `apikey`, `ocp-apim-subscription-key`, and
	 * `x-functions-key` are not on the base reserved list, so they already pass
	 * through without needing to be listed here.
	 */
	private static readonly _overridableReservedAuthHeaders: ReadonlySet<string> = new Set([
		'api-key',
		'authorization',
	]);

	/**
	 * Well-known auth header names whose presence in `requestHeaders` signals
	 * that the user is supplying their own credentials, so the default URL-
	 * inferred auth header should not also be sent (otherwise the endpoint
	 * receives two conflicting credentials). Headers that are typically
	 * complementary to a backend auth header (e.g. APIM subscription keys,
	 * Azure Functions keys) are intentionally excluded.
	 */
	private static readonly _userAuthHeaderSuppressionSet: ReadonlySet<string> = new Set([
		'api-key',
		'authorization',
		'x-api-key',
		'x-goog-api-key',
		'apikey',
	]);

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

	protected override get useMessagesApi(): boolean {
		return !!this.modelMetadata.supported_endpoints?.includes(ModelSupportedEndpoint.Messages);
	}

	protected override _isReservedHeader(lowerKey: string): boolean {
		if (CustomEndpointOAIEndpoint._overridableReservedAuthHeaders.has(lowerKey)) {
			return false;
		}
		return super._isReservedHeader(lowerKey);
	}

	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		const userSuppliedAuth = this._hasUserAuthHeader();
		if (this.useMessagesApi) {
			if (!userSuppliedAuth) {
				headers['x-api-key'] = this._apiKey;
			}
			headers['anthropic-version'] = '2023-06-01';
			Object.assign(headers, this.getAnthropicBetaHeader());
		} else if (!userSuppliedAuth) {
			if (this._modelUrl.includes('openai.azure')) {
				headers['api-key'] = this._apiKey;
			} else {
				headers['Authorization'] = `Bearer ${this._apiKey}`;
			}
		}
		for (const [key, value] of Object.entries(this._customHeaders)) {
			headers[key] = this._interpolateApiKey(value);
		}
		return headers;
	}

	private _hasUserAuthHeader(): boolean {
		for (const key of Object.keys(this._customHeaders)) {
			if (CustomEndpointOAIEndpoint._userAuthHeaderSuppressionSet.has(key.toLowerCase())) {
				return true;
			}
		}
		return false;
	}

	private _interpolateApiKey(value: string): string {
		// Replace the literal token `${apiKey}` with the configured API key so
		// users can keep the secret in VS Code's secret storage via
		// `"apiKey": "${input:...}"` while still wiring it into a custom header.
		if (!value.includes('${apiKey}')) {
			return value;
		}
		return value.split('${apiKey}').join(this._apiKey);
	}
}
