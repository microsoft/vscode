/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession, type IAgent } from '../common/agent.js';
import { AgentHostPrewarmSessionsConfigKey, AgentHostWorkspaceTrustConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentHostPrewarmSessionsSettingId, type IAgentServiceCreateSessionConfig } from '../common/agentService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ActionType } from '../common/state/sessionActions.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostSettingExperimentTrigger } from './agentHostSettingExperimentTrigger.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';

/** The session operations the prewarmer needs from the Agent Host service that owns it. */
export interface IAgentHostSessionPrewarmerHost {
	createSession(config: IAgentServiceCreateSessionConfig): Promise<URI>;
	disposeSession(session: URI): Promise<void>;
	/** The storage resource of a session's default chat, for building its chat context. */
	getDefaultChatStorageResource(session: URI, defaultChat: URI): string;
}

/** A freshly created, idle provisional draft that may be pre-warmed. */
export interface IAgentHostPrewarmCandidate {
	readonly provider: IAgent;
	readonly session: URI;
	readonly defaultChat: URI;
	/**
	 * The user-picked folder, which the session runs in (folder) or branches
	 * from (worktree), or `undefined` for a workspace-less draft, which runs in
	 * a provider-owned scratch folder.
	 */
	readonly workingDirectory: URI | undefined;
	readonly model: IAgentServiceCreateSessionConfig['model'];
	readonly agent: IAgentServiceCreateSessionConfig['agent'];
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
 * 4. the picked folder is trusted. A workspace-less draft has none: it runs
 *    in a provider-owned scratch folder that holds no workspace content, such
 *    as `.mcp.json` or hooks, for trust to protect, so it skips this gate.
 *
 * The experiment trigger is then logged — before the setting is read, so both
 * arms report the same moment — and only the treatment arm warms.
 *
 * A worktree draft's enablement stays pending until its worktree is created on
 * the first send, so it cannot warm itself. It instead gets a throwaway
 * folder-isolation draft over the same folder, which warms like any other
 * draft and is disposed, never claimed, when the worktree draft is sent or
 * disposed.
 *
 * By design, a worktree chat's own session always starts cold at its first
 * send. Warming only gives it a head start on what outlives a session, and
 * the throwaway draft's live MCP status is not shown on the worktree draft.
 * A client that keeps the isolation choice local until Send (the Agents
 * window) never creates a pending-worktree draft at all: its draft warms as a
 * folder draft, and the first send discards that warm session when the chat
 * moves into the worktree (see `CopilotAgent._claimOrReplaceWarmSession`).
 */
export class AgentHostSessionPrewarmer extends Disposable {

	private readonly _experimentTrigger: AgentHostSettingExperimentTrigger;
	/** In-flight gate evaluation and, for worktree drafts, the throwaway folder draft, per draft. */
	private readonly _drafts = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		private readonly _host: IAgentHostSessionPrewarmerHost,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostCustomizationEnablementService private readonly _enablementService: IAgentHostCustomizationEnablementService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
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
		const store = new DisposableStore();
		// Cancel before disposing, so the gate waiting on the token observes it.
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		this._drafts.set(sessionKey, store);
		this._prewarm(candidate, store, cancellation.token).catch(error => {
			this._logService.warn(`[AgentHostSessionPrewarmer] Failed to pre-warm ${sessionKey}`, error);
		});
	}

	/** Stops considering a draft once it was sent (materialized) or disposed, and disposes its throwaway folder draft. */
	onDraftEnded(session: URI): void {
		this._drafts.deleteAndDispose(session.toString());
	}

	private async _prewarm(candidate: IAgentHostPrewarmCandidate, store: DisposableStore, token: CancellationToken): Promise<void> {
		const sessionKey = candidate.session.toString();
		if (!await this._whenActiveClientArrived(sessionKey, token)) {
			return;
		}
		await this._enablementService.initializeSession(sessionKey);
		if (token.isCancellationRequested) {
			return;
		}
		const pickedFolder = candidate.workingDirectory;
		// A worktree draft always has a picked folder to branch from; without one it cannot warm through a throwaway.
		const pendingWorktree = !!pickedFolder && this._worktree.isWorkingDirectoryPending(AgentSession.id(candidate.session));
		if (!pendingWorktree && this._enablementService.getWorkingDirectoryState(sessionKey).kind === 'pending') {
			this._logService.trace(`[AgentHostSessionPrewarmer] Not pre-warming ${sessionKey}: customization enablement is pending`);
			return;
		}
		if (pickedFolder && !this._isTrusted(pickedFolder)) {
			this._logService.trace(`[AgentHostSessionPrewarmer] Not pre-warming ${sessionKey}: its folder is not trusted`);
			return;
		}
		// Copilot's runtime ships with the host and its client was already
		// started while the draft was created, so warming never causes a cold
		// SDK download.
		this._experimentTrigger.report();
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostPrewarmSessionsConfigKey) !== true) {
			return;
		}
		if (pendingWorktree) {
			await this._createFolderDraftForWorktreeDraft(candidate, pickedFolder, store, token);
			return;
		}
		const context = createAgentChatContext(this._stateManager, candidate.session, candidate.defaultChat, this._host.getDefaultChatStorageResource(candidate.session, candidate.defaultChat));
		await candidate.provider.chats.warmChat!(candidate.defaultChat, context);
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

	/**
	 * Creates the throwaway folder draft that warms on behalf of a worktree
	 * draft. Plugin installs, package caches and MCP sign-ins that VS Code
	 * stores carry over to the worktree session; per-session enablement
	 * decisions do not, because the paths differ. Its customizations, including
	 * live MCP status, are intentionally not mirrored onto the worktree draft,
	 * which would fight that draft's own customization publisher.
	 */
	private async _createFolderDraftForWorktreeDraft(candidate: IAgentHostPrewarmCandidate, pickedFolder: URI, store: DisposableStore, token: CancellationToken): Promise<void> {
		const sessionKey = candidate.session.toString();
		// Only what the launch needs: other config, such as a pull request or
		// branch, would turn the throwaway back into a worktree draft.
		const folderDraft = await this._host.createSession({
			provider: candidate.provider.id,
			workingDirectories: [pickedFolder],
			config: { [SessionConfigKey.Isolation]: 'folder' },
			activeClient: this._stateManager.getSessionState(sessionKey)?.activeClients[0],
			...(candidate.model ? { model: candidate.model } : {}),
			...(candidate.agent ? { agent: candidate.agent } : {}),
			legacyChatUris: undefined,
		});
		const disposeFolderDraft = () => this._host.disposeSession(folderDraft).catch(error => {
			this._logService.warn(`[AgentHostSessionPrewarmer] Failed to dispose throwaway folder draft ${folderDraft.toString()}`, error);
		});
		if (token.isCancellationRequested) {
			await disposeFolderDraft();
			return;
		}
		this._logService.info(`[AgentHostSessionPrewarmer] [warm] Warming worktree draft ${sessionKey} through throwaway folder draft ${folderDraft.toString()}`);
		store.add({ dispose: () => void disposeFolderDraft() });
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
