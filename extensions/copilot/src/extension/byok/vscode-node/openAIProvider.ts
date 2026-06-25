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

/** Per-model overrides a user can specify in the `openai` provider configuration. */
interface OpenAIModelOverride {
	id: string;
	zeroDataRetentionEnabled?: boolean;
}

export interface OpenAIModelProviderConfig extends LanguageModelChatConfiguration {
	models?: OpenAIModelOverride[];
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

	protected override getModelInfo(modelId: string, modelUrl: string): IChatModelInformation {
		const modelInfo = super.getModelInfo(modelId, modelUrl);
		modelInfo.supported_endpoints = [
			ModelSupportedEndpoint.ChatCompletions,
			ModelSupportedEndpoint.Responses
		];
		return modelInfo;
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<OpenAIModelProviderConfig>): Promise<OpenAIEndpoint> {
		const modelInfo = this.getModelInfo(model.id, model.url);
		// Apply user-specified per-model overrides from the provider configuration. The
		// CDN-sourced known models cannot express org-specific settings such as Zero Data
		// Retention, so honor an explicit override when the user provides one.
		const modelOverride = model.configuration?.models?.find(m => m.id === model.id);
		if (modelOverride?.zeroDataRetentionEnabled !== undefined) {
			modelInfo.zeroDataRetentionEnabled = modelOverride.zeroDataRetentionEnabled;
		}
		const url = modelInfo.supported_endpoints?.includes(ModelSupportedEndpoint.Responses) ?
			`${model.url}/responses` :
			`${model.url}/chat/completions`;
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}
}
