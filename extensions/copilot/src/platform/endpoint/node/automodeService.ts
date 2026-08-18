/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { TaskSingler } from '../../../util/common/taskSingler';
import { Emitter, type Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatLocation } from '../../../vscodeTypes';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { isAbortError } from '../../networking/common/fetcherService';
import { IChatEndpoint } from '../../networking/common/networking';
import { IRequestLogger } from '../../requestLogger/common/requestLogger';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AUTO_MODE_TIER_PROPERTY, autoModeTiers, defaultAutoModeTier, inlineChatAutoModeTier, isSelectableAutoModeTier, type AutoModeTier } from '../common/autoModeTiers';
import { ICAPIClientService } from '../common/capiClient';
import type { IChatModelCapabilities, IChatModelInformation } from '../common/endpointProvider';
import { AutoChatEndpoint } from './autoChatEndpoint';
import { AutoV2Error, AutoV2Fetcher, type AutoV2Response, type AutoV2SelectedModel } from './autoV2Fetcher';
import { CopilotChatEndpoint } from './copilotChatEndpoint';

interface AutoModeCacheEntry {
	endpoint: AutoChatEndpoint;
	sessionToken: string;
	/** UNIX seconds at which `sessionToken` expires. */
	expiresAt: number;
	/** Routing profile the session was resolved with; a change re-routes. `undefined` while tiers are disabled. */
	tier: AutoModeTier | undefined;
	needsReEval: boolean;
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
	/** Slash command for the turn, which carries the intent when `prompt` is empty. */
	readonly command?: string;
	readonly location?: ChatLocation;
	readonly sessionId?: string;
	readonly sessionResource?: { toString(): string };
	readonly references?: readonly { readonly value: unknown }[];
	/** The picker configuration for the Auto model, which carries the selected tier. */
	readonly modelConfiguration?: { readonly [key: string]: unknown };
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

	/**
	 * Routes a request to a concrete model and wraps it in the "Auto" endpoint.
	 * Rejects when the request cannot be routed, e.g. it carries neither a prompt
	 * nor a command, or the routing service is unavailable.
	 */
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
	 * Whether the Auto model should offer the tier picker. Changes are announced
	 * by {@link onDidChangeAutoModeTierSupport}.
	 */
	areAutoModeTiersSupported(): boolean;

	/**
	 * Fires when {@link areAutoModeTiersSupported} changes, so the Auto model's
	 * configuration schema can be republished.
	 */
	readonly onDidChangeAutoModeTierSupport: Event<void>;

	/**
	 * Marks the router cache for this conversation as needing re-evaluation.
	 * The next call to {@link resolveAutoModeEndpoint} will re-run the router
	 * instead of returning the cached endpoint.
	 */
	invalidateRouterCache(chatRequest: IAutoModeRoutingRequest): void;
}

