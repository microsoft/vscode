/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, Throttler } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { type IAgent, type IAgentChatContext, type IAgentWarmChatSelection } from '../common/agent.js';
import type { AgentHostPrewarmSkipReason } from '../common/agentHostTelemetry.js';
import { AgentHostPrewarmSessionsConfigKey, AgentHostWorkspaceTrustConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { isAgentHostWorkspaceTrusted } from '../common/agentHostWorkspaceTrust.js';
import { AgentHostPrewarmSessionsSettingId } from '../common/agentService.js';
import { isModelRouterModelId } from '../common/modelRouter.js';
import { ActionType, type ActionEnvelope } from '../common/state/sessionActions.js';
import type { Message } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostSettingExperimentTrigger } from './agentHostSettingExperimentTrigger.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { getApplicableTurnModel } from './agentHostTurnTelemetryContext.js';

/** What the prewarmer needs from the Agent Host service that owns it. */
export interface IAgentHostSessionPrewarmerHost {
	/** The operation context that addresses a session's default chat. */
	getDefaultChatContext(session: URI, defaultChat: URI): IAgentChatContext;
}

/** A freshly created, idle provisional draft that may be pre-warmed. */
export interface IAgentHostPrewarmCandidate {
	readonly provider: IAgent;
	readonly session: URI;
	readonly defaultChat: URI;
	/**
	 * Every folder the session launches with, or `undefined` for a
	 * workspace-less draft, which runs in a provider-owned scratch folder. The
	 * first is the user-picked folder, which the session runs in (folder) or
	 * branches from (worktree); the rest are additional (multi-root) roots,
	 * whose customizations, such as `.mcp.json`, also load at launch.
	 */
	readonly workingDirectories: readonly URI[] | undefined;
}

/**
 * Decides when a new provisional draft starts its provider runtime before the
 * first send ({@link IAgent.chats.warmChat}), behind the experiment-controlled
 * `chat.agentHost.experimental.prewarmSessions` setting.
 *
 * A draft warms only once every gate that does not depend on the experiment
 * has passed, in this order:
 *
 * 1. the provider supports warming;
 * 2. a client has published its active client (tools and client
 *    customizations), which are fixed in the launch: warming earlier would
 *    only be discarded by the first send;
 * 3. customization enablement for the session has resolved, because pending
 *    enablement fails closed: known connectors would start switched off and
 *    a connector with no decision yet could still ask for sign-in;
 * 4. every folder the session launches with is trusted: the picked folder and
 *    any additional (multi-root) roots, whose `.mcp.json` servers would
 *    otherwise start before the first send. A workspace-less draft has none:
 *    it runs in a provider-owned scratch folder that holds no workspace
 *    content, such as `.mcp.json` or hooks, for trust to protect, so it skips
 *    this gate.
 *
 * The experiment trigger is then logged — before the setting is read, so both
 * arms report the same moment — and only the treatment arm warms.
 *
 * A worktree draft never warms: its enablement stays pending until its
 * worktree is created on the first send, so it fails gate 3. A client that
 * keeps the isolation choice local until Send (the Agents window) never
 * creates such a draft: it creates the draft in the picked folder even when
 * the user picked a worktree, so the draft warms as a folder draft, and a
 * worktree send discards that warm launch and starts cold in the worktree
 * (see `CopilotAgent._takeEarlyLaunch`).
 *
 * Once warming, the draft is kept warm while the user composes. Its client
 * syncs the composer to the draft's default chat (`chat/draftChanged`). Each
 * change re-checks the gates above and asks the provider to warm again with
 * the composer's model and agent: a matching warm launch is kept and its
 * lifetime extended; one launched with another selection is replaced; and an
 * expired or torn-down one is launched again. The chat's own selection is not
 * changed: the first send sets it, and its claim still validates the launch.
 * Tracking ends when the draft's first turn starts.
 */
export class AgentHostSessionPrewarmer extends Disposable {

	private readonly _experimentTrigger: AgentHostSettingExperimentTrigger;
	/** The drafts still being considered, by session. */
	private readonly _drafts = this._register(new DisposableMap<string, PrewarmDraft>());
	/** The session of each tracked draft, by its default chat. */
	private readonly _sessionsByDefaultChat = new Map<string, string>();

