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
