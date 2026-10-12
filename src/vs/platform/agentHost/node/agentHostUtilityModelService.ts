/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../common/agent.js';
import { getByokLmAgentModelId, getByokLmSelectionModelId, IByokLmChatRequest, IByokLmModelInfo, isByokLmAgentModelId, resolveByokLmEnablement } from '../common/agentHostByokLm.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostByokUtilityModelDefault, AgentHostByokUtilityModelDefaultConfigKey, AgentHostUtilitySmallModelConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { readAgentModelByokIdentifier } from '../common/agentModelByokMeta.js';
import { buildDefaultChatUri, isAhpChatChannel, isDefaultChatUri, type ModelSelection, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ICopilotApiService, ICopilotApiServiceRequestOptions, ICopilotUtilityChatCompletionRequest, UTILITY_DEFAULT_TEMPERATURE, UTILITY_DEFAULT_TOP_P } from './shared/copilotApiService.js';

/** LM API vendor of Copilot models; an override naming it is not a BYOK model. */
const COPILOT_VENDOR = 'copilot';

/** The session, and optionally the chat, whose selected main agent model a utility request serves. */
export interface IAgentHostUtilityModelContext {
	readonly session: ProtocolURI;
	/** Defaults to the session's default chat. */
	readonly chat?: ProtocolURI;
	/**
	 * The model selected for the turn being served, when the caller runs before
	 * the provider has applied it (for example, titling a turn at admission).
	 */
	readonly model?: ModelSelection;
}

export const enum AgentHostUtilityModelUnavailableReason {
	/** The Copilot utility model is selected but no Copilot token is available. */
	CopilotSignInRequired = 'copilotSignInRequired',
	/** The main agent model is BYOK and the BYOK default is `none`. */
	NotConfigured = 'notConfigured',
	/**
	 * A BYOK model is selected (as the main agent model or the utility model
	 * override) but cannot be reached, for example because the renderer that
	 * serves BYOK models is disconnected.
	 */
	ByokModelUnavailable = 'byokModelUnavailable',
}

/** Thrown when no utility model can serve a request; callers map {@link reason} to user-facing text. */
export class AgentHostUtilityModelUnavailableError extends Error {
	constructor(readonly reason: AgentHostUtilityModelUnavailableReason) {
		super(`No utility model is available: ${reason}`);
		this.name = 'AgentHostUtilityModelUnavailableError';
	}
}

export const IAgentHostUtilityModelService = createDecorator<IAgentHostUtilityModelService>('agentHostUtilityModelService');

/**
 * Runs the host's small utility completions (titles, pull request text) on the
 * model the user configured, matching the Copilot Chat extension's
 * `copilot-utility-small` resolution:
 *
 * 1. A resolvable BYOK `utilitySmallModel` override.
 * 2. When the chat's selected main agent model is BYOK, `byokUtilityModelDefault`:
 *    the main agent model, no model, or the Copilot default.
 * 3. The Copilot default utility model.
 *
 * Only an agent host with a renderer BYOK bridge (the local utility-process
 * host) honors steps 1 and 2. Remote hosts always use the Copilot default and
 * ignore the utility model root config, even when a client writes it.
 *
 * BYOK selections fail closed: while no renderer serves BYOK models, a BYOK
 * override or BYOK main agent model makes the request fail instead of
 * falling back to Copilot, even when `byokUtilityModelDefault` is `copilot`.
 * The user chose to keep that chat's content on their own model, and the
 * Copilot route must not be reached only because the bridge is unavailable.
 */
export interface IAgentHostUtilityModelService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the assistant text for `request`.
	 *
	 * @throws {@link AgentHostUtilityModelUnavailableError} when no utility model is available.
	 */
	chatCompletion(context: IAgentHostUtilityModelContext, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string>;
}

type UtilityModelRoute =
	| { readonly kind: 'byok'; readonly vendor: string; readonly modelId: string }
	| { readonly kind: 'copilot'; readonly githubToken: string };

