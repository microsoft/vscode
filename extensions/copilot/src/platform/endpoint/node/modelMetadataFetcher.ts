/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import type { LanguageModelChat } from 'vscode';
import { TaskSingler } from '../../../util/common/taskSingler';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

import { IAuthenticationService } from '../../authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { GitHubOutageStatus, IOctoKitService } from '../../github/common/githubService';
import { ILogService } from '../../log/common/logService';
import { getRequest } from '../../networking/common/networking';
import { IRequestLogger } from '../../requestLogger/common/requestLogger';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ChatEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IModelAPIResponse, isChatModelInformation, isCompletionModelInformation, isEmbeddingModelInformation } from '../common/endpointProvider';
import { ModelAliasRegistry } from '../common/modelAliasRegistry';

export interface IModelMetadataFetcher {

	/**
	 * Fires whenever we refresh the models from the server.
	 * Does not always indicate there is a change, just that the data is fresh
	 */
	onDidModelsRefresh: Event<void>;

	/**
	 * Gets all the completion models known by the model fetcher endpoint
	 */
	getAllCompletionModels(forceRefresh: boolean): Promise<ICompletionModelInformation[]>;

	/**
	 * Gets all the chat models known by the model fetcher endpoint
	 */
	getAllChatModels(): Promise<IChatModelInformation[]>;

	/**
	 * Retrieves a chat model by its family name
	 * @param family The family of the model to fetch
	 */
	getChatModelFromFamily(family: ChatEndpointFamily): Promise<IChatModelInformation>;

	/**
	 * Retrieves a chat model by its id
	 * @param id The id of the chat model you want to get
	 * @returns The chat model information if found, otherwise undefined
	 */
	getChatModelFromApiModel(model: LanguageModelChat): Promise<IChatModelInformation | undefined>;

	/**
	 * Retrieves an embeddings model by its family name
	 * @param family The family of the model to fetch
	 */
	getEmbeddingsModel(family: 'text-embedding-3-small'): Promise<IEmbeddingModelInformation>;
}

/**
 * Responsible for interacting with the CAPI Model API
 * This is solely owned by the EndpointProvider (and TestEndpointProvider) which uses this service to power server side rollout of models
 * All model acquisition should be done through the EndpointProvider
 */
export class ModelMetadataFetcher extends Disposable implements IModelMetadataFetcher {

	private static readonly ALL_MODEL_KEY = 'allModels';

	private _familyMap: Map<string, IModelAPIResponse[]> = new Map();
	private _completionsFamilyMap: Map<string, IModelAPIResponse[]> = new Map();
	private _copilotBaseModel: IModelAPIResponse | undefined;
	private _lastFetchTime: number = 0;
	private readonly _taskSingler = new TaskSingler<IModelAPIResponse | undefined | void>();
	private _lastFetchError: any;

	private readonly _onDidModelRefresh = new Emitter<void>();
	public onDidModelsRefresh = this._onDidModelRefresh.event;

	constructor(
		protected readonly _isModelLab: boolean,
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IEnvService private readonly _envService: IEnvService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(this._authService.onDidAuthenticationChange(() => {
			// Auth changed so next fetch should be forced to get a new list
			this._familyMap.clear();
			this._completionsFamilyMap.clear();
			this._lastFetchTime = 0;
		}));
	}

	public async getAllCompletionModels(forceRefresh: boolean): Promise<ICompletionModelInformation[]> {
		await this._taskSingler.getOrCreate(ModelMetadataFetcher.ALL_MODEL_KEY, () => this._fetchModels(forceRefresh));
		const completionModels: ICompletionModelInformation[] = [];
		for (const [, models] of this._completionsFamilyMap) {
			for (const model of models) {
				if (isCompletionModelInformation(model)) {
					completionModels.push(model);
				}
			}
		}
		return completionModels;
	}

	public async getAllChatModels(): Promise<IChatModelInformation[]> {
		await this._taskSingler.getOrCreate(ModelMetadataFetcher.ALL_MODEL_KEY, this._fetchModels.bind(this));
		const chatModels: IChatModelInformation[] = [];
		for (const [, models] of this._familyMap) {
			for (const model of models) {
				if (isChatModelInformation(model)) {
					chatModels.push(model);
				}
			}
		}
		return chatModels;
	}

