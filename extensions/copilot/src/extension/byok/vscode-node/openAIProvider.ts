/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { EndpointEditToolName, IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { byokKnownModelToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

type OpenAIApiType = 'chat-completions' | 'responses';

interface _OpenAIModelConfig {
	name: string;
	url?: string;
	apiType?: OpenAIApiType;
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

export interface OpenAIModelConfig extends _OpenAIModelConfig {
	id: string;
}

export interface OpenAIModelProviderConfig extends LanguageModelChatConfiguration {
	url?: string;
	models?: OpenAIModelConfig[];
	/**
	 * Enables Zero Data Retention for every model in this provider group. ZDR organizations
	 * reject `previous_response_id` and server-side storage, so when set the Responses API path
	 * is forced into stateless mode (`store: false`, no marker reuse).
	 */
	zeroDataRetentionEnabled?: boolean;
}

export class OAIBYOKLMProvider extends AbstractOpenAICompatibleLMProvider<OpenAIModelProviderConfig> {

	public static readonly providerName = 'OpenAI';
	public static readonly providerId = this.providerName.toLowerCase();

	constructor(
		knownModels: BYOKKnownModels,
		byokStorageService: IBYOKStorageService,
		@IFetcherService fetcherService: IFetcherService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService
	) {
		super(
			OAIBYOKLMProvider.providerId,
			OAIBYOKLMProvider.providerName,
			knownModels,
			byokStorageService,
			fetcherService,
			logService,
			instantiationService,
			configurationService,
			expService
		);
	}

	protected override getModelsBaseUrl(): string {
		return 'https://api.openai.com/v1';
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: OpenAIModelProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<OpenAIModelProviderConfig>[]> {
		// When the user explicitly configures models (e.g. through `chatLanguageModels.json`), honor
		// those per-model capabilities instead of discovering models and substituting built-in
		// metadata. Otherwise configured `maxInputTokens`/`maxOutputTokens` are silently ignored.
		// See issue #322216.
		if (Array.isArray(configuration?.models) && configuration.models.length > 0) {
			return configuration.models.map(modelConfig => ({
				...byokKnownModelToAPIInfoWithEffort(this._name, modelConfig.id, modelConfig),
				url: modelConfig.url ?? this.getModelsBaseUrl()
			}));
		}
		return super.getAllModels(silent, apiKey, configuration);
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<OpenAIModelProviderConfig>): Promise<OpenAIEndpoint> {
		// Zero Data Retention is configured per provider group and applies to every model in it.
		const groupZeroDataRetention = !!model.configuration?.zeroDataRetentionEnabled;
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		if (modelConfiguration) {
			const apiType: OpenAIApiType = modelConfiguration.apiType ?? (model.url.includes('/responses') ? 'responses' : 'chat-completions');
			const url = resolveOpenAIUrl(model.url, apiType);
			const modelCapabilities = {
				maxInputTokens: model.maxInputTokens,
				maxOutputTokens: model.maxOutputTokens,
				toolCalling: !!model.capabilities?.toolCalling || false,
				vision: !!model.capabilities?.imageInput || false,
				name: model.name,
				url,
				thinking: modelConfiguration.thinking ?? false,
				streaming: modelConfiguration.streaming,
				requestHeaders: modelConfiguration.requestHeaders,
				zeroDataRetentionEnabled: modelConfiguration.zeroDataRetentionEnabled || groupZeroDataRetention,
				supportsReasoningEffort: modelConfiguration.supportsReasoningEffort,
				reasoningEffortFormat: modelConfiguration.reasoningEffortFormat
			};
			const modelInfo = resolveModelInfo(model.id, this._name, undefined, modelCapabilities);
			modelInfo.supported_endpoints = apiType === 'responses'
				? [ModelSupportedEndpoint.ChatCompletions, ModelSupportedEndpoint.Responses]
				: [ModelSupportedEndpoint.ChatCompletions];
			return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
		}
		// Discovered models still honor the group-level Zero Data Retention setting.
		const modelInfo = this.getModelInfo(model.id, model.url);
		modelInfo.zeroDataRetentionEnabled = groupZeroDataRetention;
		const url = modelInfo.supported_endpoints?.includes(ModelSupportedEndpoint.Responses)
			? `${model.url}/responses`
			: `${model.url}/chat/completions`;
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}

	protected override getModelInfo(modelId: string, modelUrl: string): IChatModelInformation {
		const modelInfo = super.getModelInfo(modelId, modelUrl);
		modelInfo.supported_endpoints = [
			ModelSupportedEndpoint.ChatCompletions,
			ModelSupportedEndpoint.Responses
		];
		return modelInfo;
	}
}

/**
 * Resolves the request URL for a configured OpenAI model. If the URL already
 * targets an explicit API path it is used as-is; otherwise the appropriate
 * path is appended based on the API type (defaulting the version segment to
 * `/v1` when missing).
 */
export function resolveOpenAIUrl(url: string, apiType: OpenAIApiType): string {
	if (url.includes('/responses') || url.includes('/chat/completions')) {
		return url;
	}
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}
	const path = apiType === 'responses' ? '/responses' : '/chat/completions';
	const versionPattern = /\/v\d+$/;
	if (versionPattern.test(url)) {
		return `${url}${path}`;
	}
	return `${url}/v1${path}`;
}
