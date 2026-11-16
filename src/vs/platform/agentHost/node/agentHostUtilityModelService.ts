/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { captureCredentialSource, isAuthRequiredError, type IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession, COPILOT_CLI_AGENT_PROVIDER_ID } from '../common/agent.js';
import { getByokLmAgentModelId, getByokLmSelectionModelId, IByokLmChatRequest, IByokLmChatResult, IByokLmModelInfo, isByokLmAgentModelId, resolveByokLmEnablement } from '../common/agentHostByokLm.js';
import { AgentHostByokModelsEnabledConfigKey, AgentHostByokUtilityModelDefault, AgentHostByokUtilityModelDefaultConfigKey, AgentHostUtilitySmallModelConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { readAgentModelByokIdentifier } from '../common/agentModelByokMeta.js';
import { readUsageInfoMeta } from '../common/meta/agentUsageMeta.js';
import { isModelRouterModelId } from '../common/modelRouter.js';
import { isAhpChatChannel, type ModelSelection, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { ICopilotApiService, ICopilotApiServiceRequestOptions, ICopilotUtilityChatCompletionRequest, UTILITY_DEFAULT_TEMPERATURE, UTILITY_DEFAULT_TOP_P } from './shared/copilotApiService.js';
import { getUtilityModelCallFailureOutcome, reportUtilityModelCall, toUtilityModelCallGitHubTelemetry, type IAgentHostUtilityModelCallReport } from './shared/utilityModelCallTelemetry.js';
import type { IAgentHostGitHubTelemetryContext } from './agentHostRestrictedTelemetry.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';

/** LM API vendor of Copilot models; an override naming it is not a BYOK model. */
const COPILOT_VENDOR = 'copilot';

/** The session, and optionally the chat, whose selected main agent model a utility request serves. */
export interface IAgentHostUtilityModelContext {
	readonly session: ProtocolURI;
	readonly credentialSource?: IAgentHostCredentialSource;
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
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	async chatCompletion(context: IAgentHostUtilityModelContext, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		const route = this._resolveRoute(context);
		const attributedRequest: ICopilotUtilityChatCompletionRequest = { ...request, telemetry: { ...request.telemetry, agentSessionId: AgentSession.id(context.session) } };
		if (route.kind === 'copilot') {
			// The Copilot API service reports Copilot calls.
			return this._copilotApiService.utilityChatCompletion(route.githubToken, attributedRequest, options);
		}
		return this._byokChatCompletion(context, route.vendor, route.modelId, attributedRequest, options?.signal);
	}

	private _resolveRoute(context: IAgentHostUtilityModelContext): UtilityModelRoute {
		return this._byokUtilityModelsSupported
			? this._resolveByokRoute(context) ?? this._resolveCopilotRoute(context)
			: this._resolveCopilotRoute(context);
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

	private _resolveCopilotRoute(context: IAgentHostUtilityModelContext): UtilityModelRoute {
		try {
			return this._captureCopilotRoute(context);
		} catch (error) {
			return this._throwUnavailableAuthentication(error);
		}
	}

	private _throwUnavailableAuthentication(error: unknown): never {
		if (isAuthRequiredError(error)) {
			this._logService.debug('[AgentHostUtilityModelService] Copilot utility model unavailable: sponsor authentication required');
			throw new AgentHostUtilityModelUnavailableError(AgentHostUtilityModelUnavailableReason.CopilotSignInRequired);
		}
		throw error;
	}

	private _captureCopilotRoute(context: IAgentHostUtilityModelContext): Extract<UtilityModelRoute, { readonly kind: 'copilot' }> {
		const resource = this._gitHubEndpointService.getCopilotResource();
		const source = context.credentialSource ?? this._authenticationService.getSessionCredentialSource(context.chat ?? context.session);
		const captured = source ? captureCredentialSource({
			principal: source.principal,
			getCredential: request => source.getCredential({ ...request, session: context.session }),
		}, [{ ...resource, required: false }]) : undefined;
		const githubToken = this._authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported, session: context.session }, captured);
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
		const chat = context.chat && isAhpChatChannel(context.chat) ? context.chat : this._chatOwnership.getDefaultChat(context.session);
		if (chat === undefined) {
			return undefined;
		}
		const agent = this._providerService.getProviderForChat(context.session, chat);
		if (!agent) {
			return undefined;
		}
		const state = this._stateManager.getChatState(chat) ?? (this._chatOwnership.isDefaultChat(context.session, chat) ? this._stateManager.getSessionState(context.session) : undefined);
		// Prefer the model of the turn being served: the provider applies a turn's
		// model after admission, and a chat that is not resident has no selection.
		// A model router is not a model; use its pick, or else the chat's applied model.
		const concrete = (candidate: ModelSelection | undefined) => candidate && !isModelRouterModelId(candidate.id) ? candidate : undefined;
		const routedModel = readUsageInfoMeta(state?.activeTurn?.usage).modelRouted?.chosenModel;
		const selection = concrete(context.model)
			?? (routedModel !== undefined ? { id: routedModel } : undefined)
			?? concrete(state?.activeTurn?.message.model)
			?? agent.chats.getModel?.(URI.parse(chat), createAgentChatContext(this._stateManager, this._authenticationService, context.session, chat, this._chatOwnership.resolveChatStorageResource(context.session, chat), this._sessionStateStore.peek(URI.parse(context.session))))
			?? concrete(state?.turns.at(-1)?.message.model);
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

	private async _byokChatCompletion(context: IAgentHostUtilityModelContext, vendor: string, modelId: string, request: ICopilotUtilityChatCompletionRequest, signal: AbortSignal | undefined): Promise<string> {
		const startTime = Date.now();
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
		const gitHubTelemetry = this._resolveByokGitHubTelemetry(context);
		const report = (outcome: IAgentHostUtilityModelCallReport['outcome'], usage?: IByokLmChatResult['usage']) => {
			const callReport: IAgentHostUtilityModelCallReport = {
				context: request.telemetry,
				outcome,
				isBYOK: true,
				promptTokenCount: usage?.inputTokens,
				completionTokens: usage?.outputTokens,
				tokenCount: usage?.inputTokens !== undefined && usage.outputTokens !== undefined ? usage.inputTokens + usage.outputTokens : undefined,
				reasoningTokens: usage?.reasoningTokens,
				timeToComplete: Date.now() - startTime,
			};
			void gitHubTelemetry.then(account => reportUtilityModelCall(this._telemetryService, { ...callReport, gitHubTelemetry: account }));
		};
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
		let result: IByokLmChatResult;
		try {
			result = await raceAbort(connection.chat(bridgeRequest), signal);
		} catch (error) {
			report(getUtilityModelCallFailureOutcome(error, signal));
			throw error;
		}
		const text = result.error ? '' : result.output.flatMap(item => item.type === 'message' ? item.content.map(part => part.text) : []).join('');
		report(text ? 'success' : 'error', result.usage);
		if (result.error) {
			throw new Error(`BYOK utility request failed for ${vendor}/${modelId}: ${result.error}`);
		}
		if (!text) {
			throw new Error(`BYOK utility request for ${vendor}/${modelId} returned no text content`);
		}
		return text;
	}

	/**
	 * The account a BYOK call's GitHub telemetry event is attributed to: the
	 * session's Copilot account, as in the Copilot Chat extension, which reports
	 * BYOK responses under the signed-in Copilot account. The credential is
	 * captured before the BYOK request starts and is used only to look up the
	 * account; no request content reaches Copilot. Resolves `undefined`,
	 * reporting the call on the Microsoft telemetry stream only, when the
	 * session has no Copilot credential or its account cannot be resolved.
	 */
	private async _resolveByokGitHubTelemetry(context: IAgentHostUtilityModelContext): Promise<IAgentHostGitHubTelemetryContext | undefined> {
		let githubToken: string;
		try {
			githubToken = this._captureCopilotRoute(context).githubToken;
		} catch {
			return undefined;
		}
		try {
			return toUtilityModelCallGitHubTelemetry(await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken));
		} catch (error) {
			this._logService.trace(`[AgentHostUtilityModelService] Copilot account unavailable for BYOK utility telemetry: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
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
