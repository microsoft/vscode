/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

export interface OpenAIProviderConfig extends LanguageModelChatConfiguration {
	readonly zeroDataRetentionEnabled?: boolean;
}

export function applyOpenAIProviderConfig(modelInfo: IChatModelInformation, configuration: OpenAIProviderConfig | undefined): IChatModelInformation {
	return {
		...modelInfo,
		zeroDataRetentionEnabled: configuration?.zeroDataRetentionEnabled ?? modelInfo.zeroDataRetentionEnabled,
	};
}

export class OAIBYOKLMProvider extends AbstractOpenAICompatibleLMProvider<OpenAIProviderConfig> {

	public static readonly providerName = 'OpenAI';
	public static readonly providerId = this.providerName.toLowerCase();
	private _apiKey: string | undefined;
	private _modelDiscovery: { apiKey: string; expiresAt: number; models: Promise<OpenAICompatibleLanguageModelChatInformation<OpenAIProviderConfig>[]> } | undefined;

	get apiKey(): string | undefined {
		return this._apiKey;
	}

	override updateKnownModels(knownModels: BYOKKnownModels | undefined): void {
		super.updateKnownModels(knownModels);
		if (knownModels) {
			this._modelDiscovery = undefined;
		}
	}

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

	/** Silent discovery reuses key-scoped results for one minute; explicit refreshes always reach OpenAI. */
	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: OpenAIProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<OpenAIProviderConfig>[]> {
		this._apiKey = apiKey?.trim() || undefined;
		if (!this._apiKey) {
			// Model selection probes the unconfigured default group before the configured groups.
			return super.getAllModels(silent, apiKey, configuration);
		}
		const cached = this._modelDiscovery;
		if (silent && cached?.apiKey === this._apiKey && cached.expiresAt > Date.now()) {
			return cached.models;
		}
		this._modelDiscovery = undefined;
		const models = super.getAllModels(silent, apiKey, configuration);
		const discovery = this._modelDiscovery = { apiKey: this._apiKey, expiresAt: Date.now() + 60_000, models };
		try {
			return await models;
		} catch (error) {
			if (this._modelDiscovery === discovery) {
				this._modelDiscovery = undefined;
			}
			throw error;
		}
	}

	protected override getModelsBaseUrl(): string {
		return 'https://api.openai.com/v1';
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<OpenAIProviderConfig>): Promise<OpenAIEndpoint> {
		const modelInfo = applyOpenAIProviderConfig(this.getModelInfo(model.id, model.url), model.configuration);
		const url = modelInfo.supported_endpoints?.includes(ModelSupportedEndpoint.Responses) ?
			`${model.url}/responses` :
			`${model.url}/chat/completions`;
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
