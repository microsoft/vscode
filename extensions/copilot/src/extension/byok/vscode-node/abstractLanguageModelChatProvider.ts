/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, commands, LanguageModelChatInformation, LanguageModelChatMessage, LanguageModelChatMessage2, LanguageModelChatProvider, LanguageModelResponsePart2, PrepareLanguageModelChatModelOptions, Progress, ProvideLanguageModelChatResponseOptions } from 'vscode';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelChatApiType } from '../../../vscodeTypes';
import { CopilotLanguageModelWrapper } from '../../conversation/vscode-node/languageModelAccess';
import { BYOKAuthType, BYOKKnownModels, BYOKModelCapabilities, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { byokKnownModelsToAPIInfoWithEffort } from './byokModelInfo';
import { IBYOKStorageService } from './byokStorageService';

export interface LanguageModelChatConfiguration {
	readonly apiKey?: string;
}

/** How long model discovery waits for a `/models` response, so a hung endpoint cannot stall model resolution. */
const MODELS_DISCOVERY_TIMEOUT_MS = 10_000;

// Published hosts may not yet expose this proposed API.
const apiTypes = LanguageModelChatApiType && {
	chatCompletions: LanguageModelChatApiType.ChatCompletions,
	responses: LanguageModelChatApiType.Responses,
	messages: LanguageModelChatApiType.Messages,
};

export interface ExtendedLanguageModelChatInformation<C extends LanguageModelChatConfiguration> extends LanguageModelChatInformation {
	readonly configuration?: C;
}

export abstract class AbstractLanguageModelChatProvider<C extends LanguageModelChatConfiguration = LanguageModelChatConfiguration, T extends ExtendedLanguageModelChatInformation<C> = ExtendedLanguageModelChatInformation<C>> implements LanguageModelChatProvider<T> {

	constructor(
		protected readonly _id: string,
		protected readonly _name: string,
		protected _knownModels: BYOKKnownModels | undefined,
		protected readonly _byokStorageService: IBYOKStorageService,
		@ILogService protected readonly _logService: ILogService,
	) {
		this.configureDefaultGroupWithApiKeyOnly();
	}

	updateKnownModels(knownModels: BYOKKnownModels | undefined): void {
		if (!knownModels) {
			return;
		}
		this._knownModels = { ...this._knownModels, ...knownModels };
	}

	// TODO: Remove this after 6 months
	protected async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		const apiKey = await this._byokStorageService.getAPIKey(this._name);
		if (apiKey) {
			this.configureDefaultGroupIfExists(this._name, { apiKey } as C);
			await this._byokStorageService.deleteAPIKey(this._name, BYOKAuthType.GlobalApiKey);
		}
		return apiKey;
	}

	protected async configureDefaultGroupIfExists(name: string, configuration: C): Promise<void> {
		await commands.executeCommand('lm.migrateLanguageModelsProviderGroup', { vendor: this._id, name, ...configuration });
	}

	async provideLanguageModelChatInformation({ silent, configuration }: PrepareLanguageModelChatModelOptions, token: CancellationToken): Promise<T[]> {
		let apiKey: string | undefined = (configuration as C)?.apiKey;
		if (!apiKey) {
			apiKey = await this.configureDefaultGroupWithApiKeyOnly();
		}

		const models = await this.getAllModels(silent, apiKey, configuration as C);
		return models.map(model => ({
			...model,
			isBYOK: true,
			apiKey,
			configuration
		}));
	}

	abstract provideLanguageModelChatResponse(model: T, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<void>;
	abstract provideTokenCount(model: T, text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Promise<number>;
	protected abstract getAllModels(silent: boolean, apiKey: string | undefined, configuration: C | undefined): Promise<T[]>;
}

export interface OpenAICompatibleLanguageModelChatInformation<C extends LanguageModelChatConfiguration> extends ExtendedLanguageModelChatInformation<C> {
	url: string;
}

export abstract class AbstractOpenAICompatibleLMProvider<T extends LanguageModelChatConfiguration = LanguageModelChatConfiguration> extends AbstractLanguageModelChatProvider<T, OpenAICompatibleLanguageModelChatInformation<T>> {
	protected readonly _lmWrapper: CopilotLanguageModelWrapper;

	constructor(
		id: string,
		name: string,
		knownModels: BYOKKnownModels | undefined,
		byokStorageService: IBYOKStorageService,
		@IFetcherService protected readonly _fetcherService: IFetcherService,
		logService: ILogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IExperimentationService protected readonly _expService: IExperimentationService
	) {
		super(id, name, knownModels, byokStorageService, logService);
		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
	}

	override async provideLanguageModelChatInformation(options: PrepareLanguageModelChatModelOptions, token: CancellationToken): Promise<OpenAICompatibleLanguageModelChatInformation<T>[]> {
		const models = await super.provideLanguageModelChatInformation(options, token);
		return Promise.all(models.map(async model => {
			const endpoint = await this.createOpenAIEndPoint(model);
			return {
				...model,
				capabilities: {
					...model.capabilities,
					apiType: apiTypes?.[endpoint.apiType],
					adaptiveThinking: endpoint.supportsAdaptiveThinking,
				},
			};
		}));
	}

	async provideLanguageModelChatResponse(model: OpenAICompatibleLanguageModelChatInformation<T>, messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options: ProvideLanguageModelChatResponseOptions, progress: Progress<LanguageModelResponsePart2>, token: CancellationToken): Promise<void> {
		const openAIChatEndpoint = await this.createOpenAIEndPoint(model);
		return this._lmWrapper.provideLanguageModelResponse(openAIChatEndpoint, messages, options, options.requestInitiator, progress, token);
	}

	async provideTokenCount(model: OpenAICompatibleLanguageModelChatInformation<T>, text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token: CancellationToken): Promise<number> {
		const openAIChatEndpoint = await this.createOpenAIEndPoint(model);
		return this._lmWrapper.provideTokenCount(openAIChatEndpoint, text);
	}

	protected async getAllModels(silent: boolean, apiKey: string | undefined, configuration: T | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<T>[]> {
		const modelsUrl = this.getModelsBaseUrl(configuration);
		if (modelsUrl && (apiKey || !silent)) {
			const models = await this.getModelsFromEndpoint(modelsUrl, apiKey);
			return byokKnownModelsToAPIInfoWithEffort(this._name, models).map(model => ({
				...model,
				url: modelsUrl
			}));
		}
		return [];
	}

	protected async getModelsFromEndpoint(endpoint: string, apiKey: string | undefined): Promise<BYOKKnownModels> {
		const abortController = new AbortController();
		const timeout = setTimeout(() => abortController.abort(), MODELS_DISCOVERY_TIMEOUT_MS);
		try {
			const headers: IStringDictionary<string> = {
				'Content-Type': 'application/json'
			};
			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const modelsEndpoint = this.getModelsDiscoveryUrl(endpoint);
			const response = await this._fetcherService.fetch(modelsEndpoint, {
				method: 'GET',
				headers,
				callSite: 'byok-models-discovery',
				signal: abortController.signal,
			});
			const data = await response.json();
			const modelList: BYOKKnownModels = {};

			const models = data.data ?? data.models;
			if (!models || !Array.isArray(models)) {
				throw new Error('Invalid response format');
			}

			for (const model of models) {
				const modelCapabilities = this.getDiscoveredModelCapabilities(model);
				if (modelCapabilities) {
					modelList[model.id] = modelCapabilities;
				}
			}
			return modelList;
		} catch (error) {
			const reportedError = abortController.signal.aborted ? new Error(`Timed out after ${MODELS_DISCOVERY_TIMEOUT_MS / 1000} seconds`) : error;
			this._logService.error(reportedError, `[${this._name}] Error fetching available models from ${endpoint}`);
			throw reportedError;
		} finally {
			clearTimeout(timeout);
		}
	}

	protected async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<T>): Promise<OpenAIEndpoint> {
		const modelInfo = this.getModelInfo(model.id, model.url);
		const url = modelInfo.supported_endpoints?.includes(ModelSupportedEndpoint.Responses) ?
			`${model.url}/responses` :
			`${model.url}/chat/completions`;
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, model.configuration?.apiKey ?? '', url);
	}

	protected getModelInfo(modelId: string, modelUrl: string): IChatModelInformation {
		return resolveModelInfo(modelId, this._name, this._knownModels);
	}

	protected resolveModelCapabilities(modelData: unknown): BYOKModelCapabilities | undefined {
		return undefined;
	}

	/**
	 * Returns the capabilities for one discovered model, preferring {@link _knownModels}
	 * and memoizing newly resolved entries there by model id. Providers whose model
	 * ids are not unique across endpoints should override this to skip the cache.
	 */
	protected getDiscoveredModelCapabilities(modelData: { id: string }): BYOKModelCapabilities | undefined {
		let modelCapabilities = this._knownModels?.[modelData.id];
		if (!modelCapabilities) {
			modelCapabilities = this.resolveModelCapabilities(modelData);
			if (!modelCapabilities) {
				return undefined;
			}
			if (!this._knownModels) {
				this._knownModels = {};
			}
			this._knownModels[modelData.id] = modelCapabilities;
		}
		return modelCapabilities;
	}

	protected abstract getModelsBaseUrl(configuration: T | undefined): string | undefined;

	protected getModelsDiscoveryUrl(modelsBaseUrl: string): string {
		return `${modelsBaseUrl}/models`;
	}

}
