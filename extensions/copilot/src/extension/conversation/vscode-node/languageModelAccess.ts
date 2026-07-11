/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Raw } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../platform/authentication/common/copilotToken';
import { IBlockedExtensionService } from '../../../platform/chat/common/blockedExtensionService';
import { ChatFetchResponseType, ChatLocation, getErrorDetailsFromChatFetchError } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { getTextPart } from '../../../platform/chat/common/globalStringUtils';
import { EmbeddingType, getWellKnownEmbeddingTypeInfo, IEmbeddingsComputer } from '../../../platform/embeddings/common/embeddingsComputer';
import { ChatEndpointFamily, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../platform/endpoint/common/endpointTypes';
import { encodeStatefulMarker } from '../../../platform/endpoint/common/statefulMarkerContainer';
import { AutoChatEndpoint } from '../../../platform/endpoint/node/autoChatEndpoint';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { CopilotChatEndpoint } from '../../../platform/endpoint/node/copilotChatEndpoint';
import { IEnvService, isScenarioAutomation } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { FinishedCallback, OpenAiFunctionTool, OptionalChatRequestParams } from '../../../platform/networking/common/fetch';
import { IChatEndpoint, IEndpoint } from '../../../platform/networking/common/networking';
import { APIUsage } from '../../../platform/networking/common/openai';
import { IOTelService, type OTelModelOptions } from '../../../platform/otel/common/otelService';
import { retrieveCapturingTokenByCorrelation, runWithCapturingToken } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { isEncryptedThinkingDelta } from '../../../platform/thinking/common/thinking';
import { BaseTokensPerCompletion } from '../../../platform/tokenizer/node/tokenizer';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { isBoolean, isDefined, isNumber, isString, isStringArray } from '../../../util/vs/base/common/types';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation as ApiChatLocation, ExtensionMode } from '../../../vscodeTypes';
import type { LMResponsePart } from '../../byok/common/byokProvider';
import { IExtensionContribution } from '../../common/contributions';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { isImageDataPart } from '../common/languageModelChatMessageHelpers';
import { LanguageModelAccessPrompt } from './languageModelAccessPrompt';
import { formatPricingLabel, formatTokenCount, getAutoModelDescription, getAutoModelDiscountLabel, getModelCapabilitiesDescription, buildReasoningEffortSchemaProperty } from '../common/languageModelAccess';

/**
 * Markers in the autoModelHint experiment variable that indicate the auto model
 * is routing to an experimental or evaluation model.
 */
const experimentalAutoModelHintMarkers = ['minimax', 'mp3yn0h7', 'yaqq2gxh'];

/**
 * Builds a configurationSchema for the model picker based on the endpoint's supported capabilities.
 * Models that support reasoning_effort get a "Thinking Effort" dropdown in the model picker UI.
 */
// Returns the available context size options for a model, or undefined if the model has no configurable context sizes. With a long_context surcharge, offers the default tier and the full window as an opt-in. Without a surcharge, `chat.preferLongContext.enabled` decides: enabled shows only the full window, disabled (default) still shows both so the smaller window stays selectable.
function getContextSizeOptions(endpoint: IChatEndpoint, preferLongContext: boolean): { value: number; description: string; isDefault: boolean }[] | undefined {
	const pricing = endpoint.tokenPricing;

	// Only offer a selector when CAPI provides a default context max,
	// which indicates a meaningful distinction between default and long context tiers.
	if (!pricing?.default.contextMax) {
		return undefined;
	}

	const defaultMax = pricing.default.contextMax;
	const fullMax = endpoint.modelMaxPromptTokens;

	// No point showing a selector if the default is already the full context
	if (defaultMax >= fullMax) {
		return undefined;
	}

	const hasLongContextSurcharge = !!pricing.longContext;

	// When both tiers cost the same and the user prefers long context, show only the full window as a non-switchable indicator. See microsoft/vscode#322950, microsoft/vscode#323116.
	if (preferLongContext && !hasLongContextSurcharge) {
		return [
			{ value: fullMax, description: vscode.l10n.t('Longer sessions'), isDefault: true },
		];
	}

	return [
		{ value: defaultMax, description: vscode.l10n.t('Default recommended context size'), isDefault: true },
		{
			value: fullMax,
			description: vscode.l10n.t('Longer sessions'),
			isDefault: false,
		},
	];
}

// Auto model delegates to different backends, so don't expose config pickers
function buildConfigurationSchema(endpoint: IChatEndpoint, preferLongContext: boolean): { configurationSchema?: vscode.LanguageModelConfigurationSchema } {
	if (endpoint instanceof AutoChatEndpoint) {
		return {};
	}

	const properties: Record<string, NonNullable<vscode.LanguageModelConfigurationSchema['properties']>[string]> = {};

	// Reasoning effort config
	const effortLevels = endpoint.supportsReasoningEffort;
	if (effortLevels && effortLevels.length > 1) {
		properties.reasoningEffort = buildReasoningEffortSchemaProperty(effortLevels, endpoint.family.toLowerCase());
	}

	// Context size config
	const contextSizeOptions = getContextSizeOptions(endpoint, preferLongContext);
	if (contextSizeOptions) {
		const defaultOption = contextSizeOptions.find(o => o.isDefault);
		properties.contextSize = {
			type: 'number',
			title: vscode.l10n.t('Context Size'),
			enum: contextSizeOptions.map(o => o.value),
			enumItemLabels: contextSizeOptions.map(o => formatTokenCount(o.value)),
			enumDescriptions: contextSizeOptions.map(o => o.description),
			default: defaultOption?.value,
			group: 'tokens',
		};
	}

	if (Object.keys(properties).length === 0) {
		return {};
	}

	return { configurationSchema: { properties } };
}