	constructor(
		private readonly _host: IAgentHostSessionPrewarmerHost,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostCustomizationEnablementService private readonly _enablementService: IAgentHostCustomizationEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._experimentTrigger = this._register(new AgentHostSettingExperimentTrigger(AgentHostPrewarmSessionsSettingId, this._configurationService, telemetryService));
		this._register(this._stateManager.onDidEmitEnvelope(envelope => this._onDidEmitEnvelope(envelope)));
	}

	/**
	 * Considers warming a freshly created idle provisional draft. Callers pass
	 * only drafts that may run a provider session: not ephemeral or imported.
	 */
	onProvisionalSessionCreated(candidate: IAgentHostPrewarmCandidate): void {
		if (!candidate.provider.chats.warmChat) {
			return;
		}
		const sessionKey = candidate.session.toString();
		const draft = new PrewarmDraft(candidate);
		this._drafts.set(sessionKey, draft);
		this._sessionsByDefaultChat.set(candidate.defaultChat.toString(), sessionKey);
		this._prewarm(draft).catch(error => {
			this._logService.warn(`[AgentHostSessionPrewarmer] Failed to pre-warm ${sessionKey}`, error);
		});
	}

	/** Stops considering a draft once its first turn started, it was sent (materialized) or disposed. */
	onDraftEnded(session: URI): void {
		const sessionKey = session.toString();
		const draft = this._drafts.get(sessionKey);
		if (draft && this._sessionsByDefaultChat.get(draft.candidate.defaultChat.toString()) === sessionKey) {
			this._sessionsByDefaultChat.delete(draft.candidate.defaultChat.toString());
		}
		this._drafts.deleteAndDispose(sessionKey);
	}

	private _onDidEmitEnvelope(envelope: ActionEnvelope): void {
		const action = envelope.action;
		if (envelope.rejectionReason || (action.type !== ActionType.ChatDraftChanged && action.type !== ActionType.ChatTurnStarted)) {
			return;
		}
		const sessionKey = this._sessionsByDefaultChat.get(envelope.channel);
		const draft = sessionKey ? this._drafts.get(sessionKey) : undefined;
		if (!sessionKey || !draft) {
			return;
		}
		if (action.type === ActionType.ChatTurnStarted) {
			// From here the send owns the warm launch; a late composer change must not replace it.
			this.onDraftEnded(draft.candidate.session);
			return;
		}
		// A cleared draft is the composer handing over to its first send; it says nothing about what to warm.
		if (!action.draft) {
			return;
		}
		draft.selection = this._toWarmSelection(draft.candidate, action.draft);
		if (draft.armed) {
			draft.queue(() => this._rewarm(draft)).catch(error => {
				this._logService.warn(`[AgentHostSessionPrewarmer] Failed to keep ${sessionKey} warm`, error);
			});
		}
	}

	/** What the draft's composer would send with, as the first send would select it. */
	private _toWarmSelection(candidate: IAgentHostPrewarmCandidate, message: Message): IAgentWarmChatSelection {
		// A model router is resolved per turn, so it names no model to warm with.
		const requested = message.model && !isModelRouterModelId(message.model.id) ? message.model : undefined;
		return {
			model: getApplicableTurnModel(candidate.provider, this._stateManager.getSessionState(candidate.session.toString())?.provider, requested),
			agent: message.agent,
		};
	}

