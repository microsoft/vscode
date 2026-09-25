/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelResponsePart2, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { EndpointEditToolName, IChatModelInformation, IChatModelRequestOptions, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ICreateEndpointBodyOptions, IEndpointBody } from '../../../platform/networking/common/networking';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { resolveModelInfo } from '../common/byokProvider';
import { hasAuthOverrideHeader, isReservedHeaderAllowingAuthOverride, sanitizeCustomHeaders } from '../common/customHeaderSanitizer';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, ExtendedLanguageModelChatInformation, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { byokKnownModelToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';
import { GeminiModelConfiguration, GeminiNativeBYOKLMProvider } from './geminiNativeProvider';

export type CustomEndpointApiType = 'chat-completions' | 'responses' | 'messages' | 'gemini';

/** Matches the `:generateContent` / `:streamGenerateContent` method marker of a Gemini REST call. */
const GEMINI_GENERATE_CONTENT_PATTERN = /:(?:stream)?generateContent\b/i;

function isGeminiGenerateContentUrl(url: string): boolean {
	return GEMINI_GENERATE_CONTENT_PATTERN.test(url);
}

/**
 * Builds the request URL for `chat-completions` / `responses` / `messages`.
 * Not used for `gemini`; see {@link resolveGeminiBaseUrl}.
 */
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
		case 'gemini':
		default:
			return '/chat/completions';
	}
}

export function hasExplicitApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions') || url.includes('/messages') || isGeminiGenerateContentUrl(url);
}

function inferApiTypeFromUrl(url: string): CustomEndpointApiType {
	if (isGeminiGenerateContentUrl(url)) {
		return 'gemini';
	}
	if (url.includes('/messages')) {
		return 'messages';
	}
	if (url.includes('/responses')) {
		return 'responses';
	}
	return 'chat-completions';
}

/**
 * Normalizes a Custom Endpoint URL into `{ baseUrl, apiVersion }` for the Gemini
 * SDK, which builds the full request URL itself
 * (`{baseUrl}/{apiVersion}/models/{model}:generateContent`) rather than taking one.
 * Strips a trailing version segment and a `models/...:generateContent` tail;
 * leaves gateway path prefixes untouched.
 */
export function resolveGeminiBaseUrl(url: string): { baseUrl: string; apiVersion: string | undefined } {
	let baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

	baseUrl = baseUrl.replace(/\/models\/[^/]+:(?:stream)?generateContent(?:\?.*)?$/i, '');

	const versionMatch = baseUrl.match(/\/(v1(?:alpha|beta)?)$/);
	if (!versionMatch) {
		return { baseUrl, apiVersion: undefined };
	}
	return { baseUrl: baseUrl.slice(0, -versionMatch[0].length), apiVersion: versionMatch[1] };
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
	adaptiveThinking?: boolean;
	minThinkingBudget?: number;
	maxThinkingBudget?: number;
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

/**
 * Resolves apiType: per-model override, then group default, then URL inference.
 * Uses the raw URL, before {@link resolveCustomEndpointUrl} would append anything,
 * so a bare Gemini URL infers correctly instead of defaulting to Chat Completions.
 */
function resolveModelApiType(url: string, modelApiType: CustomEndpointApiType | undefined, groupApiType: CustomEndpointApiType | undefined): CustomEndpointApiType {
	return modelApiType ?? groupApiType ?? inferApiTypeFromUrl(url);
}

/**
 * Replaces the literal token `${apiKey}` in each header value with the configured
 * API key, mirroring {@link CustomEndpointOAIEndpoint}'s interpolation for the other
 * three apiTypes. Lets a gateway-specific header pull from the same secret-stored
 * key instead of requiring a second one.
 */
function interpolateApiKeyInHeaders(headers: Record<string, string> | undefined, apiKey: string | undefined): Record<string, string> | undefined {
	if (!headers || !apiKey) {
		return headers;
	}
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		result[key] = value.includes('${apiKey}') ? value.split('${apiKey}').join(apiKey) : value;
	}
	return result;
}

export class CustomEndpointBYOKModelProvider extends AbstractOpenAICompatibleLMProvider<CustomEndpointModelProviderConfig> {

	public static readonly providerName = 'CustomEndpoint';
	public static readonly providerId = this.providerName.toLowerCase();

	// Handles every `apiType: 'gemini'` request. Reused from the registered Gemini
	// provider singleton (passed in from byokContribution.ts) rather than constructed
	// here, so its legacy API-key migration only ever runs once at extension startup.
	private readonly _geminiDelegate: GeminiNativeBYOKLMProvider;

