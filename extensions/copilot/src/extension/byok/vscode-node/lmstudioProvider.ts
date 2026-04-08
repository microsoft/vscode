/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKModelCapabilities, byokKnownModelsToAPIInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

interface LMStudioModelsResponse {
	data?: Array<{
		id: string;
		object?: string;
		owned_by?: string;
	}>;
	models?: Array<{
		id: string;
	}>;
}

export interface LMStudioConfig extends LanguageModelChatConfiguration {
	url: string;
}

export class LMStudioLMProvider extends AbstractOpenAICompatibleLMProvider<LMStudioConfig> {
	public static readonly providerName = 'LM Studio';

	constructor(
		byokStorageService: IBYOKStorageService,
		@IFetcherService fetcherService: IFetcherService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExperimentationService expService: IExperimentationService
	) {
		super(
			'lmstudio',
			LMStudioLMProvider.providerName,
			undefined,
			byokStorageService,
			fetcherService,
			logService,
			instantiationService,
			configurationService,
			expService
		);

		this.migrateConfig();
	}

	private async migrateConfig(): Promise<void> {
		const baseUrl = this.getBaseUrlFromSettings();
		if (!baseUrl) {
			return;
		}
		await this.configureDefaultGroupIfExists(this._name, { url: baseUrl });
		await this._configurationService.setConfig(ConfigKey.Deprecated.LMStudioEndpoint, undefined);
	}

	private getBaseUrlFromSettings(): string | undefined {
		if (this._configurationService.isConfigured(ConfigKey.Deprecated.LMStudioEndpoint)) {
			return this._configurationService.getConfig(ConfigKey.Deprecated.LMStudioEndpoint);
		}
		return undefined;
	}

	protected override async getAllModels(
		_silent: boolean,
		_apiKey: string | undefined,
		config: LMStudioConfig | undefined
	): Promise<OpenAICompatibleLanguageModelChatInformation<LMStudioConfig>[]> {
		if (!config?.url) {
			return [];
		}

		const baseUrl = config.url;

		try {
			const response = await this._fetcherService.fetch(`${baseUrl}/models`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				},
				callSite: 'lmstudio-models-discovery',
			});

			const data = await response.json() as LMStudioModelsResponse;
			const models = data.data ?? data.models ?? [];

			this._knownModels = {};
			for (const model of models) {
				if (!model.id) {
					continue;
				}

				this._knownModels[model.id] = this.resolveModelCapabilities(model) ?? {
					name: model.id,
					maxInputTokens: 32768,
					maxOutputTokens: 4096,
					toolCalling: true,
					vision: false,
				};
			}

			return byokKnownModelsToAPIInfo(this._name, this._knownModels).map(model => ({
				...model,
				url: baseUrl
			}));
		} catch {
			throw new Error('Failed to fetch models from LM Studio. Please ensure LM Studio is running and the server is enabled.');
		}
	}

	protected override resolveModelCapabilities(modelData: unknown): BYOKModelCapabilities | undefined {
		if (!modelData || typeof modelData !== 'object' || !('id' in modelData)) {
			return undefined;
		}

		const model = modelData as { id: string };
		return {
			name: model.id,
			maxInputTokens: 32768,
			maxOutputTokens: 4096,
			toolCalling: true,
			vision: false,
		};
	}

	protected override getModelsBaseUrl(configuration: LMStudioConfig | undefined): string {
		return configuration?.url ?? 'http://localhost:1234/v1';
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<LMStudioConfig>): Promise<OpenAIEndpoint> {
		const modelInfo: IChatModelInformation = this.getModelInfo(model.id, model.url);
		const url = `${model.url}/chat/completions`;
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}
}