const utilityAliasFamilies: readonly ChatEndpointFamily[] = ['copilot-utility-small', 'copilot-utility'];

/**
 * Builds the {@link vscode.LanguageModelChatInformation} entry that publishes a
 * utility-family alias (e.g. `copilot-utility-small`) under the copilot vendor.
 *
 * If the endpoint is a Copilot endpoint and a matching entry exists in
 * {@link models} for its model id, that entry is cloned so the alias inherits
 * provider-specific metadata (including `requiresAuthorization`). Otherwise a
 * minimal entry is synthesized from the endpoint with `maxInputTokens` reduced
 * by both `baseCount` and {@link BaseTokensPerCompletion} to match what the
 * regular model entries report, and {@link requiresAuthorization} is applied so
 * the synthesized alias enforces the same model-access authorization as a
 * normal copilot model entry.
 */
export function buildUtilityAliasModelInfo(
	family: ChatEndpointFamily,
	endpoint: IChatEndpoint,
	models: readonly vscode.LanguageModelChatInformation[],
	baseCount: number,
	requiresAuthorization: vscode.LanguageModelChatInformation['requiresAuthorization'],
): { info: vscode.LanguageModelChatInformation; synthesized: boolean } {
	const base = endpoint instanceof CopilotChatEndpoint ? models.find(m => m.id === endpoint.model) : undefined;
	if (base) {
		return {
			synthesized: false,
			info: {
				...base,
				id: family,
				family,
				isUserSelectable: false,
				isDefault: false,
			},
		};
	}
	return {
		synthesized: true,
		info: {
			id: family,
			name: endpoint.name,
			family,
			version: endpoint.version,
			maxInputTokens: endpoint.modelMaxPromptTokens - baseCount - BaseTokensPerCompletion,
			maxOutputTokens: endpoint.maxOutputTokens,
			requiresAuthorization,
			isUserSelectable: false,
			isDefault: false,
			capabilities: {
				toolCalling: endpoint.supportsToolCalls,
				imageInput: endpoint.supportsVision,
			},
		},
	};
}

export class LanguageModelAccess extends Disposable implements IExtensionContribution {

	readonly id = 'languageModelAccess';

	readonly activationBlocker?: Promise<void>;

	private readonly _onDidChange = this._register(new Emitter<void>());
	private _currentModels: vscode.LanguageModelChatInformation[] = []; // Store current models for reference
	private _chatEndpoints: IChatEndpoint[] = [];
	/**
	 * Maps utility family aliases (e.g. `copilot-utility-small`,
	 * `copilot-utility`) to the resolved endpoint they were last published
	 * under. Lets {@link _getEndpointForModel} route alias lookups to the
	 * underlying endpoint without re-resolving the user setting.
	 */
	private _utilityAliasEndpoints: Map<string, IChatEndpoint> = new Map();
	// Overrides resolved outside model-info publication, reused on the next alias publish.
	private readonly _resolvedUtilityEndpoints = new Map<ChatEndpointFamily, { endpoint: IChatEndpoint; baseCount: number }>();
	private readonly _utilityOverridesRefresh = this._register(new MutableDisposable<CancellationTokenSource>());
	private _lmWrapper: CopilotLanguageModelWrapper;
	private _promptBaseCountCache: LanguageModelAccessPromptBaseCountCache;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IEmbeddingsComputer private readonly _embeddingsComputer: IEmbeddingsComputer,
		@IVSCodeExtensionContext private readonly _vsCodeExtensionContext: IVSCodeExtensionContext,
		@IAutomodeService private readonly _automodeService: IAutomodeService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._lmWrapper = this._instantiationService.createInstance(CopilotLanguageModelWrapper);
		this._promptBaseCountCache = this._instantiationService.createInstance(LanguageModelAccessPromptBaseCountCache);

		if (this._vsCodeExtensionContext.extensionMode === ExtensionMode.Test && !isScenarioAutomation) {
			this._logService.warn('[LanguageModelAccess] LanguageModels and Embeddings are NOT AVAILABLE in test mode.');
			return;
		}

