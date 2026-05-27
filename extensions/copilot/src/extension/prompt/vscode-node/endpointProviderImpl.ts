/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChat, lm, type ChatRequest } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, EmbeddingsEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { AutoChatEndpoint } from '../../../platform/endpoint/node/autoChatEndpoint';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { CopilotChatEndpoint, CopilotUtilityChatEndpoint, CopilotUtilitySmallChatEndpoint } from '../../../platform/endpoint/node/copilotChatEndpoint';
import { EmbeddingEndpoint } from '../../../platform/endpoint/node/embeddingsEndpoint';
import { IModelMetadataFetcher, ModelMetadataFetcher } from '../../../platform/endpoint/node/modelMetadataFetcher';
import { ExtensionContributedChatEndpoint } from '../../../platform/endpoint/vscode-node/extChatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';


export class ProductionEndpointProvider extends Disposable implements IEndpointProvider {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidModelsRefresh = this._register(new Emitter<void>());
	readonly onDidModelsRefresh: Event<void> = this._onDidModelsRefresh.event;

	private _chatEndpoints: Map<string, IChatEndpoint> = new Map();
	private _embeddingEndpoints: Map<string, IEmbeddingsEndpoint> = new Map();
	private readonly _modelFetcher: IModelMetadataFetcher;