	/**
	 * Hydrates a model API response from the `/models` endpoint with proper exp overrides and error handling
	 * @param resolvedModel The resolved model to hydrate
	 * @returns The resolved model with proper exp overrides and token counts
	 */
	private async _hydrateResolvedModel(resolvedModel: IModelAPIResponse | undefined): Promise<IModelAPIResponse> {
		if (!resolvedModel) {
			throw this._lastFetchError ?? new Error(await this._getErrorMessage('Unable to resolve model'));
		}

		// If it's a chat model, update max prompt tokens based on settings + exp
		if (isChatModelInformation(resolvedModel) && (resolvedModel.capabilities.limits)) {
			resolvedModel.capabilities.limits.max_prompt_tokens = this._getMaxPromptTokensOverride(resolvedModel);
			// Also ensure prompt tokens + output tokens <= context window. Output tokens is capped to max 15% input tokens
			const outputTokens = Math.floor(Math.min(resolvedModel.capabilities.limits.max_output_tokens ?? 4096, resolvedModel.capabilities.limits.max_prompt_tokens * 0.15));
			const contextWindow = resolvedModel.capabilities.limits.max_context_window_tokens ?? (outputTokens + resolvedModel.capabilities.limits.max_prompt_tokens);
			resolvedModel.capabilities.limits.max_prompt_tokens = Math.min(resolvedModel.capabilities.limits.max_prompt_tokens, contextWindow - outputTokens);
		}

		// If it's a chat model, update showInModelPicker based on experiment overrides
		if (isChatModelInformation(resolvedModel)) {
			resolvedModel.model_picker_enabled = this._getShowInModelPickerOverride(resolvedModel);
		}

		if (resolvedModel.preview && !resolvedModel.name.endsWith('(Preview)')) {
			// If the model is a preview model, we append (Preview) to the name
			resolvedModel.name = `${resolvedModel.name} (Preview)`;
		}
		return resolvedModel;
	}

	public async getChatModelFromFamily(family: ChatEndpointFamily): Promise<IChatModelInformation> {
		await this._taskSingler.getOrCreate(ModelMetadataFetcher.ALL_MODEL_KEY, this._fetchModels.bind(this));
		let resolvedModel: IModelAPIResponse | undefined;
		family = ModelAliasRegistry.resolveAlias(family) as ChatEndpointFamily;

		if (family === 'copilot-base') {
			resolvedModel = this._copilotBaseModel;
		} else {
			resolvedModel = this._familyMap.get(family)?.[0];
		}
		if (!resolvedModel || !isChatModelInformation(resolvedModel)) {
			throw new Error(await this._getErrorMessage(`Unable to resolve chat model with family selection: ${family}`));
		}
		return resolvedModel;
	}

	public async getChatModelFromApiModel(apiModel: LanguageModelChat): Promise<IChatModelInformation | undefined> {
		await this._taskSingler.getOrCreate(ModelMetadataFetcher.ALL_MODEL_KEY, this._fetchModels.bind(this));
		let resolvedModel: IModelAPIResponse | undefined;
		for (const models of this._familyMap.values()) {
			resolvedModel = models.find(model =>
				model.id === apiModel.id &&
				model.version === apiModel.version &&
				model.capabilities.family === apiModel.family);
			if (resolvedModel) {
				break;
			}
		}
		if (!resolvedModel) {
			return;
		}
		if (!isChatModelInformation(resolvedModel)) {
			throw new Error(await this._getErrorMessage(`Unable to resolve chat model: ${apiModel.id},${apiModel.name},${apiModel.version},${apiModel.family}`));
		}
		return resolvedModel;
	}

	public async getEmbeddingsModel(family: 'text-embedding-3-small'): Promise<IEmbeddingModelInformation> {
		await this._taskSingler.getOrCreate(ModelMetadataFetcher.ALL_MODEL_KEY, this._fetchModels.bind(this));
		const resolvedModel = this._familyMap.get(family)?.[0];
		if (!resolvedModel || !isEmbeddingModelInformation(resolvedModel)) {
			throw new Error(await this._getErrorMessage(`Unable to resolve embeddings model with family selection: ${family}`));
		}
		return resolvedModel;
	}

	private _shouldRefreshModels(): boolean {
		if (this._familyMap.size === 0) {
			// Always refresh if we have no models as this means the last fetch failed in some way
			return true;
		}
		const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds
		const now = Date.now();

		if (!this._lastFetchTime) {
			return true; // If there's no last fetch time, we should refresh
		}

		// Only fetch if the current session is active.
		// This avoids unnecessary network calls when VS Code is in the background.
		if (!this._envService.isActive) {
			return false;
		}

		const timeSinceLastFetch = now - this._lastFetchTime;

		return timeSinceLastFetch > tenMinutes;
	}

