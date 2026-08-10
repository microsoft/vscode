/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import type { ChatRequest } from 'vscode';
import { FetchedValue } from '../../../shared-fetch-utils/common/fetchedValue';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, type Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableMap } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../../vscodeTypes';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { getImageTelemetryEventMeasurements, getImageTelemetryMeasurementsFromReferences, type ImageTelemetryMeasurements } from '../../image/common/imageTelemetry';
import { ILogService } from '../../log/common/logService';
import { createCapiClientFetchedValue } from '../../networking/common/capiClientFetchedValue';
import { isAbortError } from '../../networking/common/fetcherService';
import { IChatEndpoint } from '../../networking/common/networking';
import { IRequestLogger } from '../../requestLogger/common/requestLogger';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AUTO_MODE_TIER_PROPERTY, autoModeTiers, defaultAutoModeTier, inlineChatAutoModeTier, isSelectableAutoModeTier, type AutoModeTier } from '../common/autoModeTiers';
import { ICAPIClientService } from '../common/capiClient';
import type { IChatModelCapabilities, IChatModelInformation } from '../common/endpointProvider';
import { AutoChatEndpoint } from './autoChatEndpoint';
import { AutoV2Error, AutoV2Fetcher, type AutoV2SelectedModel } from './autoV2Fetcher';
import { CopilotChatEndpoint } from './copilotChatEndpoint';
import { RouterDecisionError, RouterDecisionFetcher, RoutingContextSignals } from './routerDecisionFetcher';

interface AutoModeAPIResponse {
	available_models: string[];
	expires_at: number;
	discounted_costs?: { [key: string]: number };
	session_token: string;
}

interface AutoV2CacheEntry {
	endpoint: AutoChatEndpoint;
	sessionToken: string;
	/** UNIX seconds at which `sessionToken` expires. */
	expiresAt: number;
	lastRoutedPrompt?: string;
	/** Routing profile the session was resolved with; a change re-routes. `undefined` while tiers are disabled. */
	tier: AutoModeTier | undefined;
	turnCount: number;
	needsReEval: boolean;
}

interface AutoModelCacheEntry {
	endpoint: AutoChatEndpoint;
	tokenBank: AutoModeTokenBank;
	lastSessionToken?: string;
	lastRoutedPrompt?: string;
	routerFallbackReason?: string;
	turnCount: number;
	needsReEval: boolean;
}

class AutoModeTokenBank extends Disposable {
	private readonly _fetchedValue: FetchedValue<AutoModeAPIResponse>;
	private _usedSinceLastFetch = false;