	constructor(
		@IAutomodeService private readonly _autoModeService: IAutomodeService,
		@ILogService protected readonly _logService: ILogService,
		@IConfigurationService protected readonly _configService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IAuthenticationService protected readonly _authService: IAuthenticationService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._modelFetcher = this._instantiationService.createInstance(ModelMetadataFetcher,
			false,
		);

		// When new models come in from CAPI we want to clear our local caches and let the endpoints be recreated since there may be new info
		this._register(this._modelFetcher.onDidModelsRefresh(() => {
			this._chatEndpoints.clear();
			this._embeddingEndpoints.clear();
			this._onDidModelsRefresh.fire();
		}));

		// When the user changes their utility model overrides we need to invalidate any
		// previously-resolved utility alias endpoints so the next request re-resolves.
		this._register(this._configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ProductionEndpointProvider.UTILITY_MODEL_CONFIG_KEY) || e.affectsConfiguration(ProductionEndpointProvider.UTILITY_SMALL_MODEL_CONFIG_KEY)) {
				this._logService.trace(`[ProductionEndpointProvider] Utility model override changed; invalidating alias endpoints.`);
				// Clear telemetry fingerprints so a re-applied override emits
				// once for its new value.
				this._lastOverrideTelemetryFingerprint.clear();
				this._onDidModelsRefresh.fire();
			}
		}));

	}

	// NOTE: Keep in sync with `ChatConfiguration.UtilityModel` /
	// `ChatConfiguration.UtilitySmallModel` in
	// `src/vs/workbench/contrib/chat/common/constants.ts`. The setting value
	// is encoded as `${vendor}/${id}` by
	// `defaultModelContribution.ts` (storageFormat: 'vendorAndId'). Both
	// fields are stable identifiers usable directly with
	// `vscode.lm.selectChatModels({ vendor, id })`.
	private static readonly UTILITY_MODEL_CONFIG_KEY = 'chat.utilityModel';
	private static readonly UTILITY_SMALL_MODEL_CONFIG_KEY = 'chat.utilitySmallModel';

	/**
	 * Per-family marker recording that we already emitted a telemetry event
	 * for the currently-applied override. Used to dedupe so we emit at most
	 * once per family per override value. Cleared when the relevant setting
	 * changes.
	 */
	private readonly _lastOverrideTelemetryFingerprint = new Map<ChatEndpointFamily, string>();

	private getOrCreateChatEndpointInstance(modelMetadata: IChatModelInformation): IChatEndpoint {
		const modelId = modelMetadata.id;
		let chatEndpoint = this._chatEndpoints.get(modelId);
		if (!chatEndpoint) {
			chatEndpoint = this._instantiationService.createInstance(CopilotChatEndpoint, modelMetadata);
			this._chatEndpoints.set(modelId, chatEndpoint);
		}
		return chatEndpoint;
	}

	async getChatEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		this._logService.trace(`Resolving chat model`);

		if (typeof requestOrFamilyOrModel === 'string') {
			return this._resolveUtilityFamily(requestOrFamilyOrModel);
		}

		const model = 'model' in requestOrFamilyOrModel ? requestOrFamilyOrModel.model : requestOrFamilyOrModel;

		if (!model) {
			return this.getChatEndpoint('copilot-utility');
		}

		if (model.vendor !== 'copilot') {
			return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
		}

		if (model.id === AutoChatEndpoint.pseudoModelId) {
			try {
				const allEndpoints = await this.getAllChatEndpoints();
				return this._autoModeService.resolveAutoModeEndpoint(requestOrFamilyOrModel as ChatRequest, allEndpoints);
			} catch {
				return this.getChatEndpoint('copilot-utility');
			}
		}

		const modelMetadata = await this._modelFetcher.getChatModelFromApiModel(model);
		// If we fail to resolve a model since this is panel we give copilot utility. This really should never happen as the picker is powered by the same service.
		return modelMetadata ? this.getOrCreateChatEndpointInstance(modelMetadata) : this.getChatEndpoint('copilot-utility');
	}

	/**
	 * Resolves an internal utility family (`copilot-utility-small` /
	 * `copilot-utility`) to a concrete `CopilotChatEndpoint`. The model
	 * selection for each family lives in the corresponding resolver
	 * class so callers don't need to know which CAPI family backs each
	 * purpose.

	 */
	private async _resolveUtilityFamily(family: ChatEndpointFamily): Promise<IChatEndpoint> {
		const override = await this._resolveUtilityOverride(family);
		if (override) {
			return override;
		}
		if (family === 'copilot-utility-small') {
			return CopilotUtilitySmallChatEndpoint.resolve(this._modelFetcher, this._instantiationService);
		} else if (family === 'copilot-utility') {
			return CopilotUtilityChatEndpoint.resolve(this._modelFetcher, this._instantiationService);
		} else {
			throw new Error(`Unrecognized chat endpoint family ${family}`);
		}
	}

	/**
	 * Resolves the user's `chat.utilityModel` / `chat.utilitySmallModel`
	 * override (if any) to a concrete chat endpoint.
	 * Returns `undefined` if no override is configured, if the value is
	 * malformed, if no matching model is currently available, or if the
	 * lookup throws.
	 */
	private async _resolveUtilityOverride(family: ChatEndpointFamily): Promise<IChatEndpoint | undefined> {
		let configKey: string;
		if (family === 'copilot-utility-small') {
			configKey = ProductionEndpointProvider.UTILITY_SMALL_MODEL_CONFIG_KEY;
		} else if (family === 'copilot-utility') {
			configKey = ProductionEndpointProvider.UTILITY_MODEL_CONFIG_KEY;
		} else {
			return undefined;
		}

		const raw = this._configService.getNonExtensionConfig<unknown>(configKey);
		if (typeof raw !== 'string' || raw.length === 0) {
			if (raw !== undefined && typeof raw !== 'string') {
				this._logService.warn(`[ProductionEndpointProvider] Ignoring non-string ${configKey} override of type '${typeof raw}'.`);
			}
			return undefined;
		}

		const slashIdx = raw.indexOf('/');
		if (slashIdx <= 0 || slashIdx >= raw.length - 1) {
			this._logService.warn(`[ProductionEndpointProvider] Ignoring malformed ${configKey} override: '${raw}' (expected '\${vendor}/\${id}').`);
			return undefined;
		}
		const vendor = raw.substring(0, slashIdx);
		const id = raw.substring(slashIdx + 1);

		// For copilot-vendor overrides, resolve directly through the model
		// fetcher. Going through `lm.selectChatModels` would re-enter the
		// language-model service for the `copilot` vendor, which is held by
		// `_resolveLMSequencer` whenever the copilot LM provider is in the
		// middle of preparing its model list (which is exactly when this
		// resolution path runs as part of utility-alias publishing). That
		// re-entrancy deadlocks the picker.
		if (vendor === 'copilot') {
			let allModels: IChatModelInformation[];
			try {
				allModels = await this._modelFetcher.getAllChatModels();
			} catch (err) {
				this._logService.warn(`[ProductionEndpointProvider] Failed to fetch copilot models for ${configKey} override '${raw}'; falling back to default. Error: ${err}`);
				return undefined;
			}
			const matches = allModels.filter(m => m.id === id);
			if (matches.length === 0) {
				this._logService.warn(`[ProductionEndpointProvider] No copilot model matched ${configKey} override '${raw}'; falling back to default.`);
				return undefined;
			}
			if (matches.length > 1) {
				this._logService.warn(`[ProductionEndpointProvider] ${configKey} override '${raw}' matched ${matches.length} copilot models; ignoring (override is ambiguous).`);
				return undefined;
			}
			const modelMetadata = matches[0];
			this._logService.trace(`[ProductionEndpointProvider] Applying ${configKey} override: copilot/${modelMetadata.id}`);
			this._reportOverrideAppliedTelemetry(family);
			return this.getOrCreateChatEndpointInstance(modelMetadata);
		}

		let models: readonly LanguageModelChat[];
		try {
			models = await lm.selectChatModels({ vendor, id });
		} catch (err) {
			this._logService.warn(`[ProductionEndpointProvider] Failed to resolve ${configKey} override '${raw}'; falling back to default. Error: ${err}`);
			return undefined;
		}
		if (models.length === 0) {
			this._logService.warn(`[ProductionEndpointProvider] No model matched ${configKey} override '${raw}'; falling back to default.`);
			return undefined;
		}
		if (models.length > 1) {
			this._logService.warn(`[ProductionEndpointProvider] ${configKey} override '${raw}' matched ${models.length} models; ignoring (override is ambiguous).`);
			return undefined;
		}
		const model = models[0];

		this._logService.trace(`[ProductionEndpointProvider] Applying ${configKey} override: ${model.vendor}/${model.id}`);
		this._reportOverrideAppliedTelemetry(family);
		return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
	}

	private _reportOverrideAppliedTelemetry(family: ChatEndpointFamily): void {
		if (this._lastOverrideTelemetryFingerprint.has(family)) {
			return;
		}
		this._lastOverrideTelemetryFingerprint.set(family, 'applied');

		/* __GDPR__
			"chat.utilityModelOverride" : {
				"owner": "vrbhardw",
				"comment": "Tracks adoption of the chat.utilityModel / chat.utilitySmallModel settings. Emitted at most once per family per session when the configured override successfully resolves to a model.",
				"family": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Which utility slot was resolved: 'copilot-utility' or 'copilot-utility-small'." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent(
			'chat.utilityModelOverride',
			{
				family,
			},
		);
	}

	async getEmbeddingsEndpoint(family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		this._logService.trace(`Resolving embedding model`);
		const modelMetadata = await this._modelFetcher.getEmbeddingsModel('text-embedding-3-small');
		const model = await this.getOrCreateEmbeddingEndpointInstance(modelMetadata);
		this._logService.trace(`Resolved embedding model`);
		return model;
	}

	private async getOrCreateEmbeddingEndpointInstance(modelMetadata: IEmbeddingModelInformation): Promise<IEmbeddingsEndpoint> {
		const modelId = 'text-embedding-3-small';
		let embeddingEndpoint = this._embeddingEndpoints.get(modelId);
		if (!embeddingEndpoint) {
			embeddingEndpoint = this._instantiationService.createInstance(EmbeddingEndpoint, modelMetadata);
			this._embeddingEndpoints.set(modelId, embeddingEndpoint);
		}
		return embeddingEndpoint;
	}

	async getAllCompletionModels(forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		return this._modelFetcher.getAllCompletionModels(forceRefresh ?? false);
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		const models: IChatModelInformation[] = await this._modelFetcher.getAllChatModels();
		return models.map(model => this.getOrCreateChatEndpointInstance(model));
	}
}