export class AgentHostUtilityModelService implements IAgentHostUtilityModelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _byokUtilityModelsSupported: boolean,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IByokLmBridgeRegistry private readonly _byokBridgeRegistry: IByokLmBridgeRegistry,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async chatCompletion(context: IAgentHostUtilityModelContext, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		const route = this._resolveRoute(context);
		if (route.kind === 'copilot') {
			return this._copilotApiService.utilityChatCompletion(route.githubToken, request, options);
		}
		return this._byokChatCompletion(route.vendor, route.modelId, request, options?.signal);
	}

	private _resolveRoute(context: IAgentHostUtilityModelContext): UtilityModelRoute {
		return this._byokUtilityModelsSupported
			? this._resolveByokRoute(context) ?? this._resolveCopilotRoute()
			: this._resolveCopilotRoute();
	}

	/** Resolves a BYOK route, or `undefined` to use the Copilot default. */
	private _resolveByokRoute(context: IAgentHostUtilityModelContext): UtilityModelRoute | undefined {
		const byokModels = this._byokModels();
		const rendererConnected = this._byokBridgeRegistry.getServingConnection() !== undefined;
		const override = this._resolveOverride(byokModels, rendererConnected);
		if (override) {
			return override;
		}

		const mainAgentModel = this._resolveByokMainAgentModel(context);
		if (mainAgentModel) {
			const byokDefault = this._byokUtilityModelDefault();
			if (byokDefault === 'none') {
				throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.NotConfigured);
			}
			if (!rendererConnected) {
				this._logService.trace(`[AgentHostUtilityModelService] BYOK main agent model '${mainAgentModel}' is selected but no renderer serves BYOK models; not falling back to Copilot.`);
				throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.ByokModelUnavailable);
			}
			switch (byokDefault) {
				case 'mainAgent': {
					const model = byokModels?.find(m => getByokLmAgentModelId(m) === mainAgentModel);
					if (!model) {
						throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.ByokModelUnavailable);
					}
					return { kind: 'byok', vendor: model.vendor, modelId: getByokLmSelectionModelId(model) };
				}
				case 'copilot':
					break;
			}
		}
		return undefined;
	}

	private _resolveCopilotRoute(): UtilityModelRoute {
		const resource = this._gitHubEndpointService.getCopilotResource();
		const githubToken = this._authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
		if (!githubToken) {
			throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.CopilotSignInRequired);
		}
		return { kind: 'copilot', githubToken };
	}

	/** The renderer's BYOK models, or `undefined` when BYOK is disabled for the agent host. */
	private _byokModels(): readonly IByokLmModelInfo[] | undefined {
		const { enabled } = resolveByokLmEnablement(this._configurationService.getRootValue(platformRootSchema, AgentHostByokModelsEnabledConfigKey));
		return enabled ? this._byokBridgeRegistry.getModels() : undefined;
	}

	/**
	 * Resolves a `${vendor}/${id}` override to exactly one BYOK model. Like the
	 * extension, an override that is unresolvable while the renderer serves BYOK
	 * models, or ambiguous, falls back to the default behavior. Copilot overrides
	 * also fall back: the host only uses the Copilot default utility model. A
	 * BYOK override while no renderer serves BYOK models fails closed.
	 */
	private _resolveOverride(byokModels: readonly IByokLmModelInfo[] | undefined, rendererConnected: boolean): UtilityModelRoute | undefined {
		const raw = this._configurationService.getRootValue(platformRootSchema, AgentHostUtilitySmallModelConfigKey);
		if (!raw) {
			return undefined;
		}
		const slashIndex = raw.indexOf('/');
		if (slashIndex <= 0 || slashIndex >= raw.length - 1) {
			this._logService.warn(`[AgentHostUtilityModelService] Ignoring malformed utility model override '${raw}' (expected '\${vendor}/\${id}').`);
			return undefined;
		}
		const vendor = raw.substring(0, slashIndex);
		const id = raw.substring(slashIndex + 1);
		if (vendor === COPILOT_VENDOR || !byokModels) {
			return undefined;
		}
		if (!rendererConnected) {
			this._logService.trace(`[AgentHostUtilityModelService] Utility model override '${raw}' is a BYOK model but no renderer serves BYOK models; not falling back to Copilot.`);
			throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.ByokModelUnavailable);
		}
		const matches = byokModels.filter(m => m.vendor === vendor && m.id === id);
		if (matches.length !== 1) {
			this._logService.trace(`[AgentHostUtilityModelService] Utility model override '${raw}' matched ${matches.length} BYOK models; using the default behavior.`);
			return undefined;
		}
		return { kind: 'byok', vendor, modelId: getByokLmSelectionModelId(matches[0]) };
	}

	/** The agent model id of the chat's selected main agent model when it is a BYOK model. */
	private _resolveByokMainAgentModel(context: IAgentHostUtilityModelContext): string | undefined {
		const agent = this._providerService.getProviderForSession(context.session);
		if (!agent) {
			return undefined;
		}
		const chat = context.chat && isAhpChatChannel(context.chat) ? context.chat : buildDefaultChatUri(context.session);
		const state = this._stateManager.getChatState(chat) ?? (isDefaultChatUri(chat) ? this._stateManager.getSessionState(context.session) : undefined);
		// Prefer the model of the turn being served: the provider applies a turn's
		// model after admission, and a chat that is not resident has no selection.
		const selection = context.model
			?? state?.activeTurn?.message.model
			?? agent.chats.getModel?.(URI.parse(chat), createAgentChatContext(this._stateManager, context.session, chat))
			?? state?.turns.at(-1)?.message.model;
		if (!selection) {
			return undefined;
		}
		const model = agent.models.get().find(m => m.id === selection.id);
		if (model) {
			return readAgentModelByokIdentifier(model) !== undefined ? model.id : undefined;
		}
		// The Copilot agent drops BYOK models from its catalog while no renderer
		// serves them, but the chat keeps its selection; recognize it by its id.
		return agent.id === COPILOT_CLI_AGENT_PROVIDER_ID && isByokLmAgentModelId(selection.id) ? selection.id : undefined;
	}

	private _byokUtilityModelDefault(): AgentHostByokUtilityModelDefault {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostByokUtilityModelDefaultConfigKey) ?? 'copilot';
	}

	private async _byokChatCompletion(vendor: string, modelId: string, request: ICopilotUtilityChatCompletionRequest, signal: AbortSignal | undefined): Promise<string> {
		// Same keys as the Responses translation, and the same defaults as the Copilot route.
		const modelOptions: Record<string, unknown> = {
			temperature: request.temperature ?? UTILITY_DEFAULT_TEMPERATURE,
			top_p: UTILITY_DEFAULT_TOP_P,
			...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
		};
		const connection = this._byokBridgeRegistry.getServingConnection();
		if (!connection) {
			throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.ByokModelUnavailable);
		}
		const bridgeRequest: IByokLmChatRequest = {
			vendor,
			modelId,
			input: request.messages.map(message => ({
				type: 'message',
				role: message.role,
				content: [{ type: 'text', text: message.content }],
			})),
			modelOptions,
		};
		this._logService.debug(`[AgentHostUtilityModelService] BYOK utility request: ${vendor}/${modelId}`);
		const result = await raceAbort(connection.chat(bridgeRequest), signal);
		if (result.error) {
			throw new Error(`BYOK utility request failed for ${vendor}/${modelId}: ${result.error}`);
		}
		const text = result.output.flatMap(item => item.type === 'message' ? item.content.map(part => part.text) : []).join('');
		if (!text) {
			throw new Error(`BYOK utility request for ${vendor}/${modelId} returned no text content`);
		}
		return text;
	}
}

/** The bridge has no cancellation channel, so stop waiting when `signal` aborts. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (!signal) {
		return promise;
	}
	if (signal.aborted) {
		return Promise.reject(new CancellationError());
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new CancellationError());
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}