		// initial
		this.activationBlocker = Promise.all([
			this._registerChatProvider(),
			this._registerEmbeddings(),
		]).then(() => { });
	}

	override dispose(): void {
		this._utilityOverridesRefresh.value?.cancel();
		super.dispose();
	}

	get currentModels(): vscode.LanguageModelChatInformation[] {
		return this._currentModels;
	}

	private async _registerChatProvider(): Promise<void> {
		const provider: vscode.LanguageModelChatProvider = {
			onDidChangeLanguageModelChatInformation: this._onDidChange.event,
			provideLanguageModelChatInformation: this._provideLanguageModelChatInfo.bind(this),
			provideLanguageModelChatResponse: this._provideLanguageModelChatResponse.bind(this),
			provideTokenCount: this._provideTokenCount.bind(this)
		};
		this._register(vscode.lm.registerLanguageModelChatProvider('copilot', provider));
		this._register(this._authenticationService.onDidAuthenticationChange(() => {
			if (!this._authenticationService.anyGitHubSession) {
				this._currentModels = [];
			}
			// Auth changed which means models could've changed. Fire the event
			this._onDidChange.fire();
		}));
		this._register(this._endpointProvider.onDidModelsRefresh(() => {
			// Drop stale resolutions; aliases are re-published once the refresh re-resolves them.
			this._resolvedUtilityEndpoints.clear();
			void this._refreshUtilityOverrides();
			this._onDidChange.fire();
		}));
	}

	private async _provideLanguageModelChatInfo(options: { silent: boolean }, token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
		const session = await this._getToken();
		if (!session) {
			// Return cached models until we have auth reacquired
			// We clear this list in onDidAuthenticationChange so signed out should still have model picker clear
			return this._currentModels;
		}

		const models: vscode.LanguageModelChatInformation[] = [];
		const allEndpoints = await this._endpointProvider.getAllChatEndpoints();
		if (!allEndpoints.length) {
			return this._currentModels;
		}
		const chatEndpoints = allEndpoints.filter(e => e.showInModelPicker || e.model === 'gpt-4o-mini');
		const autoEndpoint = await this._automodeService.resolveAutoModeEndpoint(undefined, allEndpoints);
		chatEndpoints.push(autoEndpoint);
		let defaultChatEndpoint: IChatEndpoint;
		const defaultExpModel = this._expService.getTreatmentVariable<string>('chat.defaultLanguageModel')?.replace('copilot/', '');
		if (this._authenticationService.copilotToken?.isNoAuthUser || !defaultExpModel || defaultExpModel === AutoChatEndpoint.pseudoModelId) {
			// No auth, no experiment, and exp that sets auto to default all get default model
			defaultChatEndpoint = autoEndpoint;
		} else {
			// Find exp default
			defaultChatEndpoint = chatEndpoints.find(e => e.model === defaultExpModel) || autoEndpoint;
		}

		const seenFamilies = new Set<string>();
		const preferLongContext = this._configurationService.getConfig(ConfigKey.PreferLongContext);

		for (const endpoint of chatEndpoints) {
			if (seenFamilies.has(endpoint.family) && !endpoint.showInModelPicker) {
				continue;
			}
			seenFamilies.add(endpoint.family);

			const sanitizedModelName = endpoint.name
				.replace(/\([^)]*\bcontext\)/gi, '')
				.trim();
			let modelTooltip: string | undefined;
			if (endpoint.degradationReason) {
				modelTooltip = endpoint.degradationReason;
			} else if (endpoint instanceof AutoChatEndpoint) {
				modelTooltip = getAutoModelDescription(endpoint.discountRange);
				const isOrgManaged = !!this._authenticationService.copilotToken?.isManagedPlan;
				const autoModeHint = this._expService.getTreatmentVariable<string>('copilotchat.autoModelHint');
				const showExperimentalHint = !isOrgManaged && !!autoModeHint && experimentalAutoModelHintMarkers.some(marker => autoModeHint.includes(marker));
				if (showExperimentalHint) {
					modelTooltip = `${modelTooltip} ${vscode.l10n.t('This model may be experimental or in evaluation.')}`;
				}
			} else {
				modelTooltip = getModelCapabilitiesDescription(endpoint);
			}

			// Counting tokens requires instantiating the tokenizers, which makes this process use a lot of memory.
			// Let's cache the results across extension activations
			const baseCount = await this._promptBaseCountCache.getBaseCount(endpoint);
			const multiplier = endpoint.multiplier !== undefined ? `${endpoint.multiplier}x` : undefined;
			let modelDetail: string | undefined;

			if (endpoint instanceof AutoChatEndpoint) {
				modelDetail = getAutoModelDiscountLabel(endpoint.discountRange);
			}
			if (endpoint.customModel) {
				const customModel = endpoint.customModel;
				modelDetail = customModel.owner_name;
				modelTooltip = vscode.l10n.t('{0} is contributed by {1} using {2}.', sanitizedModelName, customModel.owner_name, customModel.key_name);
			}

			const session = this._authenticationService.anyGitHubSession;
			const isDefault = endpoint === defaultChatEndpoint;

			const model: vscode.LanguageModelChatInformation = {
				id: endpoint instanceof AutoChatEndpoint ? AutoChatEndpoint.pseudoModelId : endpoint.model,
				name: endpoint instanceof AutoChatEndpoint ? 'Auto' : sanitizedModelName,
				family: endpoint.family,
				tooltip: modelTooltip,
				pricing: endpoint instanceof AutoChatEndpoint ? undefined : (multiplier ?? (endpoint.tokenPricing ? formatPricingLabel(endpoint.tokenPricing) : undefined)),
				inputCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.default.inputPrice,
				outputCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.default.outputPrice,
				cacheCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.default.cacheReadTokenPrice,
				cacheWriteCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.default.cacheWriteTokenPrice,
				longContextInputCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.longContext?.inputPrice,
				longContextOutputCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.longContext?.outputPrice,
				longContextCacheCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.longContext?.cacheReadTokenPrice,
				longContextCacheWriteCost: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.tokenPricing?.longContext?.cacheWriteTokenPrice,
				multiplierNumeric: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.multiplier,
				priceCategory: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.priceCategory,
				category: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.modelPickerCategory,
				detail: modelDetail,
				statusIcon: endpoint.degradationReason ? new vscode.ThemeIcon('warning') : undefined,
				version: endpoint.version,
				maxInputTokens: endpoint.modelMaxPromptTokens - baseCount - BaseTokensPerCompletion,
				maxOutputTokens: endpoint.maxOutputTokens,
				requiresAuthorization: session && { label: session.account.label },
				isDefault: {
					[ApiChatLocation.Panel]: isDefault,
					[ApiChatLocation.Terminal]: isDefault,
					[ApiChatLocation.Notebook]: isDefault,
					[ApiChatLocation.Editor]: endpoint instanceof AutoChatEndpoint, // inline chat gets 'Auto' by default
				},
				isUserSelectable: endpoint.showInModelPicker,
				warningText: endpoint instanceof AutoChatEndpoint ? undefined : (() => {
					const texts: Record<string, string> = { ...endpoint.warningText };
					if (endpoint.degradationReason) {
						texts['degradation'] = endpoint.degradationReason;
					}
					return Object.keys(texts).length > 0 ? texts : undefined;
				})(),
				promo: endpoint instanceof AutoChatEndpoint ? undefined : endpoint.promo,
				capabilities: {
					imageInput: endpoint instanceof AutoChatEndpoint ? true : endpoint.supportsVision,
					toolCalling: endpoint.supportsToolCalls,
				},
				...buildConfigurationSchema(endpoint, preferLongContext),
			};

			models.push(model);
		}

		this._currentModels = models;
		this._chatEndpoints = chatEndpoints;

		this._registerUtilityAliasModels(models);
		return models;
	}

	/**
	 * Publishes utility aliases from the resolved-endpoint cache. The cache is
	 * populated asynchronously by {@link _refreshUtilityOverrides} (the single
	 * gate that decides, per the BYOK/override policy, whether a family resolves
	 * to a model at all), so a family with no cached endpoint publishes nothing.
	 */
	private _registerUtilityAliasModels(
		models: vscode.LanguageModelChatInformation[],
	): void {
		this._utilityAliasEndpoints.clear();
		const session = this._authenticationService.anyGitHubSession;
		const requiresAuthorization = session ? { label: session.account.label } : undefined;

		for (const family of utilityAliasFamilies) {
			const cached = this._resolvedUtilityEndpoints.get(family);
			if (!cached) {
				continue;
			}
			const endpoint = cached.endpoint;
			this._utilityAliasEndpoints.set(family, endpoint);

			try {
				// Copilot defaults clone an existing entry; synthesized override aliases need baseCount.
				const aliasInfo = buildUtilityAliasModelInfo(family, endpoint, models, cached.baseCount, requiresAuthorization);
				this._logService.trace(`[LanguageModelAccess] Publishing alias '${family}' -> ${endpoint.model} (${aliasInfo.synthesized ? 'synthesized' : 'cloned'}, ${endpoint instanceof CopilotChatEndpoint ? 'copilot' : 'override'}).`);
				models.push(aliasInfo.info);
			} catch (err) {
				this._logService.warn(`[LanguageModelAccess] Failed to publish utility alias '${family}' -> ${endpoint.model}; skipping. Error: ${err}`);
			}
		}

		// Resolution may hang (override lookups, base-count tokenization), so keep it off
		// the model-info request path. Newly resolved endpoints are published on the next
		// request once `_refreshUtilityOverrides` fires `_onDidChange`.
		void this._refreshUtilityOverrides().catch(err => {
			this._logService.warn(`[LanguageModelAccess] Failed to refresh utility overrides: ${err}`);
		});
	}

	/**
	 * Resolves each utility family through {@link IEndpointProvider.getChatEndpoint},
	 * which applies the BYOK/override policy (returning the configured override, the
	 * built-in Copilot model, or throwing when no model should be used). Successful
	 * resolutions are cached for {@link _registerUtilityAliasModels} to publish.
	 */
	private async _refreshUtilityOverrides(): Promise<void> {
		this._utilityOverridesRefresh.value?.cancel();
		const cancellationSource = new CancellationTokenSource();
		this._utilityOverridesRefresh.value = cancellationSource;
		const token = cancellationSource.token;
		let didChange = false;
		for (const family of utilityAliasFamilies) {
			let resolved: IChatEndpoint | undefined;
			try {
				resolved = await this._endpointProvider.getChatEndpoint(family);
			} catch (err) {
				if (token.isCancellationRequested) {
					return;
				}
				// Expected when the policy declines a family (e.g. BYOK main model with no
				// configured utility model), so this is not necessarily a failure. The cache
				// is cleared on policy changes via `onDidModelsRefresh`, so leaving any prior
				// entry intact here only preserves a still-valid alias across transient errors.
				this._logService.trace(`[LanguageModelAccess] No utility alias resolved for '${family}' in background: ${err}`);
				continue;
			}
			if (token.isCancellationRequested) {
				return;
			}
			if (!resolved) {
				continue;
			}
			// Skip when the override resolved to the same endpoint that's
			// already published; no alias change needed.
			const published = this._utilityAliasEndpoints.get(family);
			if (published && published.model === resolved.model && published.modelProvider === resolved.modelProvider) {
				continue;
			}
			let baseCount: number;
			try {
				baseCount = await this._promptBaseCountCache.getBaseCount(resolved);
			} catch (err) {
				if (token.isCancellationRequested) {
					return;
				}
				this._logService.warn(`[LanguageModelAccess] Failed to compute baseCount for utility alias '${family}' -> ${resolved.model}; keeping previously-published alias. Error: ${err}`);
				continue;
			}
			if (token.isCancellationRequested) {
				return;
			}
			this._resolvedUtilityEndpoints.set(family, { endpoint: resolved, baseCount });
			didChange = true;
		}
		if (didChange) {
			this._onDidChange.fire();
		}
	}

	private async _getEndpointForModel(model: vscode.LanguageModelChatInformation) {
		if (model.id === AutoChatEndpoint.pseudoModelId) {
			const allEndpoints = await this._endpointProvider.getAllChatEndpoints();
			if (!allEndpoints.length) {
				return undefined;
			}
			return await this._automodeService.resolveAutoModeEndpoint(undefined, allEndpoints);
		}
		const aliasEndpoint = this._utilityAliasEndpoints.get(model.id);
		if (aliasEndpoint) {
			return aliasEndpoint;
		}
		return this._chatEndpoints.find(e => e.model === model.id);
	}

	private async _provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>,
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken
	): Promise<void> {
		let endpoint = await this._getEndpointForModel(model);
		if (!endpoint) {
			throw new Error(`Endpoint not found for model ${model.id}`);
		}

		// Apply context size override if configured
		const contextSize = options.modelConfiguration?.contextSize;
		if (typeof contextSize === 'number' && contextSize < endpoint.modelMaxPromptTokens) {
			endpoint = endpoint.cloneWithTokenOverride(contextSize);
		}

		return this._lmWrapper.provideLanguageModelResponse(endpoint, messages, {
			...options,
			modelOptions: options.modelOptions
		}, options.requestInitiator, progress, token);
	}

	private async _provideTokenCount(
		model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2,
		token: vscode.CancellationToken
	): Promise<number> {
		const endpoint = await this._getEndpointForModel(model);
		if (!endpoint) {
			throw new Error(`Endpoint not found for model ${model.id}`);
		}

		return this._lmWrapper.provideTokenCount(endpoint, text);
	}

	private async _registerEmbeddings(): Promise<void> {

		const dispo = this._register(new MutableDisposable());


		const update = async () => {

			if (!await this._getToken()) {
				dispo.clear();
				return;
			}

			const embeddingsComputer = this._embeddingsComputer;
			const embeddingType = EmbeddingType.text3small_512;
			const model = getWellKnownEmbeddingTypeInfo(embeddingType)?.model;
			if (!model) {
				throw new Error(`No model found for embedding type ${embeddingType.id}`);
			}

			dispo.clear();
			dispo.value = vscode.lm.registerEmbeddingsProvider(`copilot.${model}`, new class implements vscode.EmbeddingsProvider {
				async provideEmbeddings(input: string[], token: vscode.CancellationToken): Promise<vscode.Embedding[]> {
					const result = await embeddingsComputer.computeEmbeddings(embeddingType, input, {}, new TelemetryCorrelationId('EmbeddingsProvider::provideEmbeddings'), token);
					return result.values.map(embedding => ({ values: embedding.value.slice(0) }));
				}
			});
		};

		this._register(this._authenticationService.onDidAuthenticationChange(() => update()));
		await update();
	}

	private async _getToken(): Promise<CopilotToken | undefined> {
		if (!this._authenticationService.hasCopilotTokenSource) {
			this._logService.warn('[LanguageModelAccess] LanguageModel/Embeddings are not available without a Copilot token source');
			return undefined;
		}

		try {
			const copilotToken = await this._authenticationService.getCopilotToken();
			return copilotToken;
		} catch (e) {
			this._logService.warn('[LanguageModelAccess] LanguageModel/Embeddings are not available without auth token');
			this._logService.error(e);
			return undefined;
		}
	}
}