	constructor(
		_byokStorageService: IBYOKStorageService,
		geminiDelegate: GeminiNativeBYOKLMProvider,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
	) {
		super(CustomEndpointBYOKModelProvider.providerId, CustomEndpointBYOKModelProvider.providerName, undefined, _byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
		this._geminiDelegate = geminiDelegate;
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No-op: Custom Endpoint models are configured via the JSON snippet flow, not by an API-key-only prompt.
		return;
	}

	/**
	 * Adapts a Custom Endpoint model into the shape the native Gemini provider expects,
	 * pointing it at the user's endpoint instead of the official Gemini Developer API.
	 */
	private _toGeminiModel(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>): ExtendedLanguageModelChatInformation<GeminiModelConfiguration> {
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const { baseUrl, apiVersion } = resolveGeminiBaseUrl(model.url);
		const headers = interpolateApiKeyInHeaders(
			// Same auth-override allowance as CustomEndpointOAIEndpoint: api-key/authorization
			// are permitted through so a gateway behind this URL can replace the inferred auth.
			sanitizeCustomHeaders(modelConfiguration?.requestHeaders, model.id, this._logService, isReservedHeaderAllowingAuthOverride),
			model.configuration?.apiKey
		) ?? {};
		if (hasAuthOverrideHeader(headers) && !Object.keys(headers).some(key => key.toLowerCase() === 'x-goog-api-key')) {
			// The user is authenticating via their own header. @google/genai's NodeAuth still
			// auto-adds x-goog-api-key from the configured apiKey unless that exact header is
			// already present, so pre-empt it with an empty placeholder to avoid sending a
			// second, conflicting credential to the gateway.
			headers['x-goog-api-key'] = '';
		}
		return {
			...model,
			configuration: {
				apiKey: model.configuration?.apiKey,
				// Custom Endpoint models don't require an apiKey (see CustomEndpointOAIEndpoint,
				// which passes '' the same way for the other apiTypes): the endpoint may be
				// unauthenticated, or authenticated solely via a requestHeaders entry.
				apiKeyOptional: true,
				baseUrl,
				apiVersion,
				headers,
				modelOptions: modelConfiguration?.modelOptions,
				streaming: modelConfiguration?.streaming,
				supportsReasoningEffort: modelConfiguration?.supportsReasoningEffort,
			}
		};
	}

	override async provideLanguageModelChatResponse(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<void> {
		if (this._resolveApiType(model) === 'gemini') {
			return this._geminiDelegate.provideLanguageModelChatResponse(this._toGeminiModel(model), messages, options, progress, token);
		}
		return super.provideLanguageModelChatResponse(model, messages, options, progress, token);
	}

	override async provideTokenCount(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>, text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Promise<number> {
		if (this._resolveApiType(model) === 'gemini') {
			return this._geminiDelegate.provideTokenCount(this._toGeminiModel(model), text, token);
		}
		return super.provideTokenCount(model, text, token);
	}

	private _resolveApiType(model: OpenAICompatibleLanguageModelChatInformation<CustomEndpointModelProviderConfig>): CustomEndpointApiType {
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		return resolveModelApiType(model.url, modelConfiguration?.apiType, model.configuration?.apiType);
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
		const apiType = resolveModelApiType(model.url, modelConfiguration?.apiType, model.configuration?.apiType);
		const url = resolveCustomEndpointUrl(model.id, model.url, apiType);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			contextWindow: modelConfiguration?.contextWindow,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: modelConfiguration?.thinking ?? false,
			adaptiveThinking: modelConfiguration?.adaptiveThinking,
			minThinkingBudget: modelConfiguration?.minThinkingBudget,
			maxThinkingBudget: modelConfiguration?.maxThinkingBudget,
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
 * 4. Omits the Responses API `store` property when Zero Data Retention was not
 *    explicitly configured, allowing custom implementations to use their own default.
 */
export class CustomEndpointOAIEndpoint extends OpenAIEndpoint {
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

	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		const body = super.createRequestBody(options);
		if (this.useResponsesApi && this.modelMetadata.zeroDataRetentionEnabled === undefined) {
			delete body.store;
		}
		return body;
	}

	protected override _isReservedHeader(lowerKey: string): boolean {
		return isReservedHeaderAllowingAuthOverride(lowerKey);
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
		return hasAuthOverrideHeader(this._customHeaders);
	}

	/**
	 * Preserve Custom Endpoint request shaping when a context-size override clones the endpoint.
	 */
	override cloneWithTokenOverride(modelMaxPromptTokens: number): CustomEndpointOAIEndpoint {
		const newModelInfo = { ...this.modelMetadata, maxInputTokens: modelMaxPromptTokens };
		return this.instantiationService.createInstance(CustomEndpointOAIEndpoint, newModelInfo, this._apiKey, this._modelUrl);
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