	private async _prewarm(draft: PrewarmDraft): Promise<void> {
		const { candidate, token } = draft;
		const sessionKey = candidate.session.toString();
		const noteSkipped = (reason: AgentHostPrewarmSkipReason) => candidate.provider.chats.noteWarmSkipped?.(candidate.defaultChat, this._host.getDefaultChatContext(candidate.session, candidate.defaultChat), reason);
		noteSkipped('awaitingActiveClient');
		if (!await this._whenActiveClientArrived(sessionKey, token)) {
			return;
		}
		noteSkipped('customizationsPending');
		await this._enablementService.initializeSession(sessionKey);
		if (token.isCancellationRequested) {
			return;
		}
		if (this._enablementService.getWorkingDirectoryState(sessionKey).kind === 'pending') {
			this._logService.trace(`[AgentHostSessionPrewarmer] Not pre-warming ${sessionKey}: customization enablement is pending`);
			return;
		}
		if (candidate.workingDirectories?.some(folder => !this._isTrusted(folder))) {
			this._logService.trace(`[AgentHostSessionPrewarmer] Not pre-warming ${sessionKey}: one of its folders is not trusted`);
			noteSkipped('untrustedFolder');
			return;
		}
		// Copilot's runtime ships with the host and its client was already
		// started while the draft was created, so warming never causes a cold
		// SDK download.
		this._experimentTrigger.report();
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostPrewarmSessionsConfigKey) === false) {
			noteSkipped('disabled');
			return;
		}
		draft.armed = true;
		// Composer changes that arrived while the gates were pending shape this launch; later ones queue behind it.
		await draft.queue(() => this._warm(draft));
	}

	/** Keeps an armed draft warm after a composer change, while the gates `_prewarm` passed still hold. */
	private async _rewarm(draft: PrewarmDraft): Promise<void> {
		const { candidate } = draft;
		const sessionKey = candidate.session.toString();
		if (draft.token.isCancellationRequested || !this._stateManager.isIdleProvisionalSession(sessionKey)) {
			return;
		}
		// Trust, the active client and customization enablement can change after the draft first warmed.
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostPrewarmSessionsConfigKey) === false
			|| (this._stateManager.getSessionState(sessionKey)?.activeClients.length ?? 0) === 0
			|| this._enablementService.getWorkingDirectoryState(sessionKey).kind === 'pending'
			|| candidate.workingDirectories?.some(folder => !this._isTrusted(folder))) {
			this._logService.trace(`[AgentHostSessionPrewarmer] Not keeping ${sessionKey} warm: a pre-warm gate no longer passes`);
			return;
		}
		await this._warm(draft);
	}

	private async _warm(draft: PrewarmDraft): Promise<void> {
		if (draft.token.isCancellationRequested) {
			return;
		}
		const { candidate } = draft;
		await candidate.provider.chats.warmChat!(candidate.defaultChat, this._host.getDefaultChatContext(candidate.session, candidate.defaultChat), draft.selection);
	}

	/** Resolves `true` once the draft has an active client, or `false` if it ended first. */
	private async _whenActiveClientArrived(sessionKey: string, token: CancellationToken): Promise<boolean> {
		const hasActiveClient = () => (this._stateManager.getSessionState(sessionKey)?.activeClients.length ?? 0) > 0;
		if (hasActiveClient()) {
			return true;
		}
		const arrival = Event.toPromise(Event.filter(this._stateManager.onDidEmitEnvelope, envelope => envelope.channel === sessionKey && envelope.action.type === ActionType.SessionActiveClientSet));
		try {
			// Cancelling `arrival` only removes its listener without settling it, so race the token instead.
			await raceCancellation(arrival, token);
		} finally {
			arrival.cancel();
		}
		return !token.isCancellationRequested && hasActiveClient();
	}

	/** Mirrors the trust check that gates workspace hooks: an absent trust configuration is untrusted. */
	private _isTrusted(resource: URI): boolean {
		return isAgentHostWorkspaceTrusted(resource, this._configurationService.getRootValue(platformRootSchema, AgentHostWorkspaceTrustConfigKey));
	}
}

/** A draft the prewarmer considers until its first turn starts or it ends. */
class PrewarmDraft extends Disposable {

	private readonly _cancellation = new CancellationTokenSource();
	/** Coalesces composer changes: one warm request runs at a time, then only the latest waiting one. */
	private readonly _throttler = this._register(new Throttler());
	/** Whether the draft passed every gate with warming enabled, so composer changes keep it warm. */
	armed = false;
	/** The composer's latest model and agent, from its draft; `undefined` until it syncs one. */
	selection: IAgentWarmChatSelection | undefined;

	constructor(readonly candidate: IAgentHostPrewarmCandidate) {
		super();
		// Cancel before disposing, so work waiting on the token observes it.
		this._register(toDisposable(() => this._cancellation.dispose(true)));
	}

	get token(): CancellationToken {
		return this._cancellation.token;
	}

	queue(task: () => Promise<void>): Promise<void> {
		return this._throttler.queue(task);
	}
}