export class AutomodeService extends Disposable implements IAutomodeService {
	readonly _serviceBrand: undefined;
	private readonly _cache: Map<string, AutoModeCacheEntry> = new Map();
	/** Coalesces concurrent routing calls that would answer a turn identically. */
	private _routingSingler = new TaskSingler<IChatEndpoint>();
	/** Bumped when the signed-in account changes; see {@link _routeAndCache}. */
	private _authGeneration = 0;
	private readonly _autoV2Fetcher: AutoV2Fetcher;
	/** Upper bound on live sessions. See {@link _evictOldestSessions}. */
	private static readonly CACHE_MAX_ENTRIES = 50;
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
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._tierSupportAnnounced = this.areAutoModeTiersSupported();
		// Covers both the setting and its experiment treatment: a treatment
		// refresh is published as a configuration change.
		this._register(this._configurationService.onDidChangeConfiguration(() => this._updateAutoModeTierSupport()));
		// Sessions are scoped to the signed-in account, and a routing call
		// started under the previous one must neither be joined by new callers
		// nor survive into the new account's cache.
		this._register(this._authService.onDidAuthenticationChange(() => {
			this._cache.clear();
			this._routingSingler = new TaskSingler<IChatEndpoint>();
			this._authGeneration++;
		}));
		this._serviceBrand = undefined;
		this._autoV2Fetcher = new AutoV2Fetcher(this._capiClientService, this._authService, this._logService, this._telemetryService, this._requestLogger);
	}

	override dispose(): void {
		this._cache.clear();
		super.dispose();
	}

	async resolveAutoModePickerEndpoint(knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint> {
		if (!knownEndpoints.length) {
			throw new Error('No auto mode endpoints provided.');
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

	invalidateRouterCache(chatRequest: IAutoModeRoutingRequest): void {
		const conversationId = chatRequest.sessionResource?.toString() ?? chatRequest.sessionId ?? 'unknown';
		const entry = this._cache.get(conversationId);
		if (entry) {
			entry.needsReEval = true;
			this._logService.trace(`[AutomodeService] Auto mode cache invalidated for conversation ${conversationId}`);
		}
	}

	/**
	 * Routes a turn through `POST /auto`, which picks the model for the prompt
	 * and mints the session token its endpoint bills against. Throws when the
	 * turn cannot be routed, leaving it to the caller to degrade.
	 */
	async resolveAutoModeEndpoint(chatRequest: IAutoModeRoutingRequest | undefined, knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint> {
		if (!knownEndpoints.length) {
			throw new Error('No auto mode endpoints provided.');
		}

		const conversationId = chatRequest?.sessionResource?.toString() ?? chatRequest?.sessionId ?? 'unknown';
		const tier = this._resolveTier(chatRequest);
		// Sessions are keyed on the conversation, so a request that cannot be
		// keyed always routes fresh and is never cached.
		const entry = conversationId === 'unknown' ? undefined : this._cache.get(conversationId);
		// The token lasts 24h with no refresh, so reuse the endpoint for the rest
		// of the conversation unless a re-evaluation was explicitly requested
		// (e.g. after compaction).
		if (entry && !entry.needsReEval && this._isCacheEntryCompatible(entry, tier, chatRequest)) {
			return entry.endpoint;
		}

		// A bare slash command (`/tests`, `/fix`, …) carries no prompt, so route
		// on the command instead of refusing the turn.
		const prompt = chatRequest?.prompt?.trim() || (chatRequest?.command ? `/${chatRequest.command}` : undefined);
		if (!prompt) {
			if (entry && this._isCacheEntryCompatible(entry, tier, chatRequest)) {
				return entry.endpoint;
			}
			throw new Error('Auto mode needs a prompt or a command to route a request.');
		}

		// Concurrent turns on a cold conversation (e.g. an extension issuing a
		// batch of `vscode.lm` requests) would otherwise each mint their own
		// session and could land on different models. Share one routing call
		// across every caller whose turn it would answer identically.
		if (conversationId === 'unknown') {
			return this._routeAndCache(prompt, tier, chatRequest, knownEndpoints, conversationId, entry);
		}
		return this._routingSingler.getOrCreate(
			`${conversationId}|${tier ?? ''}|${hasImage(chatRequest)}`,
			() => this._routeAndCache(prompt, tier, chatRequest, knownEndpoints, conversationId, entry),
		);
	}

	/**
	 * Performs the `POST /auto` round-trip and records the resulting session.
	 * Callers dedupe on {@link _routingSingler} so this runs once per turn.
	 */
	private async _routeAndCache(
		prompt: string,
		tier: AutoModeTier | undefined,
		chatRequest: IAutoModeRoutingRequest | undefined,
		knownEndpoints: IChatEndpoint[],
		conversationId: string,
		entry: AutoModeCacheEntry | undefined,
	): Promise<IChatEndpoint> {
		// The session this mints belongs to the account signed in right now, so
		// anything resolved here is void if that account changes mid-flight.
		const authGeneration = this._authGeneration;
		let result: AutoV2Response;
		try {
			result = await this._autoV2Fetcher.getAutoDecision(prompt, {
				hasImage: hasImage(chatRequest),
				conversationId,
				vscodeRequestId: chatRequest?.id,
				tier,
			});
		} catch (e) {
			const reason = this._classifyAutoV2Failure(e);
			this._logService.error(`[AutomodeService] Auto routing failed for conversation ${conversationId} (${reason}):`, (e as Error).message);
			this._sendAutoV2FallbackTelemetry(reason);
			// Prefer the last known good endpoint over failing the turn, but only
			// while it still reflects its tier and vision needs — and only while
			// it still belongs to the signed-in account.
			if (entry && authGeneration === this._authGeneration && this._isCacheEntryCompatible(entry, tier, chatRequest)) {
				return entry.endpoint;
			}
			throw e;
		}

		// The account changed while `/auto` was in flight. Its session token
		// would be sent with the new account's credentials, and caching it would
		// keep doing so for the life of the token, so fail the turn instead.
		if (authGeneration !== this._authGeneration) {
			throw new Error('Auto mode routed for an account that is no longer signed in.');
		}

		// Prefer local `/models` metadata: it carries fields `/auto` leaves
		// unset (token pricing, promos, SKU restrictions, thinking budgets).
		// If the model is missing locally the two have drifted, so fall back
		// to the embedded metadata rather than giving up.
		let selectedModel = knownEndpoints.find(e => e.model === result.selected_model.id);
		if (!selectedModel) {
			selectedModel = this._createEndpointFromAutoV2Metadata(result.selected_model);
			if (!selectedModel) {
				this._sendAutoV2FallbackTelemetry('noMatchingEndpoint');
				throw new Error(`Auto selected '${result.selected_model.id}', which is not in knownEndpoints=[${knownEndpoints.map(e => e.model).join(', ')}] and whose embedded metadata was not usable.`);
			}
			this._logService.info(`[AutomodeService] Auto selected '${result.selected_model.id}' which is not in knownEndpoints; using the metadata embedded in the /auto response.`);
			this._sendAutoV2FallbackTelemetry('embeddedMetadata');
		}

		// The server pre-filters on `has_image`, but the client is ultimately
		// responsible for not sending an image to a model that rejects it.
		if (hasImage(chatRequest) && !selectedModel.supportsVision) {
			this._sendAutoV2FallbackTelemetry('noVisionSupport');
			throw new Error(`Auto selected '${selectedModel.model}', which does not support vision, for an image request.`);
		}

		const endpoint = (entry?.endpoint && entry.sessionToken === result.session_token && entry.endpoint.model === selectedModel.model && entry.tier === tier)
			? entry.endpoint
			: this._instantiationService.createInstance(AutoChatEndpoint, selectedModel, result.session_token, result.discounted_costs?.[selectedModel.model] ?? selectedModel.autoDiscount ?? 0, this._calculateDiscountRange(knownEndpoints));

		if (conversationId === 'unknown') {
			return endpoint;
		}
		// Only a genuinely new conversation needs room made for it; the `set`
		// below otherwise replaces an entry, and evicting would cost an
		// unrelated session.
		if (!this._cache.has(conversationId)) {
			this._evictOldestSessions();
		}
		this._cache.set(conversationId, {
			endpoint,
			sessionToken: result.session_token,
			expiresAt: result.expires_at,
			tier,
			needsReEval: false,
		});
		return endpoint;
	}

	areAutoModeTiersSupported(): boolean {
		return this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AutoModeTiersEnabled, this._expService);
	}

	/**
	 * Announces a change in {@link areAutoModeTiersSupported}. Its input is the
	 * tiers setting (and its experiment treatment), so this runs on every
	 * configuration change.
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

	private _isSessionExpired(entry: AutoModeCacheEntry): boolean {
		// Renew early so a long request cannot outlive its token.
		return entry.expiresAt * 1000 - Date.now() < 5 * 60 * 1000;
	}

	/**
	 * Whether a cached session can still serve this turn: it must have been
	 * resolved under the same routing profile, still hold a live token, and
	 * support vision if the turn attaches an image.
	 */
	private _isCacheEntryCompatible(entry: AutoModeCacheEntry, tier: AutoModeTier | undefined, chatRequest: IAutoModeRoutingRequest | undefined): boolean {
		return entry.tier === tier
			&& !this._isSessionExpired(entry)
			&& (!hasImage(chatRequest) || entry.endpoint.supportsVision);
	}

	/**
	 * Bounds the session cache. Inline chat starts a new session per invocation,
	 * so without this the map grows for the life of the window with conversations
	 * that will never be read again. Stale entries are already rejected when read,
	 * so this only has to reclaim memory: evict oldest-first (Map keeps insertion
	 * order) to make room for one more.
	 */
	private _evictOldestSessions(): void {
		for (const conversationId of this._cache.keys()) {
			if (this._cache.size < AutomodeService.CACHE_MAX_ENTRIES) {
				return;
			}
			this._cache.delete(conversationId);
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
				"comment": "Reports when the single-call Auto endpoint (POST /auto) cannot be used to route a turn",
				"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Why the single-call endpoint could not be used as-is, e.g. autoV2Timeout, autoV2Error, noMatchingEndpoint, noVisionSupport, embeddedMetadata (the selected model was built from the /auto payload because it was missing locally), or a server status/error code" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('automode.autoV2Fallback', { reason });
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