	constructor(
		public debugName: string,
		location: ChatLocation,
		capiClientService: ICAPIClientService,
		authService: IAuthenticationService,
		_logService: ILogService,
		expService: IExperimentationService,
		envService: IEnvService,
	) {
		super();

		const expName = location === ChatLocation.Editor
			? 'copilotchat.autoModelHint.editor'
			: 'copilotchat.autoModelHint';

		this._fetchedValue = this._register(createCapiClientFetchedValue<AutoModeAPIResponse>(capiClientService, envService, {
			request: async () => {
				const authToken = (await authService.getCopilotToken()).token;
				const extValue = expService.getTreatmentVariable<string>(expName);
				const model_hints = [extValue || 'auto'];
				if (location === ChatLocation.Editor && model_hints[0] !== 'auto') {
					model_hints.push('auto');
				}
				return {
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${authToken}`,
					},
					method: 'POST' as const,
					json: { auto_mode: { model_hints } },
				};
			},
			requestMetadata: { type: RequestType.AutoModels },
			parseResponse: async (res) => {
				if (res.status < 200 || res.status >= 300) {
					const text = await res.text().catch(() => '');
					throw new Error(`AutoMode token response status: ${res.status}${text ? `, body: ${text}` : ''}`);
				}
				const data = await res.json() as AutoModeAPIResponse;
				this._usedSinceLastFetch = false;
				return data;
			},
			isStale: (token) => {
				if (!this._usedSinceLastFetch) {
					return false;
				}
				return token.expires_at * 1000 - Date.now() < 5 * 60 * 1000;
			},
			keepCacheHot: true,
		}));
	}

	async getToken(): Promise<AutoModeAPIResponse> {
		this._usedSinceLastFetch = true;
		return this._fetchedValue.resolve();
	}
}

/** Surfaces that default to the latency-oriented tier rather than {@link defaultAutoModeTier}. */
const inlineChatLocations: ReadonlySet<ChatLocation> = new Set([ChatLocation.Editor, ChatLocation.Terminal, ChatLocation.Notebook]);

/**
 * The subset of {@link ChatRequest} auto mode reads when routing. Callers that
 * have a real `ChatRequest` pass it directly; callers that do not (e.g. the
 * `vscode.lm` provider, which has no `ChatRequest`) can build this shape
 * without fabricating the rest of the interface.
 */
export interface IAutoModeRoutingRequest {
	readonly prompt: string;
	readonly id?: string;
	readonly location?: ChatLocation;
	readonly sessionId?: string;
	readonly sessionResource?: { toString(): string };
	readonly references?: readonly { readonly value: unknown }[];
	/** The picker configuration for the Auto model, which carries the selected tier. */
	readonly modelConfiguration?: { readonly [key: string]: unknown };
}

export interface AutoModeRoutingDecision {
	resolvedModel: string;
	resolvedModelName: string;
	predictedLabel: 'needs_reasoning' | 'no_reasoning' | 'fallback';
	confidence: number;
}

export const IAutomodeService = createServiceIdentifier<IAutomodeService>('IAutomodeService');

/**
 * Discount metadata for the "Auto" model picker entry, as fractions
 * (e.g. `0.1` for 10% off).
 */
export interface AutoModePickerMetadata {
	discountRange: { low: number; high: number };
}

export interface IAutomodeService {
	readonly _serviceBrand: undefined;

	resolveAutoModeEndpoint(chatRequest: IAutoModeRoutingRequest | undefined, knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint>;

	/**
	 * Resolves the endpoint backing the "Auto" model picker entry. The picker
	 * has no prompt, so this only carries display metadata.
	 */
	resolveAutoModePickerEndpoint(knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint>;

	/**
	 * Discount metadata for the "Auto" picker entry, derived from the
	 * `billing.auto_discount` each model advertises in `/models`.
	 */
	getAutoPickerMetadata(knownEndpoints: IChatEndpoint[]): AutoModePickerMetadata;

	/**
	 * Whether the Auto model should offer the tier picker. Tiers are a `POST /auto`
	 * concept, so the picker has to be withdrawn once routing falls back to the
	 * legacy flow. Changes are announced by {@link onDidChangeAutoModeTierSupport}.
	 */
	areAutoModeTiersSupported(): boolean;

	/**
	 * Fires when {@link areAutoModeTiersSupported} changes, so the Auto model's
	 * configuration schema can be republished.
	 */
	readonly onDidChangeAutoModeTierSupport: Event<void>;

	/**
	 * Returns the routing decision from the last call to {@link resolveAutoModeEndpoint},
	 * or `undefined` if the router was not used (e.g. skipped, fallback, or non-auto model).
	 * Cleared after reading.
	 */
	consumeLastRoutingDecision(): AutoModeRoutingDecision | undefined;

	/**
	 * Marks the router cache for this conversation as needing re-evaluation.
	 * The next call to {@link resolveAutoModeEndpoint} will re-run the router
	 * instead of returning the cached endpoint.
	 */
	invalidateRouterCache(chatRequest: IAutoModeRoutingRequest): void;
}

export class AutomodeService extends Disposable implements IAutomodeService {
	readonly _serviceBrand: undefined;
	private readonly _autoModelCache: Map<string, AutoModelCacheEntry> = new Map();
	private readonly _autoV2Cache: Map<string, AutoV2CacheEntry> = new Map();
	private _reserveTokens: DisposableMap<ChatLocation, AutoModeTokenBank> = new DisposableMap();
	private readonly _routerDecisionFetcher: RouterDecisionFetcher;
	private readonly _autoV2Fetcher: AutoV2Fetcher;
	private _lastRoutingDecision: AutoModeRoutingDecision | undefined;
	/** Set on a 404 (API-version or feature-flag gate); pins us to V1. */
	private _autoV2Unavailable = false;
	/** Upper bound on live V2 sessions. See {@link _pruneAutoV2Cache}. */
	private static readonly AUTO_V2_CACHE_MAX_ENTRIES = 50;
	private readonly _onDidChangeAutoModeTierSupport = this._register(new Emitter<void>());
	readonly onDidChangeAutoModeTierSupport = this._onDidChangeAutoModeTierSupport.event;
	/** Last announced {@link areAutoModeTiersSupported}. See {@link _updateAutoModeTierSupport}. */
	private _tierSupportAnnounced = false;

	constructor(
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IEnvService private readonly _envService: IEnvService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._tierSupportAnnounced = this.areAutoModeTiersSupported();
		// Covers both settings and their experiment treatments: a treatment
		// refresh is published as a configuration change.
		this._register(this._configurationService.onDidChangeConfiguration(() => this._updateAutoModeTierSupport()));
		this._register(this._authService.onDidAuthenticationChange(() => {
			for (const entry of this._autoModelCache.values()) {
				entry.tokenBank.dispose();
			}
			this._autoModelCache.clear();
			this._autoV2Cache.clear();
			// All of this is scoped to the signed-in account. Tier support can come
			// back with the latch, but LanguageModelAccess already republishes
			// models on this same event, so there is nothing to announce here.
			this._autoV2Unavailable = false;
			this._tierSupportAnnounced = this.areAutoModeTiersSupported();
			const keys = Array.from(this._reserveTokens.keys());
			this._reserveTokens.clearAndDisposeAll();
			for (const location of keys) {
				this._reserveTokens.set(location, new AutoModeTokenBank('reserve', location, this._capiClientService, this._authService, this._logService, this._expService, this._envService));
			}
		}));
		this._serviceBrand = undefined;
		this._routerDecisionFetcher = new RouterDecisionFetcher(this._capiClientService, this._authService, this._logService, this._telemetryService, this._requestLogger);
		this._autoV2Fetcher = new AutoV2Fetcher(this._capiClientService, this._authService, this._logService, this._telemetryService, this._requestLogger);
	}

	override dispose(): void {
		for (const entry of this._autoModelCache.values()) {
			entry.tokenBank.dispose();
		}
		this._autoModelCache.clear();
		this._autoV2Cache.clear();
		this._reserveTokens.dispose();
		super.dispose();
	}

	consumeLastRoutingDecision(): AutoModeRoutingDecision | undefined {
		const decision = this._lastRoutingDecision;
		this._lastRoutingDecision = undefined;
		return decision;
	}

	async resolveAutoModePickerEndpoint(knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint> {
		if (!knownEndpoints.length) {
			throw new Error('No auto mode endpoints provided.');
		}
		if (!this.isAutoV2Enabled()) {
			return this.resolveAutoModeEndpoint(undefined, knownEndpoints);
		}
		// Nothing to route without a prompt: wrap a representative endpoint for
		// its display metadata only. The picker hides per-model pricing for
		// Auto, so the wrapped model is not user-visible.
		const base = knownEndpoints.find(e => e.showInModelPicker) ?? knownEndpoints[0];
		return this._instantiationService.createInstance(AutoChatEndpoint, base, '', 0, this.getAutoPickerMetadata(knownEndpoints).discountRange);
	}

	getAutoPickerMetadata(knownEndpoints: IChatEndpoint[]): AutoModePickerMetadata {
		return { discountRange: this._calculateDiscountRange(knownEndpoints) };
	}

	/**
	 * Resolve an auto mode endpoint
	 * Optionally uses a router model to select the best endpoint based on the prompt.
	 */
	invalidateRouterCache(chatRequest: IAutoModeRoutingRequest): void {
		const conversationId = chatRequest.sessionResource?.toString() ?? chatRequest.sessionId ?? 'unknown';
		const entry = this._autoModelCache.get(conversationId);
		if (entry) {
			entry.needsReEval = true;
			this._logService.trace(`[AutomodeService] Router cache invalidated for conversation ${conversationId}`);
		}
		const v2Entry = this._autoV2Cache.get(conversationId);
		if (v2Entry) {
			v2Entry.needsReEval = true;
			this._logService.trace(`[AutomodeService] Auto v2 cache invalidated for conversation ${conversationId}`);
		}
	}

	async resolveAutoModeEndpoint(chatRequest: IAutoModeRoutingRequest | undefined, knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint> {
		if (!knownEndpoints.length) {
			throw new Error('No auto mode endpoints provided.');
		}

		// Clear any previous routing decision upfront so stale data cannot
		// leak to a consumer if this call takes a non-router path.
		this._lastRoutingDecision = undefined;

		if (this.isAutoV2Enabled()) {
			const v2Endpoint = await this._tryResolveWithAutoV2(chatRequest, knownEndpoints);
			if (v2Endpoint) {
				return v2Endpoint;
			}
		}

		const conversationId = chatRequest?.sessionResource?.toString() ?? chatRequest?.sessionId ?? 'unknown';
		const entry = this._autoModelCache.get(conversationId);
		const tokenBank = this._acquireTokenBank(entry, chatRequest?.location, conversationId);
		const token = await tokenBank.getToken();

		// After the first turn, skip the router unless explicitly invalidated
		// (e.g. after conversation compaction/summarization). Token refresh and
		// default model selection still run so available-model changes are respected.
		const skipRouter = entry !== undefined && entry.turnCount > 0 && !entry.needsReEval;
		if (entry?.needsReEval) {
			entry.needsReEval = false;
		}
		const imageTelemetryMeasurements = getImageTelemetryMeasurementsFromReferences(chatRequest?.references);
		const imageTelemetryEventMeasurements = getImageTelemetryEventMeasurements(imageTelemetryMeasurements);

		const routerResult = skipRouter
			? { lastRoutedPrompt: chatRequest?.prompt?.trim() ?? entry?.lastRoutedPrompt }
			: await this._tryRouterSelection(chatRequest, conversationId, entry, token, knownEndpoints, imageTelemetryEventMeasurements);
		let selectedModel = routerResult.selectedModel;
		const lastRoutedPrompt = routerResult.lastRoutedPrompt;
		const routerFallbackReason = routerResult.fallbackReason;

		// Default model selection when router was skipped or failed
		if (!selectedModel) {
			if (routerFallbackReason) {
				/* __GDPR__
					"automode.routerFallback" : {
						"owner": "lramos15",
						"comment": "Reports when the auto mode router is skipped or fails and falls back to default model selection",
						"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The reason the router was skipped or failed, e.g. emptyPrompt, emptyCandidateList, noMatchingEndpoint, routerError, routerTimeout, or a server error code" },
						"hasImage": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the request contained an attached image" },
						"imageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of input images attached to the request", "isMeasurement": true },
						"totalImageBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Sum of byte sizes for attached input images when known", "isMeasurement": true },
						"maxImageBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image byte size in the request", "isMeasurement": true },
						"maxImageWidth": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image width in the request", "isMeasurement": true },
						"maxImageHeight": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image height in the request", "isMeasurement": true },
						"maxImagePixels": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image pixel count in the request", "isMeasurement": true },
						"totalImagePixels": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Sum of known input image pixel counts in the request", "isMeasurement": true },
						"imagePngCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of PNG input images", "isMeasurement": true },
						"imageJpegCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of JPEG input images", "isMeasurement": true },
						"imageGifCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of GIF input images", "isMeasurement": true },
						"imageWebpCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of WebP input images", "isMeasurement": true },
						"imageUnknownMimeCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images whose MIME type is unknown or unsupported", "isMeasurement": true },
						"imageClipboardCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from clipboard or paste", "isMeasurement": true },
						"imageScreenshotCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from screenshot capture", "isMeasurement": true },
						"imageFileCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from local file attachment", "isMeasurement": true },
						"imageUrlCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from URL", "isMeasurement": true },
						"imageUnknownSourceCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images whose source could not be determined", "isMeasurement": true }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('automode.routerFallback', {
					reason: routerFallbackReason,
					hasImage: String(imageTelemetryMeasurements.imageCount > 0),
				}, imageTelemetryEventMeasurements);
			}
			selectedModel = this._selectDefaultModel(entry?.endpoint?.modelProvider, token.available_models, knownEndpoints);
		}

		selectedModel = this._applyVisionFallback(chatRequest, selectedModel, token.available_models, knownEndpoints);

		// Store routing decision for the UI to consume (update resolved model to the final one after all overrides)
		if (routerResult.routingDecision) {
			this._lastRoutingDecision = {
				...routerResult.routingDecision,
				resolvedModel: selectedModel.model,
				resolvedModelName: selectedModel.name,
			};
		}

		// Emit the final model selection alongside the router's recommendation
		// so analysts can detect overrides without fragile telemetry joins
		if (!skipRouter && routerResult.candidateModel) {
			/* __GDPR__
				"automode.routerModelSelection" : {
					"owner": "aashnagarg",
					"comment": "Reports the router's recommended model vs the actual model used after all client-side overrides",
					"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The conversation ID" },
					"candidateModel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The router's top candidate model (candidate_models[0])" },
					"actualModel": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model actually selected after all client-side overrides" },
					"overrideReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Why the actual model differs from the candidate: none or clientOverride" },
					"imageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of input images attached to the request", "isMeasurement": true },
					"totalImageBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Sum of byte sizes for attached input images when known", "isMeasurement": true },
					"maxImageBytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image byte size in the request", "isMeasurement": true },
					"maxImageWidth": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image width in the request", "isMeasurement": true },
					"maxImageHeight": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image height in the request", "isMeasurement": true },
					"maxImagePixels": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Largest known input image pixel count in the request", "isMeasurement": true },
					"totalImagePixels": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Sum of known input image pixel counts in the request", "isMeasurement": true },
					"imagePngCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of PNG input images", "isMeasurement": true },
					"imageJpegCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of JPEG input images", "isMeasurement": true },
					"imageGifCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of GIF input images", "isMeasurement": true },
					"imageWebpCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of WebP input images", "isMeasurement": true },
					"imageUnknownMimeCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images whose MIME type is unknown or unsupported", "isMeasurement": true },
					"imageClipboardCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from clipboard or paste", "isMeasurement": true },
					"imageScreenshotCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from screenshot capture", "isMeasurement": true },
					"imageFileCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from local file attachment", "isMeasurement": true },
					"imageUrlCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images sourced from URL", "isMeasurement": true },
					"imageUnknownSourceCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Count of input images whose source could not be determined", "isMeasurement": true }
				}
			*/
			const candidateModel = routerResult.candidateModel;
			const overrideReason = candidateModel === selectedModel.model ? 'none' : 'clientOverride';
			this._telemetryService.sendMSFTTelemetryEvent('automode.routerModelSelection', {
				conversationId: conversationId ?? '',
				candidateModel,
				actualModel: selectedModel.model,
				overrideReason,
			}, imageTelemetryEventMeasurements);
		}

		// Reuse the cached endpoint if the session token and model haven't changed
		const autoEndpoint = (entry?.endpoint && entry.lastSessionToken === token.session_token && entry.endpoint.model === selectedModel.model)
			? entry.endpoint
			: this._instantiationService.createInstance(AutoChatEndpoint, selectedModel, token.session_token, token.discounted_costs?.[selectedModel.model] ?? selectedModel.autoDiscount ?? 0, this._calculateDiscountRange(knownEndpoints));

		const isNewTurn = !entry || lastRoutedPrompt !== entry.lastRoutedPrompt;
		this._autoModelCache.set(conversationId, {
			endpoint: autoEndpoint,
			tokenBank,
			lastSessionToken: token.session_token,
			lastRoutedPrompt,
			routerFallbackReason,
			turnCount: (entry?.turnCount ?? 0) + (isNewTurn ? 1 : 0),
			needsReEval: false,
		});
		return autoEndpoint;
	}

	isAutoV2Enabled(): boolean {
		return !this._autoV2Unavailable && this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AutoModeV2Enabled, this._expService);
	}

	areAutoModeTiersSupported(): boolean {
		return this.isAutoV2Enabled() && this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AutoModeTiersEnabled, this._expService);
	}

	/**
	 * Latches V2 off for the rest of the session and withdraws the tier picker,
	 * which would otherwise stay visible while the legacy flow silently ignores it.
	 */
	private _markAutoV2Unavailable(): void {
		if (this._autoV2Unavailable) {
			return;
		}
		this._autoV2Unavailable = true;
		this._updateAutoModeTierSupport();
	}

	/**
	 * Announces a change in {@link areAutoModeTiersSupported}. Its inputs are the
	 * two settings (and their experiment treatments) plus the V2 latch, so this
	 * runs on every configuration change as well as after the latch flips.
	 */
	private _updateAutoModeTierSupport(): void {
		const supported = this.areAutoModeTiersSupported();
		if (supported !== this._tierSupportAnnounced) {
			this._tierSupportAnnounced = supported;
			this._onDidChangeAutoModeTierSupport.fire();
		}
	}

	/**
	 * The routing profile to request for a turn, in precedence order: the
	 * internal override setting, then an explicit picker selection, then the
	 * pin inline surfaces trade routing depth for latency with.
	 *
	 * Returns `undefined` while tiers are disabled, which omits `tier` from the
	 * request and leaves the routing profile to the service. The override is
	 * honored either way, so evals can exercise tiers before the experiment
	 * reaches them.
	 *
	 * The picker selection is honored on inline surfaces too. The schema is
	 * published per model rather than per surface, so the tier chip renders in
	 * inline chat as well; unconditionally pinning `fast` there would leave the
	 * user a visible, persisted control that silently does nothing.
	 *
	 * Only a non-default selection counts as explicit: the workbench materializes
	 * the schema default into `modelConfiguration` and strips a pick of the
	 * default back out when storing it, so a `balanced` entry cannot be told
	 * apart from "never picked" — reading it as a selection would make the inline
	 * pin below unreachable.
	 */
	private _resolveTier(chatRequest: IAutoModeRoutingRequest | undefined): AutoModeTier | undefined {
		const override = this._configurationService.getConfig(ConfigKey.Advanced.AutoModeTierOverride);
		if (override) {
			// The override is internal, so unlike the picker it may select `fast`.
			if ((autoModeTiers as readonly string[]).includes(override)) {
				return override as AutoModeTier;
			}
			this._logService.warn(`[AutomodeService] Ignoring auto tier override '${override}' — not one of [${autoModeTiers.join(', ')}].`);
		}
		if (!this.areAutoModeTiersSupported()) {
			return undefined;
		}
		const configured = chatRequest?.modelConfiguration?.[AUTO_MODE_TIER_PROPERTY];
		if (isSelectableAutoModeTier(configured) && configured !== defaultAutoModeTier) {
			return configured;
		}
		if (chatRequest?.location !== undefined && inlineChatLocations.has(chatRequest.location)) {
			return inlineChatAutoModeTier;
		}
		return defaultAutoModeTier;
	}

	/**
	 * Resolves via `POST /auto`. Returns `undefined` when V2 cannot serve the
	 * request, so the caller falls back to the legacy flow.
	 */
	private async _tryResolveWithAutoV2(chatRequest: IAutoModeRoutingRequest | undefined, knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint | undefined> {
		const conversationId = chatRequest?.sessionResource?.toString() ?? chatRequest?.sessionId ?? 'unknown';
		const prompt = chatRequest?.prompt?.trim();
		// `/auto` only needs a prompt and a conversation to key the session on;
		// every surface routes, and the tier carries the surface's intent.
		if (!prompt?.length || conversationId === 'unknown') {
			return undefined;
		}

		const tier = this._resolveTier(chatRequest);
		const entry = this._autoV2Cache.get(conversationId);
		// The token lasts 24h with no refresh, so reuse the endpoint for the rest
		// of the conversation. A turn that attaches an image to a text-only model
		// must re-resolve, as must a turn whose tier no longer matches the routing
		// profile the cached model was picked under.
		const cacheUsable = entry && !entry.needsReEval && entry.turnCount > 0
			&& !this._isAutoV2SessionExpired(entry)
			&& entry.tier === tier
			&& (!hasImage(chatRequest) || entry.endpoint.supportsVision);
		if (cacheUsable) {
			return entry.endpoint;
		}

		try {
			const result = await this._autoV2Fetcher.getAutoDecision(prompt, {
				hasImage: hasImage(chatRequest),
				conversationId,
				vscodeRequestId: chatRequest?.id,
				tier,
			});

			// Prefer local `/models` metadata: it carries fields `/auto` leaves
			// unset (token pricing, promos, SKU restrictions, thinking budgets).
			// If the model is missing locally the two have drifted, so fall back
			// to the embedded metadata rather than giving up.
			let selectedModel = knownEndpoints.find(e => e.model === result.selected_model.id);
			if (!selectedModel) {
				selectedModel = this._createEndpointFromAutoV2Metadata(result.selected_model);
				if (!selectedModel) {
					this._logService.warn(`[AutomodeService] Auto v2 selected '${result.selected_model.id}' which is not in knownEndpoints=[${knownEndpoints.map(e => e.model).join(', ')}] and its metadata was not usable; falling back to the legacy flow.`);
					this._sendAutoV2FallbackTelemetry('noMatchingEndpoint');
					return undefined;
				}
				this._logService.info(`[AutomodeService] Auto v2 selected '${result.selected_model.id}' which is not in knownEndpoints; using the metadata embedded in the /auto response.`);
				this._sendAutoV2FallbackTelemetry('embeddedMetadata');
			}

			// The server pre-filters on `has_image`, but the client is ultimately
			// responsible for not sending an image to a model that rejects it.
			if (hasImage(chatRequest) && !selectedModel.supportsVision) {
				this._logService.warn(`[AutomodeService] Auto v2 selected '${selectedModel.model}' which does not support vision for an image request; falling back to the legacy flow.`);
				this._sendAutoV2FallbackTelemetry('noVisionSupport');
				return undefined;
			}

			const endpoint = (entry?.endpoint && entry.sessionToken === result.session_token && entry.endpoint.model === selectedModel.model && entry.tier === tier)
				? entry.endpoint
				: this._instantiationService.createInstance(AutoChatEndpoint, selectedModel, result.session_token, result.discounted_costs?.[selectedModel.model] ?? selectedModel.autoDiscount ?? 0, this._calculateDiscountRange(knownEndpoints));

			// Only a genuinely new conversation needs room made for it; the `set`
			// below otherwise replaces an entry, and evicting would cost an
			// unrelated session.
			if (!this._autoV2Cache.has(conversationId)) {
				this._evictOldestAutoV2Sessions();
			}
			this._autoV2Cache.set(conversationId, {
				endpoint,
				sessionToken: result.session_token,
				expiresAt: result.expires_at,
				lastRoutedPrompt: prompt,
				tier,
				turnCount: (entry?.turnCount ?? 0) + (entry?.lastRoutedPrompt === prompt ? 0 : 1),
				needsReEval: false,
			});
			return endpoint;
		} catch (e) {
			const reason = this._classifyAutoV2Failure(e);
			// A 404 means we are gated off; stop retrying on every turn.
			if (e instanceof AutoV2Error && e.status === 404) {
				this._markAutoV2Unavailable();
				this._logService.info(`[AutomodeService] Auto v2 endpoint unavailable (404); using the legacy flow for the rest of the session.`);
			}
			this._logService.error(`[AutomodeService] Auto v2 failed for conversation ${conversationId} (${reason}):`, (e as Error).message);
			this._sendAutoV2FallbackTelemetry(reason);
			// Prefer the last known good endpoint over the legacy round-trips, but
			// only when it still reflects the tier and vision needs of this turn.
			if (entry && entry.tier === tier && !entry.needsReEval && !this._isAutoV2SessionExpired(entry) && (!hasImage(chatRequest) || entry.endpoint.supportsVision)) {
				return entry.endpoint;
			}
			return undefined;
		}
	}

	/**
	 * Builds an endpoint from the metadata embedded in a `POST /auto` response,
	 * for when the selected model is missing from the local `/models` view.
	 * Returns `undefined` if the payload lacks the fields needed to build a request.
	 */
	private _createEndpointFromAutoV2Metadata(model: AutoV2SelectedModel): IChatEndpoint | undefined {
		const capabilities = model.capabilities;
		// `/auto` only selects chat models and omits the `type` discriminator
		// that `/models` sets, so treat an absent type as chat.
		if (!capabilities || (capabilities.type !== undefined && capabilities.type !== 'chat') || !capabilities.family || !capabilities.tokenizer) {
			return undefined;
		}
		const chatCapabilities: IChatModelCapabilities = {
			...(capabilities as IChatModelCapabilities),
			type: 'chat',
			supports: (capabilities as IChatModelCapabilities).supports ?? { streaming: true },
		};
		const modelInformation: IChatModelInformation = {
			...model,
			id: model.id,
			name: model.name ?? model.id,
			version: model.version ?? 'unknown',
			vendor: model.vendor ?? 'copilot',
			is_chat_default: false,
			is_chat_fallback: false,
			model_picker_enabled: model.model_picker_enabled ?? true,
			capabilities: chatCapabilities,
		};
		return this._instantiationService.createInstance(CopilotChatEndpoint, modelInformation);
	}

	private _isAutoV2SessionExpired(entry: AutoV2CacheEntry): boolean {
		// Renew early so a long request cannot outlive its token.
		return entry.expiresAt * 1000 - Date.now() < 5 * 60 * 1000;
	}

	/**
	 * Bounds the session cache. Inline chat starts a new session per invocation,
	 * so without this the map grows for the life of the window with conversations
	 * that will never be read again. Stale entries are already rejected when read,
	 * so this only has to reclaim memory: evict oldest-first (Map keeps insertion
	 * order) to make room for one more.
	 */
	private _evictOldestAutoV2Sessions(): void {
		for (const conversationId of this._autoV2Cache.keys()) {
			if (this._autoV2Cache.size < AutomodeService.AUTO_V2_CACHE_MAX_ENTRIES) {
				return;
			}
			this._autoV2Cache.delete(conversationId);
		}
	}

	private _classifyAutoV2Failure(e: unknown): string {
		if (isAbortError(e)) {
			return 'autoV2Timeout';
		}
		if (e instanceof AutoV2Error) {
			return e.errorCode ?? `autoV2Status${e.status}`;
		}
		return 'autoV2Error';
	}

	private _sendAutoV2FallbackTelemetry(reason: string): void {
		/* __GDPR__
			"automode.autoV2Fallback" : {
				"owner": "lramos15",
				"comment": "Reports when the single-call Auto endpoint (POST /auto) cannot be used and auto mode falls back to the legacy session + intent flow",
				"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Why the single-call endpoint could not be used as-is, e.g. autoV2Timeout, autoV2Error, noMatchingEndpoint, noVisionSupport, embeddedMetadata (the selected model was built from the /auto payload because it was missing locally), or a server status/error code" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('automode.autoV2Fallback', { reason });
	}

	private _acquireTokenBank(entry: AutoModelCacheEntry | undefined, location: ChatLocation | undefined, conversationId: string): AutoModeTokenBank {
		if (entry) {
			return entry.tokenBank;
		}
		const loc = location ?? ChatLocation.Panel;
		const tokenBank = this._reserveTokens.deleteAndLeak(loc) || new AutoModeTokenBank('reserve', loc, this._capiClientService, this._authService, this._logService, this._expService, this._envService);
		this._reserveTokens.set(loc, new AutoModeTokenBank('reserve', loc, this._capiClientService, this._authService, this._logService, this._expService, this._envService));
		tokenBank.debugName = conversationId;
		return tokenBank;
	}

	private async _tryRouterSelection(
		chatRequest: IAutoModeRoutingRequest | undefined,
		conversationId: string,
		entry: AutoModelCacheEntry | undefined,
		token: AutoModeAPIResponse,
		knownEndpoints: IChatEndpoint[],
		imageTelemetryEventMeasurements: Partial<ImageTelemetryMeasurements>,
	): Promise<{ selectedModel?: IChatEndpoint; lastRoutedPrompt?: string; fallbackReason?: string; candidateModel?: string; routingDecision?: AutoModeRoutingDecision }> {
		const prompt = chatRequest?.prompt?.trim();
		const lastRoutedPrompt = entry?.lastRoutedPrompt ?? prompt;

		if (!this._isRouterEnabled(chatRequest) || conversationId === 'unknown') {
			return { lastRoutedPrompt };
		}

		if (!prompt?.length) {
			return { lastRoutedPrompt, fallbackReason: 'emptyPrompt' };
		}

		// Prompt hasn't changed since last decision — skip router but allow endpoint refresh
		if (entry && entry.lastRoutedPrompt === prompt) {
			return { lastRoutedPrompt };
		}

		try {
			const contextSignals: RoutingContextSignals = {
				session_id: conversationId !== 'unknown' ? conversationId : undefined,
				reference_count: chatRequest?.references?.length,
				prompt_char_count: prompt.length,
				previous_model: entry?.endpoint?.model,
				turn_number: (entry?.turnCount ?? 0) + 1,
			};
			const routingMethod = 'hydra';

			// Filter available_models to only those the client can actually serve.
			// The AutoModels API and Models API are separate CAPI calls that can be
			// out of sync (e.g. a new model appears in available_models before the
			// Models API returns it). Sending unresolvable models to the router
			// causes it to recommend models the client must silently discard.
			const knownModelIds = new Set(knownEndpoints.map(e => e.model));
			const routableModels: string[] = [];
			const droppedModels: string[] = [];
			for (const m of token.available_models) {
				(knownModelIds.has(m) ? routableModels : droppedModels).push(m);
			}
			if (!routableModels.length) {
				this._logService.warn(`[AutomodeService] No available_models matched knownEndpoints. available_models=[${token.available_models.join(', ')}], knownEndpoints=[${knownEndpoints.map(e => e.model).join(', ')}]`);
				return { lastRoutedPrompt: prompt, fallbackReason: 'noMatchingEndpoint' };
			}
			if (droppedModels.length) {
				this._logService.info(`[AutomodeService] Filtered ${droppedModels.length} unresolvable model(s) before routing: [${droppedModels.join(', ')}]`);
			}

			const result = await this._routerDecisionFetcher.getRouterDecision(prompt, token.session_token, routableModels, undefined, contextSignals, conversationId, chatRequest?.id, routingMethod, hasImage(chatRequest), imageTelemetryEventMeasurements);

			if (result.fallback) {
				this._logService.info(`[AutomodeService] Router signaled fallback: ${result.fallback_reason ?? 'unknown'}, routing_method=${result.routing_method ?? 'n/a'}`);
				return { lastRoutedPrompt: prompt, fallbackReason: 'routerFallback' };
			}

			if (!result.candidate_models.length) {
				return { lastRoutedPrompt: prompt, fallbackReason: 'emptyCandidateList' };
			}

			// Prefer chosen_model — it is the router's authoritative pick after any
			// server-side re-ranking (e.g. Cost Sorting experiments). candidate_models
			// is the ordered fallback list per the auto-intent-service contract
			// (docs/integrators_onboarding.md: "Use chosen_model for the upcoming chat
			// call, and use candidate_models as the ordered fallback list").
			// Same-provider preference is intentionally NOT applied here — the router
			// already accounts for available models and re-runs after /compact, so
			// overriding its pick with same-provider negates cost-saving decisions.
			// Same-provider is still used in _selectDefaultModel (the non-router fallback).
			const routerModel = result.chosen_model ?? result.candidate_models[0];
			let selectedModel = result.chosen_model ? knownEndpoints.find(e => e.model === result.chosen_model) : undefined;
			if (!selectedModel) {
				selectedModel = this._findFirstAvailableModel(result.candidate_models, knownEndpoints);
			}

			if (!selectedModel) {
				this._logService.warn(`[AutomodeService] Router pick not in knownEndpoints: chosen_model=${result.chosen_model ?? 'n/a'}, candidate_models=[${result.candidate_models.join(', ')}]`);
				return { lastRoutedPrompt: prompt, fallbackReason: 'noMatchingEndpoint' };
			}

			if (result.sticky_override) {
				this._logService.trace(`[AutomodeService] Sticky routing override: confidence=${(result.confidence * 100).toFixed(1)}%, label=${result.predicted_label}, router_model=${routerModel}, actual_model=${selectedModel.model}`);
			}
			return {
				selectedModel,
				lastRoutedPrompt: prompt,
				candidateModel: routerModel,
				routingDecision: {
					resolvedModel: selectedModel.model,
					resolvedModelName: selectedModel.name,
					predictedLabel: result.predicted_label,
					confidence: result.confidence,
				},
			};
		} catch (e) {
			const isTimeout = isAbortError(e);
			let fallbackReason: string;
			if (isTimeout) {
				fallbackReason = 'routerTimeout';
			} else if (e instanceof RouterDecisionError && e.errorCode) {
				fallbackReason = e.errorCode;
			} else {
				fallbackReason = 'routerError';
			}
			this._logService.error(`Failed to get routed model for conversation ${conversationId} (${fallbackReason}):`, (e as Error).message);
			return { lastRoutedPrompt: prompt, fallbackReason };
		}
	}

	private _selectDefaultModel(currentModelProvider: string | undefined, availableModels: string[], knownEndpoints: IChatEndpoint[]): IChatEndpoint {
		const selectedModel = (currentModelProvider ? this._findSameProviderModel(currentModelProvider, availableModels, knownEndpoints) : undefined)
			?? this._findFirstAvailableModel(availableModels, knownEndpoints);
		if (selectedModel) {
			return selectedModel;
		}
		// AutoModels (cached up to 6h in the CopilotToken) and the Models API
		// (refreshed every 10min) are independent CAPI calls and can drift, so
		// `available_models` may have zero overlap with `knownEndpoints` (e.g.
		// a model was removed server-side after the token was minted). Rather
		// than throwing "Auto mode failed: no available model found in known
		// endpoints" and breaking the chat, fall back to the first known
		// endpoint so the user can keep working. Emit telemetry so we can
		// monitor how often this happens.
		const fallbackEndpoint = knownEndpoints[0];
		this._logService.warn(
			`[AutomodeService] No available_models matched knownEndpoints; using fallback endpoint '${fallbackEndpoint.model}'. ` +
			`available_models=[${availableModels.join(', ')}], knownEndpoints=[${knownEndpoints.map(e => e.model).join(', ')}]`,
		);
		/* __GDPR__
			"automode.noEndpointFallback" : {
				"owner": "aashnagarg",
				"comment": "Reports when AutoModels available_models has no overlap with knownEndpoints and the client falls back to the first known endpoint instead of failing.",
				"availableModelCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of models in the AutoModels response" },
				"knownEndpointCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Number of known endpoints from the Models API" },
				"fallbackModel": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The model selected as the safe fallback" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('automode.noEndpointFallback',
			{ fallbackModel: fallbackEndpoint.model },
			{ availableModelCount: availableModels.length, knownEndpointCount: knownEndpoints.length },
		);
		return fallbackEndpoint;
	}

	/**
	 * Gates the legacy router. Kept panel-only so the fallback path behaves
	 * exactly as it did before `/auto`; V2 routes every surface.
	 */
	private _isRouterEnabled(chatRequest: IAutoModeRoutingRequest | undefined): boolean {
		const isPanelChat = !chatRequest?.location || chatRequest?.location === ChatLocation.Panel;
		return isPanelChat;
	}

	/**
	 * Find the first model in available_models that has a known endpoint.
	 */
	private _findFirstAvailableModel(availableModels: string[], knownEndpoints: IChatEndpoint[]): IChatEndpoint | undefined {
		for (const model of availableModels) {
			const endpoint = knownEndpoints.find(e => e.model === model);
			if (endpoint) {
				return endpoint;
			}
		}
		return undefined;
	}

	/**
	 * Find the first model in available_models whose knownEndpoint has the same modelProvider
	 * as the current model. Skips any model that doesn't have a known endpoint.
	 */
	private _findSameProviderModel(currentModelProvider: string, availableModels: string[], knownEndpoints: IChatEndpoint[]): IChatEndpoint | undefined {
		for (const model of availableModels) {
			const endpoint = knownEndpoints.find(e => e.model === model);
			if (endpoint && endpoint.modelProvider === currentModelProvider) {
				return endpoint;
			}
		}
		return undefined;
	}

	/**
	 * If the request contains an image and the selected model doesn't support vision,
	 * fall back to the first vision-capable model from the available models.
	 */
	private _applyVisionFallback(chatRequest: IAutoModeRoutingRequest | undefined, selectedModel: IChatEndpoint, availableModels: string[], knownEndpoints: IChatEndpoint[]): IChatEndpoint {
		if (!hasImage(chatRequest) || selectedModel.supportsVision) {
			return selectedModel;
		}
		const visionModel = availableModels
			.map(model => knownEndpoints.find(e => e.model === model))
			.find(endpoint => endpoint?.supportsVision);
		if (visionModel) {
			this._logService.trace(`Selected model '${selectedModel.model}' does not support vision, falling back to '${visionModel.model}'.`);
			return visionModel;
		}
		this._logService.warn(`Request contains an image but no vision-capable model is available.`);
		return selectedModel;
	}

	/**
	 * The span of Auto discounts across the models Auto can route to, as
	 * fractions (e.g. `0.1` for 10% off). Models without an `auto_discount` are
	 * outside the Auto pool and do not contribute.
	 */
	private _calculateDiscountRange(knownEndpoints: IChatEndpoint[]): { low: number; high: number } {
		let low = Infinity;
		let high = -Infinity;
		let hasValues = false;

		for (const endpoint of knownEndpoints) {
			const discount = endpoint.autoDiscount;
			if (discount === undefined) {
				continue;
			}
			hasValues = true;
			if (discount < low) {
				low = discount;
			}
			if (discount > high) {
				high = discount;
			}
		}
		return hasValues ? { low, high } : { low: 0, high: 0 };
	}
}

function hasImage(chatRequest: IAutoModeRoutingRequest | undefined): boolean {
	if (!chatRequest || !chatRequest.references) {
		return false;
	}
	return chatRequest.references.some(ref => {
		const value = ref.value;
		return typeof value === 'object' &&
			value !== null &&
			'mimeType' in value &&
			typeof value.mimeType === 'string'
			&& value.mimeType.startsWith('image/');
	});
}