	private async _fetchModels(force?: boolean): Promise<void> {
		if (!force && !this._shouldRefreshModels()) {
			return;
		}
		const requestStartTime = Date.now();

		const copilotToken = (await this._authService.getCopilotToken()).token;
		const requestId = generateUuid();
		const requestMetadata: RequestMetadata = { type: RequestType.Models, isModelLab: this._isModelLab };

		try {
			const response = await this._instantiationService.invokeFunction(getRequest, {
				endpointOrUrl: requestMetadata,
				secretKey: copilotToken,
				intent: 'model-access',
				requestId,
			});

			this._lastFetchTime = Date.now();
			this._logService.info(`Fetched model metadata in ${Date.now() - requestStartTime}ms ${requestId}`);

			if (response.status < 200 || response.status >= 300) {
				// If we're rate limited and have models, we should just return
				if (response.status === 429 && this._familyMap.size > 0) {
					this._logService.warn(`Rate limited while fetching models ${requestId}`);
					return;
				}
				throw new Error(await this._getErrorMessage(`Failed to fetch models (${requestId}): ${(await response.text()) || response.statusText || `HTTP ${response.status}`}`));
			}

			this._familyMap.clear();

			const data: IModelAPIResponse[] = (await response.json()).data;
			this._requestLogger.logModelListCall(requestId, requestMetadata, data);
			for (let model of data) {
				model = await this._hydrateResolvedModel(model);
				const isCompletionModel = isCompletionModelInformation(model);
				// The base model is whatever model is deemed "fallback" by the server
				if (model.is_chat_fallback && !isCompletionModel) {
					this._copilotBaseModel = model;
				}
				const family = model.capabilities.family;
				const familyMap = isCompletionModel ? this._completionsFamilyMap : this._familyMap;
				if (!familyMap.has(family)) {
					familyMap.set(family, []);
				}
				familyMap.get(family)?.push(model);
			}
			this._lastFetchError = undefined;
			this._onDidModelRefresh.fire();
		} catch (e) {
			this._logService.error(e, `Failed to fetch models (${requestId})`);
			this._lastFetchError = e;
			this._lastFetchTime = 0;
		}
	}

	// get ChatMaxNumTokens from config for experimentation
	private _getMaxPromptTokensOverride(chatModelInfo: IChatModelInformation): number {
		// check debug override ChatMaxTokenNum
		const chatMaxTokenNumOverride = this._configService.getConfig(ConfigKey.TeamInternal.DebugOverrideChatMaxTokenNum); // can only be set by internal users
		// Base 3 tokens for each OpenAI completion
		let modelLimit = -3;
		// if option is set, takes precedence over any other logic
		if (chatMaxTokenNumOverride > 0) {
			modelLimit += chatMaxTokenNumOverride;
			return modelLimit;
		}

		let experimentalOverrides: Record<string, number> = {};
		try {
			const expValue = this._expService.getTreatmentVariable<string>('copilotchat.contextWindows');
			experimentalOverrides = JSON.parse(expValue ?? '{}');
		} catch {
			// If the experiment service either is not available or returns a bad value we ignore the overrides
		}

		// If there's an experiment that takes precedence over what comes back from CAPI
		if (experimentalOverrides[chatModelInfo.id]) {
			modelLimit += experimentalOverrides[chatModelInfo.id];
			return modelLimit;
		}

		// Check if CAPI has prompt token limits and return those
		if (chatModelInfo.capabilities?.limits?.max_prompt_tokens) {
			modelLimit += chatModelInfo.capabilities.limits.max_prompt_tokens;
			return modelLimit;
		} else if (chatModelInfo.capabilities.limits?.max_context_window_tokens) {
			// Otherwise return the context window as the prompt tokens for cases where CAPI doesn't configure the prompt tokens
			modelLimit += chatModelInfo.capabilities.limits.max_context_window_tokens;
			return modelLimit;
		}

		return modelLimit;
	}

	private async _getErrorMessage(fallback: string): Promise<string> {
		try {
			const status = await this._octoKitService.getGitHubOutageStatus();
			if (status !== GitHubOutageStatus.None) {
				return 'Error fetching models! It appears that GitHub is experiencing an outage. Please check the [GitHub Status Page](https://githubstatus.com) for more info';
			}
		} catch {
			// Don't let status check failures block the original error
		}
		return fallback;
	}

	private _getShowInModelPickerOverride(resolvedModel: IModelAPIResponse): boolean {
		let modelPickerOverrides: Record<string, boolean> = {};
		const expResult = this._expService.getTreatmentVariable<string>('copilotchat.showInModelPicker');
		try {
			modelPickerOverrides = JSON.parse(expResult || '{}');
		} catch {
			// No-op if parsing experiment fails
		}

		return modelPickerOverrides[resolvedModel.id] ?? resolvedModel.model_picker_enabled;
	}
}

//#endregion