class LanguageModelAccessPromptBaseCountCache {
	constructor(
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvService private readonly _envService: IEnvService
	) { }

	public async getBaseCount(endpoint: IChatEndpoint): Promise<number> {
		const key = `lmBaseCount/${endpoint.model}`;
		const cached = this._extensionContext.globalState.get<{ extensionVersion: string; baseCount: number }>(key);
		if (cached && cached.extensionVersion === this._envService.getVersion() && typeof cached.baseCount === 'number') {
			return cached.baseCount;
		}

		const baseCount = await this._computeBaseCount(endpoint);
		// Store the computed value along with the extension version so we can
		// invalidate the cache when the extension is updated.
		try {
			await this._extensionContext.globalState.update(key, { extensionVersion: this._envService.getVersion(), baseCount });
		} catch (err) {
			// Best-effort cache update — don't fail the caller if persisting the
			// cache entry fails for any reason.
		}

		return baseCount;
	}

	private async _computeBaseCount(endpoint: IChatEndpoint): Promise<number> {
		const baseCount = await PromptRenderer.create(this._instantiationService, endpoint, LanguageModelAccessPrompt, { noSafety: false, messages: [] }).countTokens();
		return baseCount;
	}

}

/**
 * Exported for test
 */
export class CopilotLanguageModelWrapper extends Disposable {

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IBlockedExtensionService private readonly _blockedExtensionService: IBlockedExtensionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IEnvService private readonly _envService: IEnvService,
		@IOTelService private readonly _otelService: IOTelService,
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
	) {
		super();
	}

	private async _provideLanguageModelResponse(_endpoint: IChatEndpoint, _messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>, _options: vscode.ProvideLanguageModelChatResponseOptions, extensionId: string | undefined, callback: FinishedCallback, token: vscode.CancellationToken): Promise<APIUsage | undefined> {
		if (extensionId === 'core') {
			extensionId = undefined;
		}

		const extensionInfo = !extensionId ? { packageJSON: { version: this._envService.vscodeVersion } } : vscode.extensions.getExtension(extensionId, true);
		if (!extensionInfo || typeof extensionInfo.packageJSON.version !== 'string') {
			throw new Error('Invalid extension information');
		}
		const extensionVersion = <string>extensionInfo.packageJSON.version;

		const blockedExtensionMessage = vscode.l10n.t('The extension has been temporarily blocked due to making too many requests. Please try again later.');
		if (extensionId && this._blockedExtensionService.isExtensionBlocked(extensionId)) {
			throw vscode.LanguageModelError.Blocked(blockedExtensionMessage);
		}

		const toolTokenCount = _options.tools ? await this.countToolTokens(_endpoint, _options.tools) : 0;
		const baseCount = await PromptRenderer.create(this._instantiationService, _endpoint, LanguageModelAccessPrompt, { noSafety: false, messages: [] }).countTokens();
		const tokenLimit = _endpoint.modelMaxPromptTokens - baseCount - BaseTokensPerCompletion - toolTokenCount;

		this.validateRequest(_messages);
		if (_options.tools) {
			this.validateTools(_options.tools);
		}
		// Add safety rules to the prompt if it originates from outside the Copilot Chat extension, otherwise they already exist in the prompt.
		const { messages, tokenCount } = await PromptRenderer.create(this._instantiationService, {
			..._endpoint,
			modelMaxPromptTokens: tokenLimit
		}, LanguageModelAccessPrompt, { noSafety: extensionId === this._envService.extensionId, messages: _messages }).render();

		/* __GDPR__
			"languagemodelrequest" : {
				"owner": "jrieken",
				"comment": "Data about extensions using the language model",
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that is being used" },
				"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The extension identifier for which we make the request" },
				"extensionVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The extension version for which we make the request" },
				"tokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of tokens" },
				"tokenLimit": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of tokens that can be used" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent(
			'languagemodelrequest',
			{
				extensionId,
				extensionVersion,
				model: _endpoint.model
			},
			{
				tokenCount,
				tokenLimit
			}
		);

		// If no messages they got rendered out due to token limit
		if (messages.length === 0 || tokenCount > tokenLimit) {
			throw new Error('Message exceeds token limit.');
		}

		if (_options.tools && _options.tools.length > 128 && !_endpoint.supportsToolSearch) {
			throw new Error('Cannot have more than 128 tools per request.');
		}

		const endpoint: IChatEndpoint = new Proxy(_endpoint, {
			get: function (target, prop, receiver) {
				if (prop === 'getExtraHeaders') {
					return function () {
						const extraHeaders = target.getExtraHeaders?.() ?? {};
						if (!extensionId) {
							return extraHeaders;
						}
						return {
							...extraHeaders,
							'x-onbehalf-extension-id': `${extensionId}/${extensionVersion}`,
						};
					};
				}
				if (prop === 'acquireTokenizer') {
					return target.acquireTokenizer.bind(target);
				}
				return Reflect.get(target, prop, receiver);
			}
		});


		const options: OptionalChatRequestParams = LanguageModelOptions.Default.convert(_options.modelOptions ?? {});
		const telemetryProperties = { messageSource: `api.${extensionId}` };

		options.tools = _options.tools?.map((tool): OpenAiFunctionTool => {
			return {
				type: 'function',
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined
				}
			};
		});
		if (_options.toolMode === vscode.LanguageModelChatToolMode.Required && _options.tools?.length && _options.tools.length > 1) {
			throw new Error('LanguageModelChatToolMode.Required is not supported with more than one tool');
		}

		options.tool_choice = _options.toolMode === vscode.LanguageModelChatToolMode.Required && _options.tools?.length ?
			{ type: 'function', function: { name: _options.tools[0].name } } :
			undefined;

		// Restore CapturingToken context if correlation ID was passed through modelOptions.
		// This handles BYOK providers where the original AsyncLocalStorage context was lost
		// when crossing the VS Code IPC boundary.
		const correlationId = (_options as { modelOptions?: OTelModelOptions }).modelOptions?._capturingTokenCorrelationId;
		const capturingToken = correlationId ? retrieveCapturingTokenByCorrelation(correlationId) : undefined;

		// Restore OTel trace context if passed through modelOptions.
		// This links the wrapper's chat span back to the original invoke_agent trace.
		const parentTraceContext = (_options as { modelOptions?: OTelModelOptions }).modelOptions?._otelTraceContext ?? undefined;

		const makeRequest = () => endpoint.makeChatRequest2({
			debugName: 'copilotLanguageModelWrapper',
			messages,
			finishedCb: callback,
			location: ChatLocation.Other,
			source: { extensionId },
			requestOptions: options,
			userInitiatedRequest: !!extensionId,
			telemetryProperties,
			modelCapabilities: {
				reasoningEffort: typeof _options.modelConfiguration?.reasoningEffort === 'string' ? _options.modelConfiguration.reasoningEffort : undefined,
			},
		}, token);

		// Run request within the parent OTel context (no extra span) so chat spans in chatMLFetcher inherit the agent trace
		const wrappedRequest = parentTraceContext
			? () => this._otelService.runWithTraceContext(parentTraceContext, async () => {
				return capturingToken
					? await runWithCapturingToken(capturingToken, makeRequest)
					: await makeRequest();
			})
			: () => capturingToken
				? runWithCapturingToken(capturingToken, makeRequest)
				: makeRequest();

		const result = await wrappedRequest();

		if (result.type === ChatFetchResponseType.Length) {
			// The model stopped generating because it hit the length/context-window limit
			// (finish_reason "length"). The partial text has already been streamed to the
			// consumer via the finished callback, so treat this as a successful (truncated)
			// response instead of throwing "Response too long." and discarding the output.
			this._logService.warn(`[LanguageModelAccess] Response from model '${_endpoint.model}' was truncated because it hit the length limit; returning the partial response.`);
			return undefined;
		}

		if (result.type !== ChatFetchResponseType.Success) {
			if (result.type === ChatFetchResponseType.ExtensionBlocked) {
				if (extensionId) {
					this._blockedExtensionService.reportBlockedExtension(extensionId, result.retryAfter);
				}

				throw vscode.LanguageModelError.Blocked(blockedExtensionMessage);
			} else if (result.type === ChatFetchResponseType.QuotaExceeded) {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const details = getErrorDetailsFromChatFetchError(result, this._authenticationService.copilotToken?.copilotPlan, outageStatus, this._authenticationService.copilotToken?.tokenBasedBilling, this._authenticationService.copilotToken?.quotaInfo.quota_reset_date);
				const err = new vscode.LanguageModelError(details.message);
				err.name = 'ChatQuotaExceeded';
				throw err;
			} else if (result.type === ChatFetchResponseType.RateLimited) {
				const err = new Error(result.reason);
				err.name = 'ChatRateLimited';
				throw err;
			}

			throw new Error(result.reason);
		}

		this._telemetryService.sendInternalMSFTTelemetryEvent(
			'languagemodelrequest',
			{
				extensionId,
				extensionVersion,
				requestid: result.requestId,
				query: getTextPart(messages[messages.length - 1].content),
				model: _endpoint.model
			},
			{
				tokenCount,
				tokenLimit
			}
		);

		return result.usage;
	}

	async provideLanguageModelResponse(endpoint: IChatEndpoint, messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>, options: vscode.ProvideLanguageModelChatResponseOptions, extensionId: string | undefined, progress: vscode.Progress<LMResponsePart>, token: vscode.CancellationToken): Promise<void> {
		let thinkingActive = false;
		const finishCallback: FinishedCallback = async (_text, index, delta): Promise<undefined> => {
			if (delta.thinking) {
				// Show thinking progress for unencrypted thinking deltas
				if (!isEncryptedThinkingDelta(delta.thinking)) {
					const text = delta.thinking.text ?? '';
					progress.report(new vscode.LanguageModelThinkingPart(text, delta.thinking.id, delta.thinking.metadata));
					thinkingActive = true;
				}
			} else if (thinkingActive) {
				progress.report(new vscode.LanguageModelThinkingPart('', '', { vscode_reasoning_done: true }));
				thinkingActive = false;
			}
			if (delta.text) {
				progress.report(new vscode.LanguageModelTextPart(delta.text));
			}
			if (delta.copilotToolCalls) {
				for (const call of delta.copilotToolCalls) {
					// Anthropic models send "" (empty string) for tools with no parameters.
					let parameters: object;
					try {
						parameters = JSON.parse(call.arguments || '{}');
					} catch (err) {
						// The model can stream malformed JSON for tool arguments. Log it for
						// diagnostics and fall back to empty parameters so the tool call is still
						// surfaced to the extension (matching other tool-call consumers) instead of
						// leaking an unhandled rejection out of this fire-and-forget callback.
						this._logService.error(err, `Got invalid JSON for tool call: ${call.arguments}`);
						parameters = {};
					}
					progress.report(new vscode.LanguageModelToolCallPart(call.id, call.name, parameters));
				}
			}

			if (delta.statefulMarker) {
				progress.report(
					new vscode.LanguageModelDataPart(encodeStatefulMarker(endpoint.model, delta.statefulMarker), CustomDataPartMimeTypes.StatefulMarker)
				);
			}

			return undefined;
		};
		const usage = await this._provideLanguageModelResponse(endpoint, messages, options, extensionId, finishCallback, token);
		if (usage) {
			progress.report(new vscode.LanguageModelDataPart(new TextEncoder().encode(JSON.stringify(usage)), CustomDataPartMimeTypes.Usage));
		}
	}

	async provideTokenCount(endpoint: IEndpoint, message: string | vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2): Promise<number> {
		if (typeof message === 'string') {
			return endpoint.acquireTokenizer().tokenLength(message);
		} else {
			let raw: Raw.ChatMessage;

			const content = message.content.map((part): Raw.ChatCompletionContentPart | undefined => {
				if (part instanceof vscode.LanguageModelTextPart) {
					return { type: Raw.ChatCompletionContentPartKind.Text, text: part.value };
				} else if (part instanceof vscode.LanguageModelDataPart && part.mimeType === 'application/pdf') {
					return { type: Raw.ChatCompletionContentPartKind.Document, documentData: { data: Buffer.from(part.data).toString('base64'), mediaType: part.mimeType } };
				} else if (isImageDataPart(part)) {
					return { type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64url')}` } };
				} else {
					return undefined;
				}
			}).filter(isDefined);
			switch (message.role) {
				case vscode.LanguageModelChatMessageRole.User:
					raw = { role: Raw.ChatRole.User, content, name: message.name };
					break;
				case vscode.LanguageModelChatMessageRole.System:
					raw = { role: Raw.ChatRole.Assistant, content, name: message.name };
					break;
				case vscode.LanguageModelChatMessageRole.Assistant:
					raw = {
						role: Raw.ChatRole.Assistant,
						content,
						name: message.name,
						toolCalls: message.content
							.filter(part => part instanceof vscode.LanguageModelToolCallPart)
							.map(part => part as vscode.LanguageModelToolCallPart)
							.map(part => ({ function: { name: part.name, arguments: JSON.stringify(part.input) }, id: part.callId, type: 'function' })),
					};
					break;
				default:
					return 0;
			}

			return endpoint.acquireTokenizer().countMessageTokens(raw);
		}
	}

	private validateTools(tools: readonly vscode.LanguageModelChatTool[]): void {
		for (const tool of tools) {
			if (!tool.name.match(/^[\w-]+$/)) {
				throw new Error(`Invalid tool name "${tool.name}": only alphanumeric characters, hyphens, and underscores are allowed.`);
			}
		}
	}

	private async countToolTokens(endpoint: IChatEndpoint, tools: readonly vscode.LanguageModelChatTool[]): Promise<number> {
		return await endpoint.acquireTokenizer().countToolTokens(tools);
	}

	private validateRequest(_messages: Array<vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2>): void {
		const lastMessage = _messages.at(-1);
		if (!lastMessage) {
			throw new Error('Invalid request: no messages.');
		}

		_messages.forEach((message, i) => {
			if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
				// Filter out DataPart since it does not share the same value type and does not have callId, function, etc.
				const filteredContent = message.content.filter(part => part instanceof vscode.LanguageModelDataPart);
				const toolCallIds = new Set(filteredContent
					.filter(part => part instanceof vscode.LanguageModelToolCallPart)
					.map(part => part.callId));
				let nextMessageIdx = i + 1;
				const errMsg = 'Invalid request: Tool call part must be followed by a User message with a LanguageModelToolResultPart with a matching callId.';
				while (toolCallIds.size > 0) {
					const nextMessage = _messages.at(nextMessageIdx++);
					if (!nextMessage || nextMessage.role !== vscode.LanguageModelChatMessageRole.User) {
						throw new Error(errMsg);
					}

					nextMessage.content.forEach(part => {
						if (!(part instanceof vscode.LanguageModelToolResultPart2 || part instanceof vscode.LanguageModelToolResultPart)) {
							throw new Error(errMsg);
						}

						toolCallIds.delete(part.callId);
					});
				}
			}
		});
	}
}


function or(...checks: ((value: unknown) => boolean)[]): (value: unknown) => boolean {
	return (value) => checks.some(check => check(value));
}

class LanguageModelOptions {

	private static _defaultDesc: Record<string, (value: unknown) => boolean> = {
		stop: or(isStringArray, isString),
		temperature: isNumber,
		max_tokens: isNumber,
		frequency_penalty: isNumber,
		presence_penalty: isNumber,
	};

	static Default = new LanguageModelOptions({ ...this._defaultDesc });

	constructor(private _description: Record<string, (value: unknown) => boolean>) { }

	convert(options: { [name: string]: unknown }): Record<string, number | boolean | string> {
		const result: Record<string, number | boolean | string> = {};
		for (const key in this._description) {
			const isValid = this._description[key];
			const value = options[key];
			if (value !== null && value !== undefined && isValid(value)) {
				// Type guards ensure we only add values of the correct type
				if (isNumber(value) || isBoolean(value) || isString(value)) {
					result[key] = value;
				}
			}
		}
		return result;
	}
}
