/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMLFetcher } from '../../../platform/chat/common/chatMLFetcher';
import { Config, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { EndpointEditToolName, IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatWebSocketManager } from '../../../platform/networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { byokKnownModelToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

export type CustomOAIApiType = 'chat-completions' | 'responses' | 'messages';

export function resolveCustomOAIUrl(modelId: string, url: string, apiType?: CustomOAIApiType): string {
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

function apiTypeToPath(apiType: CustomOAIApiType | undefined): string {
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

function inferApiTypeFromUrl(url: string): CustomOAIApiType {
	if (url.includes('/messages')) {
		return 'messages';
	}
	if (url.includes('/responses')) {
		return 'responses';
	}
	return 'chat-completions';
}

function apiTypeToSupportedEndpoints(apiType: CustomOAIApiType): ModelSupportedEndpoint[] | undefined {
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

export interface CustomOAIModelProviderConfig extends LanguageModelChatConfiguration {
	url?: string;
	apiType?: CustomOAIApiType;
	models?: CustomOAIModelConfig[];
}

interface _CustomOAIModelConfig {
	name: string;
	url: string;
	apiType?: CustomOAIApiType;
	maxInputTokens: number;
	maxOutputTokens: number;
	toolCalling: boolean;
	vision: boolean;
	thinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	requestHeaders?: Record<string, string>;
	zeroDataRetentionEnabled?: boolean;
	supportsReasoningEffort?: string[];
	reasoningEffortFormat?: 'chat-completions' | 'responses';
}

export interface CustomOAIModelConfig extends _CustomOAIModelConfig {
	id: string;
}

export abstract class AbstractCustomOAIBYOKModelProvider extends AbstractOpenAICompatibleLMProvider<CustomOAIModelProviderConfig> {

	constructor(
		id: string,
		name: string,
		byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext
	) {
		super(id, name, undefined, byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
	}

	protected async migrateConfig(configKey: Config<IStringDictionary<_CustomOAIModelConfig>>, providerName: string, providerGroupName: string): Promise<void> {
		// Check if migration has already been completed
		const migrationKey = `copilot-byok-migration-${providerName}-${configKey}`;
		const migrationCompleted = this._extensionContext.globalState.get<boolean>(migrationKey, false);
		if (migrationCompleted) {
			return;
		}

		const customOAIModelConfigsByApiKey: Map<string, Array<CustomOAIModelConfig & { requiresAPIKey?: boolean }>> = new Map();
		const customOAIModelProviderConfig = this._configurationService.getConfig<IStringDictionary<_CustomOAIModelConfig>>(configKey);
		for (const [modelId, modelConfig] of Object.entries(customOAIModelProviderConfig)) {
			const apiKey = await this._byokStorageService.getAPIKey(providerName, modelId) ?? '';
			const customOAIModelConfigs = customOAIModelConfigsByApiKey.get(apiKey) ?? [];
			customOAIModelConfigs.push({ ...modelConfig, id: modelId, requiresAPIKey: undefined });
			customOAIModelConfigsByApiKey.set(apiKey, customOAIModelConfigs);
		}
		if (customOAIModelConfigsByApiKey.size > 0) {
			for (const [apiKey, customOAIModelConfigs] of customOAIModelConfigsByApiKey.entries()) {
				await this.configureDefaultGroupIfExists(providerGroupName, { models: customOAIModelConfigs, apiKey: apiKey || undefined });
			}
			// Mark migration as completed instead of deleting the config
			await this._extensionContext.globalState.update(migrationKey, true);
		}
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No-op: Custom OAI models are configured separately via migration
		return;
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: CustomOAIModelProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>[]> {
		if (configuration?.url) {
			return super.getAllModels(silent, apiKey, configuration);
		}
		const models: OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>[] = [];
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

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>): Promise<OpenAIEndpoint> {
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const apiTypeOverride = modelConfiguration?.apiType ?? model.configuration?.apiType;
		const url = this.resolveUrl(model.id, model.url, apiTypeOverride);
		const apiType: CustomOAIApiType = apiTypeOverride ?? inferApiTypeFromUrl(url);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: modelConfiguration?.thinking ?? false,
			streaming: modelConfiguration?.streaming,
			requestHeaders: modelConfiguration?.requestHeaders,
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

	protected getModelsBaseUrl(configuration: CustomOAIModelProviderConfig | undefined): string | undefined {
		return configuration?.url;
	}

	protected abstract resolveUrl(modelId: string, url: string, apiType?: CustomOAIApiType): string;
}

export class CustomOAIBYOKModelProvider extends AbstractCustomOAIBYOKModelProvider {

	public static readonly providerName = 'CustomOAI';
	public static readonly providerId = this.providerName.toLowerCase();

	constructor(
		_byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext
	) {
		super(CustomOAIBYOKModelProvider.providerId, CustomOAIBYOKModelProvider.providerName, _byokStorageService, logService, fetcherService, instantiationService, configurationService, expService, extensionContext);
		this.migrateExistingConfigs();
	}

	// TODO: Remove this after 6 months
	private async migrateExistingConfigs(): Promise<void> {
		await this.migrateConfig(ConfigKey.Deprecated.CustomOAIModels, CustomOAIBYOKModelProvider.providerName, CustomOAIBYOKModelProvider.providerName);
	}

	protected resolveUrl(modelId: string, url: string, apiType?: CustomOAIApiType): string {
		return resolveCustomOAIUrl(modelId, url, apiType);
	}
}

/**
 * Custom-endpoint specific subclass that:
 * 1. Bypasses the `UseAnthropicMessagesApi` experiment flag — the user explicitly
 *    selected the Messages API for their endpoint, so we honor that unconditionally.
 * 2. Sends Anthropic-style auth (`x-api-key`) and `anthropic-version` plus beta
 *    headers when the Messages API is in use, instead of `Authorization: Bearer`.
 *    Users can still override any header via the model's `requestHeaders` setting.
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

	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (this.useMessagesApi) {
			headers['x-api-key'] = this._apiKey;
			headers['anthropic-version'] = '2023-06-01';
			Object.assign(headers, this.getAnthropicBetaHeader());
		} else if (this._modelUrl.includes('openai.azure')) {
			headers['api-key'] = this._apiKey;
		} else {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}
		for (const [key, value] of Object.entries(this._customHeaders)) {
			headers[key] = value;
		}
		return headers;
	}
}
