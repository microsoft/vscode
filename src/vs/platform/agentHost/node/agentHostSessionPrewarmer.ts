/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { type IAgent, type IAgentChatContext } from '../common/agent.js';
import { AgentHostPrewarmSessionsConfigKey, AgentHostWorkspaceTrustConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentHostPrewarmSessionsSettingId } from '../common/agentService.js';
import { ActionType } from '../common/state/sessionActions.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostSettingExperimentTrigger } from './agentHostSettingExperimentTrigger.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

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
 * creates such a draft: its draft warms as a folder draft, and a worktree
 * send discards that warm launch and starts cold in the worktree (see
 * `CopilotAgent._takeEarlyLaunch`).
 */
export class AgentHostSessionPrewarmer extends Disposable {

	private readonly _experimentTrigger: AgentHostSettingExperimentTrigger;
	/** Cancels a draft's in-flight gate evaluation once it ends. */
	private readonly _drafts = this._register(new DisposableMap<string, IDisposable>());

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
		const cancellation = new CancellationTokenSource();
		// Cancel before disposing, so the gate waiting on the token observes it.
		this._drafts.set(sessionKey, toDisposable(() => cancellation.dispose(true)));
		this._prewarm(candidate, cancellation.token).catch(error => {
			this._logService.warn(`[AgentHostSessionPrewarmer] Failed to pre-warm ${sessionKey}`, error);
		});
	}

	/** Stops considering a draft once it was sent (materialized) or disposed. */
	onDraftEnded(session: URI): void {
		this._drafts.deleteAndDispose(session.toString());
	}

	private async _prewarm(candidate: IAgentHostPrewarmCandidate, token: CancellationToken): Promise<void> {
		const sessionKey = candidate.session.toString();
		if (!await this._whenActiveClientArrived(sessionKey, token)) {
			return;
		}
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
			return;
		}
		// Copilot's runtime ships with the host and its client was already
		// started while the draft was created, so warming never causes a cold
		// SDK download.
		this._experimentTrigger.report();
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostPrewarmSessionsConfigKey) !== true) {
			return;
		}
		await candidate.provider.chats.warmChat!(candidate.defaultChat, this._host.getDefaultChatContext(candidate.session, candidate.defaultChat));
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
		const trust = this._configurationService.getRootValue(platformRootSchema, AgentHostWorkspaceTrustConfigKey);
		if (!trust) {
			return false;
		}
		if (!trust.enabled) {
			return true;
		}
		return trust.trustedUris.some(uri => {
			try {
				return extUriBiasedIgnorePathCase.isEqualOrParent(resource, URI.parse(uri));
			} catch {
				return false;
			}
		});
	}
}
