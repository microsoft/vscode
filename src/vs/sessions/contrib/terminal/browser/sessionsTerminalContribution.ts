/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ICreateTerminalOptions, ITerminalChatService, ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { ITerminalChatOwner, terminalChatOwnersEqual } from '../../../../platform/terminal/common/terminal.js';
import { ChatLayoutContext, IChatLayoutOwner, IChatLayoutSnapshot, getChatLayoutOwnerAfterReplacement } from '../../../common/chatLayout.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ITerminalProfileService } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { ISessionTaskRunnerRegistry } from '../../chat/browser/sessionTaskRunner.js';
import { AgentHostSessionTaskRunner } from './agentHostSessionTaskRunner.js';

interface ISessionTerminalInfo {
	/** The cwd to use for terminal matching/creation. For agent host sessions this is the unwrapped file URI. */
	readonly cwd: URI;
	/** When set, the terminal should be created on the agent host rather than locally. */
	readonly agentHostCwd?: URI;
}

interface IPendingTerminalOperation {
	count: number;
	replaced: boolean;
}

/** The address of the local agent host, which runs on this machine; see {@link IAgentHostTerminalService.createTerminalForEntry}. */
const LOCAL_AGENT_HOST_ADDRESS = '__local__';

interface ITrackedTerminalScope {
	readonly sessionId: string;
	readonly key: string;
	readonly agentHostAddress: string | undefined;
	readonly owner?: ITerminalChatOwner;
}

/**
 * Returns the session's filesystem working directory for terminal matching and creation.
 * Returns `undefined` when no filesystem working directory is available.
 */
function getSessionTerminalInfo(session: ISession | undefined, reader?: IReader): ISessionTerminalInfo | undefined {
	if (!session) {
		return undefined;
	}
	const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
	return getWorkspaceTerminalInfo(workspace);
}

function getActiveSessionTerminalInfo(session: IActiveSession | undefined, reader?: IReader): ISessionTerminalInfo | undefined {
	if (!session) {
		return undefined;
	}
	const activeChat = reader ? session.activeChat.read(reader) : session.activeChat.get();
	const workspace = reader ? activeChat.workspace.read(reader) : activeChat.workspace.get();
	return getWorkspaceTerminalInfo(workspace);
}

function getWorkspaceTerminalInfo(workspace: ISessionWorkspace | undefined): ISessionTerminalInfo | undefined {
	if (workspace?.isVirtualWorkspace !== false) {
		return undefined;
	}
	const folder = workspace.folders[0];
	const cwd = folder?.workingDirectory;
	if (!cwd) {
		return undefined;
	}
	const terminalCwd = fromAgentHostUri(cwd);
	if (terminalCwd.scheme !== Schemas.file && terminalCwd.scheme !== Schemas.vscodeRemote) {
		return undefined;
	}
	if (cwd.scheme === AGENT_HOST_SCHEME) {
		return { cwd: terminalCwd, agentHostCwd: cwd };
	}
	return { cwd };
}

function getSessionWorktreeCwd(session: ISession): URI | undefined {
	const worktree = session.workspace.get()?.folders[0]?.gitRepository?.workTreeUri;
	return worktree?.scheme === AGENT_HOST_SCHEME ? undefined : worktree;
}

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals are tracked per session id and shown/hidden based on that association.
 * - Terminals created before session-id tracking fall back to initial cwd matching
 *   until they are associated with a session in this window.
 * - Terminals for archived/removed sessions are closed using their tracked
 *   session id association.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private _activeKey: string | undefined;
	private _activeAgentHostAddress: string | undefined;
	private _activeSessionId: string | undefined;
	private readonly _sessionTerminals = new Map<string, Set<number>>();
	private readonly _trackedTerminalScopes = new Map<number, ITrackedTerminalScope>();
	private readonly _standaloneTerminalIds = new Set<number>();
	/** In-flight terminal work for drafts, retained only until each operation settles. */
	private readonly _pendingTerminalOperations = new Map<string, IPendingTerminalOperation>();
	private readonly _sessionTerminalGenerations = new Map<string, number>();
	private readonly _chatContext: ChatLayoutContext;
	private readonly _chatOperations = new Map<string, Promise<ITerminalInstance[]>>();
	private readonly _deletedChats = new Set<string>();
	private readonly _ownerReplacements = new Map<string, ITerminalChatOwner>();

	/**
	 * Session ids already processed as archived. The archive cleanup runs only
	 * on the not-archived → archived transition: the provider keeps archived
	 * sessions cached and re-emits them in `changed` on every sync, so acting on
	 * the current archived state would re-run the cwd cleanup each time and sweep
	 * terminals the user opened afterwards. See #313510, #318645.
	 */
	private readonly _archivedSessionIds = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@ILogService private readonly _logService: ILogService,
		@IPathService private readonly _pathService: IPathService,
		@IFileService private readonly _fileService: IFileService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
	) {
		super();
		this._chatContext = this._register(new ChatLayoutContext(this._layoutService.chatLayoutPresentation, this._sessionsService.activeSession));
		this._register(this._terminalService.registerChatOwnerProvider(options => this._getCreationOwner(options), owner => {
			const snapshot = this._chatContext.state.get();
			return !this._layoutService.chatLayoutPresentation.enabled
				|| snapshot.presentation.active && !!snapshot.owner && terminalChatOwnersEqual(this._toTerminalOwner(snapshot.owner), owner);
		}, owner => {
			const presentation = this._layoutService.chatLayoutPresentation.state.get();
			const active = this._sessionsService.activeSession.get();
			const session = isEqual(active?.resource, URI.parse(owner.sessionResource)) ? active : this._sessionsManagementService.getSessions().find(candidate => candidate.resource.toString() === owner.sessionResource);
			const chat = session?.chats.get().find(candidate => candidate.resource.toString() === owner.chatResource) ?? (session?.mainChat.get().resource.toString() === owner.chatResource ? session.mainChat.get() : undefined);
			const generation = session && this._getTerminalOperationGeneration(session.sessionId);
			return {
				cwd: getWorkspaceTerminalInfo(chat?.workspace.get())?.cwd,
				isCurrent: () => this._layoutService.chatLayoutPresentation.isCurrent(presentation) && !this._isChatDeleted(owner)
					&& !this._ownerReplacements.has(JSON.stringify(owner)) && (!session || !session.isArchived.get() && this._getTerminalOperationGeneration(session.sessionId) === generation),
			};
		}));
		this._register(this._sessionsManagementService.onDidDeleteChat(e => {
			if (!this._layoutService.chatLayoutPresentation.state.get().active) {
				return;
			}
			this._deletedChats.add(JSON.stringify([e.sessionResource.toString(), e.chatResource.toString()]));
			void this._closeChatSessionTerminals(e.session, false, e.chatResource, e.sessionResource).catch(error => this._logService.error('[SessionsTerminal] Failed to close deleted chat terminals', error));
		}));

		// Seed with sessions that are already archived (e.g. restored archived
		// from a previous window) so they are not treated as newly archived on
		// their first change event.
		for (const session of this._sessionsManagementService.getSessions()) {
			if (session.isArchived.get()) {
				this._archivedSessionIds.add(session.sessionId);
			}
		}

		const profileOverride = derived(reader => {
			const presentation = this._layoutService.chatLayoutPresentation;
			if (presentation.enabled && !presentation.state.read(reader).active) {
				return;
			}
			const session = this._sessionsService.activeSession.read(reader);
			if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID && !presentation.enabled) {
				return; // no need to override local default profiles with the local AH
			}

			const address = this._getSessionAgentHostAddress(session);
			if (!address) {
				return;
			}

			const profiles = this._agentHostTerminalService.profiles.read(reader);
			return profiles.find(p => p.address === address) ?? this._agentHostTerminalService.getProfileForConnection(address);
		});

		this._register(autorun(reader => {
			const profile = profileOverride.read(reader);
			if (profile) {
				reader.store.add(this._terminalProfileService.overrideDefaultProfile(
					profile.extensionIdentifier, profile.profileId,
				));
			}
		}));

		// Keep the default cwd in sync with the active session's working directory
		// so that "New Terminal" uses it automatically.
		// This is a little hacky but I don't see any better approach.
		this._register(autorun(reader => {
			const presentation = this._layoutService.chatLayoutPresentation;
			if (presentation.enabled && !presentation.state.read(reader).active) {
				return;
			}
			const session = this._sessionsService.activeSession.read(reader);
			const remoteConnectionStatus = session?.remoteConnectionStatus?.read(reader);
			const remoteHostAvailable = remoteConnectionStatus === undefined || remoteConnectionStatus.kind === 'connected';
			if (session?.loading.read(reader) || session?.isArchived.read(reader) || session?.worktreePending?.read(reader) || !remoteHostAvailable) {
				this._agentHostTerminalService.setDefaultCwd(undefined);
				return;
			}
			const info = getActiveSessionTerminalInfo(session, reader);
			this._agentHostTerminalService.setDefaultCwd(info?.cwd);
		}));

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
			if (this._layoutService.chatLayoutPresentation.enabled) {
				const snapshot = this._chatContext.state.read(reader);
				const session = this._sessionsService.activeSession.read(reader);
				const info = getActiveSessionTerminalInfo(session, reader);
				const available = !session?.loading.read(reader) && !session?.isArchived.read(reader) && !session?.worktreePending?.read(reader)
					&& (session?.remoteConnectionStatus?.read(reader)?.kind ?? 'connected') === 'connected';
				if (snapshot.presentation.active && session && snapshot.owner && available) {
					void this._activateChatTerminals(session, info, snapshot).catch(error => this._logService.error('[SessionsTerminal] Failed to activate chat terminals', error));
				}
				return;
			}
			const session = this._sessionsService.activeSession.read(reader);
			const isArchived = session?.isArchived.read(reader);
			const worktreePending = session?.worktreePending?.read(reader);
			const remoteConnectionStatus = session?.remoteConnectionStatus?.read(reader);
			const remoteHostAvailable = remoteConnectionStatus === undefined || remoteConnectionStatus.kind === 'connected';
			const remoteHostPermanentlyUnavailable = remoteConnectionStatus?.kind === 'disconnected' || remoteConnectionStatus?.kind === 'incompatible';
			const preserveActiveTerminalState = !remoteHostPermanentlyUnavailable
				&& !remoteHostAvailable
				&& this._activeSessionId === session?.sessionId;
			if (session && !isArchived && this._archivedSessionIds.delete(session.sessionId)) {
				this._invalidateTerminalOperations(session.sessionId);
			}
			if (session?.loading.read(reader) || isArchived || worktreePending || !remoteHostAvailable) {
				if (session && (isArchived || worktreePending || !remoteHostAvailable)) {
					this._invalidateTerminalOperations(session.sessionId);
				}
				if (!preserveActiveTerminalState) {
					this._activeKey = undefined;
					this._activeAgentHostAddress = undefined;
					this._activeSessionId = undefined;
				}
				return;
			}
			const info = getActiveSessionTerminalInfo(session, reader);
			this._onActiveSessionChanged(session, info);
		}));

		// Repeated New Session actions replace one draft with another. Transfer
		// the old draft's terminals when both drafts use the same cwd and backend.
		this._register(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
			if (this._layoutService.chatLayoutPresentation.enabled) {
				this._replaceChatTerminalOwners(from, to, true);
				return;
			}
			this._onDidReplaceNewDraftSession(from, to);
		}));

		// When a session is replaced (untitled → committed graduation), transfer
		// tracked terminals from the old session id to the new one so they are
		// not orphaned and closed by the removal cleanup.
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			if (this._layoutService.chatLayoutPresentation.enabled) {
				this._replaceChatTerminalOwners(from, to, false);
				return;
			}
			this._transferTerminals(from.sessionId, to.sessionId, to);
		}));

		// Clean up tracked terminal ids when terminals are externally disposed
		// (e.g. user closes a terminal tab) so the map doesn't hold stale entries.
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			this._removeTerminalFromTrackedSessions(instance.instanceId);
			this._standaloneTerminalIds.delete(instance.instanceId);
		}));

		// Hide restored terminals from a previous window session that don't
		// belong to the current active session. These arrive asynchronously
		// during reconnection and would otherwise flash in the foreground.
		this._register(this._terminalService.onDidCreateInstance(instance => {
			if (this._layoutService.chatLayoutPresentation.enabled) {
				const snapshot = this._chatContext.state.get();
				if (snapshot.presentation.active && this._isEligibleChatTerminal(instance)) {
					let owner = this._getTerminalOwner(instance);
					const replacement = owner && this._ownerReplacements.get(JSON.stringify(owner));
					if (replacement) {
						owner = replacement;
						void instance.setChatOwner(replacement).catch(error => this._logService.error('[SessionsTerminal] Failed to transfer pending terminal ownership', error));
					}
					if (owner && this._isChatDeleted(owner)) {
						const deletedOwner = owner;
						void this._terminalService.safeDisposeTerminal(instance, () => this._layoutService.chatLayoutPresentation.isCurrent(snapshot.presentation) && terminalChatOwnersEqual(this._getTerminalOwner(instance), deletedOwner))
							.catch(error => this._logService.error('[SessionsTerminal] Failed to close late deleted chat terminal', error));
						return;
					}
					if (owner && !terminalChatOwnersEqual(owner, snapshot.owner && this._toTerminalOwner(snapshot.owner))) {
						this._terminalService.moveToBackground(instance);
					}
				}
				return;
			}
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.attachPersistentProcess?.chatOwner && instance.shellLaunchConfig.attachPersistentProcess.hideFromUser !== true) {
				instance.shellLaunchConfig.hideFromUser = false;
			}
			if (instance.shellLaunchConfig.hideFromUser) {
				return;
			}
			if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
				instance.getInitialCwd().then(cwd => {
					if (cwd.toLowerCase() !== this._activeKey) {
						const availableInstance = this._getAvailableTerminal(instance, `hide restored terminal for ${cwd}`);
						if (!availableInstance) {
							return;
						}
						this._terminalService.moveToBackground(availableInstance);
						this._logService.trace(`[SessionsTerminal] Hid restored terminal ${availableInstance.instanceId} (cwd: ${cwd})`);
					}
				});
			}
		}));

		// Clean up terminals for archived/removed sessions using their tracked
		// session-to-terminal associations.
		//
		// Archive disposes session-owned terminals; restore creates a fresh terminal after worktree readiness.
		//
		// The archive cleanup runs only on the not-archived → archived transition.
		// The provider keeps archived sessions cached and re-emits them in
		// `changed` on every sync; acting on the current archived state would
		// re-run the cwd cleanup each time and sweep terminals the user opened
		// after archiving.
		//
		// Removal protects the active terminal because `removed` also represents untitled → committed graduation.

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			if (this._layoutService.chatLayoutPresentation.enabled) {
				if (!this._layoutService.chatLayoutPresentation.state.get().active) {
					return;
				}
				for (const session of e.added) {
					if (session.isArchived.get()) {
						this._archivedSessionIds.add(session.sessionId);
					}
				}
				for (const session of e.changed) {
					if (session.isArchived.get() && !this._archivedSessionIds.has(session.sessionId)) {
						this._archivedSessionIds.add(session.sessionId);
						this._invalidateTerminalOperations(session.sessionId);
						void this._closeChatSessionTerminals(session, true).catch(error => this._logService.error('[SessionsTerminal] Failed to close archived chat terminals', error));
					} else if (!session.isArchived.get()) {
						this._archivedSessionIds.delete(session.sessionId);
					}
				}
				for (const session of e.removed) {
					this._invalidateTerminalOperations(session.sessionId);
					void this._closeChatSessionTerminals(session, false).catch(error => this._logService.error('[SessionsTerminal] Failed to close removed chat terminals', error));
				}
				return;
			}
			// Only act on the not-archived → archived transition; ignore re-emits
			// of sessions already known to be archived. Keep the tracked set in
			// sync: record sessions that arrive already-archived (e.g. restored
			// from a previous window) so they never count as a fresh transition,
			// and drop ids that were un-archived or removed.
			for (const session of e.added) {
				if (session.isArchived.get()) {
					this._archivedSessionIds.add(session.sessionId);
				}
			}
			const justArchived: ISession[] = [];
			for (const session of e.changed) {
				if (session.isArchived.get()) {
					if (!this._archivedSessionIds.has(session.sessionId)) {
						this._archivedSessionIds.add(session.sessionId);
						this._invalidateTerminalOperations(session.sessionId);
						justArchived.push(session);
					}
				} else {
					if (this._archivedSessionIds.delete(session.sessionId)) {
						this._invalidateTerminalOperations(session.sessionId);
					}
				}
			}
			for (const session of e.removed) {
				this._archivedSessionIds.delete(session.sessionId);
			}
			if (e.removed.length === 0 && justArchived.length === 0) {
				return;
			}
			this._logService.trace(`[SessionsTerminal] onDidChangeSessions cleanup (removed: ${e.removed.length}, justArchived: ${justArchived.length}, trackedSessions: ${this._sessionTerminals.size}, activeKey: ${this._activeKey ?? '<none>'})`);
			for (const session of e.removed) {
				void this._closeTerminalsForSession(session.sessionId, `session removed (${session.sessionId})`).finally(() => this._sessionTerminals.delete(session.sessionId));
			}
			for (const session of justArchived) {
				void this._closeArchivedSessionTerminals(session);
			}
		}));
	}

	/**
	 * Ensures a terminal exists for the given cwd. When a session is provided,
	 * tracked terminals for that session id are preferred; otherwise the method
	 * falls back to matching untracked terminals by initial cwd for backward
	 * compatibility before creating a new terminal. Sets newly created terminals
	 * as active and optionally focuses them.
	 *
	 * When {@link session} is provided and the session is backed by an agent
	 * host, the terminal is created on the agent host instead of locally.
	 */
	async ensureTerminal(cwd: URI, focus: boolean, session?: ISession): Promise<ITerminalInstance[]> {
		if (this._layoutService.chatLayoutPresentation.enabled && session) {
			const presentation = this._layoutService.chatLayoutPresentation.state.get();
			if (!presentation.active) {
				return [];
			}
			const active = this._sessionsService.activeSession.get();
			const owner = this._toTerminalOwner({ sessionResource: session.resource, chatResource: isEqual(active?.resource, session.resource) ? active!.activeChat.get().resource : session.mainChat.get().resource }, session);
			return this._ensureChatTerminal(cwd, session, owner);
		}
		if (!session) {
			return this._ensureTerminal(cwd, focus, session);
		}
		if (!this._isSessionRemoteHostAvailable(session)) {
			return [];
		}

		const generation = this._getTerminalOperationGeneration(session.sessionId);
		this._beginTerminalOperation(session.sessionId);
		try {
			return await this._ensureTerminal(cwd, focus, session, generation);
		} finally {
			this._endTerminalOperation(session.sessionId);
		}
	}

	private async _ensureTerminal(cwd: URI, focus: boolean, session?: ISession, generation?: number, requireCwdMatch = false): Promise<ITerminalInstance[]> {
		if (session && this._isTerminalOperationCancelled(session, generation)) {
			return [];
		}

		const key = cwd.fsPath.toLowerCase();
		const agentHostAddress = this._getSessionAgentHostAddress(session);
		const sessionOwner = session && this._toTerminalOwner({ sessionResource: session.resource, chatResource: session.mainChat.get().resource }, session);
		let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
		if (requireCwdMatch && existing.length > 0) {
			existing = await this._filterTerminalsForScope(existing, key, agentHostAddress);
		}
		if (existing.length === 0) {
			// Only terminals on this session's backend, so a session never runs commands on another host.
			existing = await this._filterTerminalsForScope(await this._findTerminalsForKey(key, { excludeTracked: !!session }), key, agentHostAddress);
			if (session && this._isTerminalOperationCancelled(session, generation)) {
				return [];
			}
		}

		if (existing.length === 0) {
			try {
				const instance = await this._createTerminalForSession(cwd, session, sessionOwner);
				const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
				if (!createdInstance) {
					return [];
				}
				if (session && this._isTerminalOperationCancelled(session, generation)) {
					await this._terminalService.safeDisposeTerminal(createdInstance);
					if (!createdInstance.isDisposed) {
						this._trackTerminalsForSession(session.sessionId, [createdInstance]);
					}
					return [];
				}
				existing = [createdInstance];
				this._terminalService.setActiveInstance(createdInstance);
				this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
			} catch (e) {
				this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
				return [];
			}
		}

		if (session) {
			this._trackTerminalsForSession(session.sessionId, existing, { sessionId: session.sessionId, key, agentHostAddress, owner: sessionOwner });
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}

		return existing;
	}

	private async _filterTerminalsForScope(instances: readonly ITerminalInstance[], key: string, agentHostAddress: string | undefined): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of instances) {
			if (await this._terminalMatchesScope(instance, key, agentHostAddress)) {
				result.push(instance);
			}
		}
		return result;
	}

	private _isTerminalOperationCancelled(session: ISession, generation = this._getTerminalOperationGeneration(session.sessionId)): boolean {
		return this._pendingTerminalOperations.get(session.sessionId)?.replaced === true
			|| this._getTerminalOperationGeneration(session.sessionId) !== generation
			|| this._archivedSessionIds.has(session.sessionId)
			|| session.isArchived.get()
			|| session.worktreePending?.get() === true
			|| !this._isSessionRemoteHostAvailable(session);
	}

	private _isSessionRemoteHostAvailable(session: ISession): boolean {
		const status = session.remoteConnectionStatus?.get();
		return status === undefined || status.kind === 'connected';
	}

	private _getTerminalOperationGeneration(sessionId: string): number {
		return this._sessionTerminalGenerations.get(sessionId) ?? 0;
	}

	private _invalidateTerminalOperations(sessionId: string): void {
		this._sessionTerminalGenerations.set(sessionId, this._getTerminalOperationGeneration(sessionId) + 1);
	}

	/**
	 * Creates a terminal for the given cwd. If the session is backed by an
	 * agent host, creates an agent host terminal; otherwise creates a local one.
	 */
	private async _createTerminalForSession(cwd: URI, session: ISession | undefined, sessionOwner?: ITerminalChatOwner): Promise<ITerminalInstance> {
		const address = session && this._getSessionAgentHostAddress(session);
		if (address) {
			const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd, sessionOwner });
			if (instance) {
				return instance;
			}
		}
		return this._terminalService.createTerminal({ config: { cwd, sessionOwner } });
	}

	/**
	 * Returns the agent host address for the given session's provider,
	 * or `undefined` if the session is not backed by an agent host.
	 */
	private _getSessionAgentHostAddress(session: ISession | undefined): string | undefined {
		if (!session) {
			return undefined;
		}
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.remoteAddress ?? LOCAL_AGENT_HOST_ADDRESS;
	}

	private async _onActiveSessionChanged(session: IActiveSession | undefined, info = getActiveSessionTerminalInfo(session)): Promise<void> {
		if (!session) {
			return;
		}
		if (!info && session.activeChat.get().workspace.get()?.isVirtualWorkspace === false) {
			this._logService.trace(`[SessionsTerminal] Waiting for a filesystem working directory for ${session.sessionId}`);
			return;
		}

		this._beginTerminalOperation(session.sessionId);
		try {
			const generation = this._getTerminalOperationGeneration(session.sessionId);
			// A legacy session's worktree checkout may not be materialized yet (it is
			// recreated lazily on the first send). Launching a local terminal into a
			// missing cwd fails with "starting directory does not exist", so defer
			// until the directory exists; a later session refresh retries.
			if (info?.cwd && !info.agentHostCwd && info.cwd.scheme === Schemas.file && !(await this._fileService.exists(info.cwd))) {
				return;
			}
			const targetPath = info?.cwd ?? await this._pathService.userHome();
			const targetKey = targetPath.fsPath.toLowerCase();
			const targetAgentHostAddress = this._getSessionAgentHostAddress(session);
			if (this._activeKey === targetKey && this._activeAgentHostAddress === targetAgentHostAddress && this._activeSessionId === session.sessionId) {
				return;
			}
			this._activeKey = targetKey;
			this._activeAgentHostAddress = targetAgentHostAddress;
			this._activeSessionId = session.sessionId;

			const instances = await this._ensureTerminal(targetPath, false, session, generation, true);

			// If the active session or key changed while we were awaiting, a newer
			// call has taken over — skip the visibility update to avoid flicker.
			if (this._activeKey !== targetKey || this._activeAgentHostAddress !== targetAgentHostAddress || this._activeSessionId !== session.sessionId) {
				return;
			}
			await this._updateTerminalVisibility(session, targetKey, targetAgentHostAddress, instances.map(instance => instance.instanceId));
		} finally {
			this._endTerminalOperation(session.sessionId);
		}
	}

	/**
	 * Finds all terminal instances whose initial cwd (lower-cased) matches
	 * the given key.
	 */
	private async _findTerminalsForKey(key: string, options?: { excludeTracked?: boolean }): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of this._terminalService.instances) {
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.hideFromUser) {
				continue;
			}
			if (options?.excludeTracked && (this._isTerminalTracked(instance.instanceId) || this._standaloneTerminalIds.has(instance.instanceId))) {
				continue;
			}
			try {
				const cwd = await instance.getInitialCwd();
				if (cwd.toLowerCase() === key) {
					result.push(instance);
				}
			} catch {
				// ignore terminals whose cwd cannot be resolved
			}
		}
		return result;
	}

	private _trackTerminalsForSession(sessionId: string, instances: readonly ITerminalInstance[], scope?: ITrackedTerminalScope): void {
		if (instances.length === 0) {
			return;
		}
		let terminalIds = this._sessionTerminals.get(sessionId);
		if (!terminalIds) {
			terminalIds = new Set<number>();
			this._sessionTerminals.set(sessionId, terminalIds);
		}
		for (const instance of instances) {
			terminalIds.add(instance.instanceId);
			if (scope) {
				this._trackedTerminalScopes.set(instance.instanceId, scope);
				if (scope.owner) {
					void instance.setSessionOwner(scope.owner).catch(error => this._logService.error('[SessionsTerminal] Failed to persist session terminal ownership', error));
				}
			}
		}
	}

	private _beginTerminalOperation(sessionId: string): void {
		const operation = this._pendingTerminalOperations.get(sessionId);
		if (operation) {
			operation.count++;
			return;
		}
		this._pendingTerminalOperations.set(sessionId, { count: 1, replaced: false });
	}

	private _endTerminalOperation(sessionId: string): void {
		const operation = this._pendingTerminalOperations.get(sessionId);
		if (!operation) {
			return;
		}
		operation.count--;
		if (operation.count > 0) {
			return;
		}
		this._pendingTerminalOperations.delete(sessionId);
	}

	private _onDidReplaceNewDraftSession(from: ISession, to: ISession): void {
		const pendingOperation = this._pendingTerminalOperations.get(from.sessionId);
		if (pendingOperation) {
			pendingOperation.replaced = true;
		}

		const fromCwd = getSessionTerminalInfo(from)?.cwd.fsPath.toLowerCase();
		const toCwd = getSessionTerminalInfo(to)?.cwd.fsPath.toLowerCase();
		const fromAgentHostAddress = this._getSessionAgentHostAddress(from);
		const toAgentHostAddress = this._getSessionAgentHostAddress(to);
		if (fromCwd === toCwd && fromAgentHostAddress === toAgentHostAddress) {
			this._transferTerminals(from.sessionId, to.sessionId, to);
		} else {
			this._rehomeTerminals(from.sessionId);
		}
	}

	private _rehomeTerminals(sessionId: string): void {
		const terminals = this._getTrackedTerminalsForSession(sessionId);
		for (const terminal of terminals) {
			this._standaloneTerminalIds.add(terminal.instanceId);
			this._trackedTerminalScopes.delete(terminal.instanceId);
			void terminal.setSessionOwner(undefined).catch(error => this._logService.error('[SessionsTerminal] Failed to clear standalone terminal ownership', error));
		}
		if (terminals.length > 0) {
			this._logService.trace(`[SessionsTerminal] Rehomed ${terminals.length} terminal(s) from session ${sessionId}`);
		}
		this._sessionTerminals.delete(sessionId);
	}

	private _transferTerminals(fromSessionId: string, toSessionId: string, targetSession?: ISession): void {
		const terminalIds = this._sessionTerminals.get(fromSessionId);
		if (terminalIds && terminalIds.size > 0) {
			let targetIds = this._sessionTerminals.get(toSessionId);
			if (!targetIds) {
				targetIds = new Set<number>();
				this._sessionTerminals.set(toSessionId, targetIds);
			}
			for (const id of terminalIds) {
				targetIds.add(id);
				const instance = this._terminalService.getInstanceFromId(id);
				if (instance && targetSession) {
					const owner = this._toTerminalOwner({ sessionResource: targetSession.resource, chatResource: targetSession.mainChat.get().resource }, targetSession);
					void instance.setSessionOwner(owner).catch(error => this._logService.error('[SessionsTerminal] Failed to transfer persisted session ownership', error));
				}
			}
			this._logService.trace(`[SessionsTerminal] Transferred ${terminalIds.size} terminal(s) from session ${fromSessionId} to ${toSessionId}`);
		}
		this._sessionTerminals.delete(fromSessionId);
	}

	private _getTrackedTerminalsForSession(sessionId: string): ITerminalInstance[] {
		const terminalIds = this._sessionTerminals.get(sessionId);
		if (!terminalIds) {
			return [];
		}

		const result: ITerminalInstance[] = [];
		for (const instanceId of [...terminalIds]) {
			const instance = this._terminalService.getInstanceFromId(instanceId);
			if (!instance || instance.isDisposed || instance.shellLaunchConfig.hideFromUser) {
				terminalIds.delete(instanceId);
				continue;
			}
			result.push(instance);
		}

		if (terminalIds.size === 0) {
			this._sessionTerminals.delete(sessionId);
		}

		return result;
	}

	private _isTerminalTracked(instanceId: number): boolean {
		for (const [sessionId, terminalIds] of this._sessionTerminals) {
			if (terminalIds.has(instanceId)) {
				const instance = this._terminalService.getInstanceFromId(instanceId);
				if (!instance || instance.isDisposed) {
					terminalIds.delete(instanceId);
					this._trackedTerminalScopes.delete(instanceId);
					if (terminalIds.size === 0) {
						this._sessionTerminals.delete(sessionId);
					}
					continue;
				}
				return true;
			}
		}
		return false;
	}

	private _removeTerminalFromTrackedSessions(instanceId: number): void {
		for (const [sessionId, terminalIds] of this._sessionTerminals) {
			terminalIds.delete(instanceId);
			this._trackedTerminalScopes.delete(instanceId);
			if (terminalIds.size === 0) {
				this._sessionTerminals.delete(sessionId);
			}
		}
	}

	private _getAvailableTerminal(instance: ITerminalInstance, action: string): ITerminalInstance | undefined {
		const currentInstance = this._terminalService.getInstanceFromId(instance.instanceId);
		if (!currentInstance || currentInstance.isDisposed) {
			this._logService.trace(`[SessionsTerminal] Cannot ${action}; terminal ${instance.instanceId} is no longer available`);
			return undefined;
		}
		return currentInstance;
	}

	/**
	 * Shows background terminals that belong to the active session and hides
	 * foreground terminals that belong to other sessions. When the active
	 * session has no tracked terminals yet, falls back to initial cwd matching
	 * for compatibility with restored terminals from previous sessions.
	 */
	private async _terminalMatchesScope(instance: ITerminalInstance, key: string, agentHostAddress: string | undefined): Promise<boolean> {
		const trackedScope = this._trackedTerminalScopes.get(instance.instanceId);
		if (trackedScope) {
			return trackedScope.key === key && trackedScope.agentHostAddress === agentHostAddress;
		}
		// Terminals this contribution did not create, such as task and manually
		// created terminals, match by the backend they run on and their cwd.
		const instanceAgentHostAddress = this._agentHostTerminalService.getAgentHostAddress(instance);
		if (instanceAgentHostAddress !== undefined) {
			if (instanceAgentHostAddress !== agentHostAddress) {
				return false;
			}
		} else if (instance.shellLaunchConfig.customPtyImplementation || (agentHostAddress !== undefined && agentHostAddress !== LOCAL_AGENT_HOST_ADDRESS)) {
			// A terminal of an unknown backend, or a local terminal for a remote host.
			return false;
		}
		try {
			return (await instance.getInitialCwd()).toLowerCase() === key;
		} catch {
			return false;
		}
	}

	private async _updateTerminalVisibility(activeSession: ISession, activeKey: string, activeAgentHostAddress: string | undefined, forceForegroundTerminalIds: number[]): Promise<void> {
		const toShow: ITerminalInstance[] = [];
		const toHide: ITerminalInstance[] = [];
		const trackedTerminalIds = new Set(this._getTrackedTerminalsForSession(activeSession.sessionId).map(instance => instance.instanceId));

		for (const instance of [...this._terminalService.instances]) {
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.hideFromUser || this._standaloneTerminalIds.has(instance.instanceId)) {
				continue;
			}
			const currentInstance = this._getAvailableTerminal(instance, 'update terminal visibility');
			if (!currentInstance) {
				continue;
			}

			const isForeground = this._terminalService.foregroundInstances.includes(currentInstance);
			const matchesActiveScope = await this._terminalMatchesScope(currentInstance, activeKey, activeAgentHostAddress);
			const isForceVisible = forceForegroundTerminalIds.includes(currentInstance.instanceId) && matchesActiveScope;
			let belongsToActiveSession = trackedTerminalIds.has(currentInstance.instanceId) && matchesActiveScope;
			if (!belongsToActiveSession && !this._isTerminalTracked(currentInstance.instanceId)) {
				belongsToActiveSession = matchesActiveScope;
			}
			if ((belongsToActiveSession || isForceVisible) && !isForeground) {
				toShow.push(currentInstance);
			} else if (!belongsToActiveSession && !isForceVisible && isForeground) {
				toHide.push(currentInstance);
			}
		}

		for (const instance of toShow) {
			const availableInstance = this._getAvailableTerminal(instance, 'show background terminal');
			if (availableInstance) {
				await this._terminalService.showBackgroundTerminal(availableInstance, true);
			}
		}
		for (const instance of toHide) {
			const availableInstance = this._getAvailableTerminal(instance, 'move terminal to background');
			if (availableInstance) {
				this._logService.debug(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (does not belong to active key ${activeKey})`);
				this._terminalService.moveToBackground(availableInstance);
			}
		}

		// Set the terminal with the most recent command as active
		const foreground = this._terminalService.foregroundInstances;
		let mostRecent: ITerminalInstance | undefined;
		let mostRecentTimestamp = -1;
		for (const instance of foreground) {
			if (this._standaloneTerminalIds.has(instance.instanceId)) {
				continue;
			}
			if (!await this._terminalMatchesScope(instance, activeKey, activeAgentHostAddress)) {
				continue;
			}
			const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			const lastCmd = cmdDetection?.commands.at(-1);
			if (lastCmd && lastCmd.timestamp > mostRecentTimestamp) {
				mostRecentTimestamp = lastCmd.timestamp;
				mostRecent = instance;
			}
		}
		if (mostRecent) {
			this._terminalService.setActiveInstance(mostRecent);
		}
	}

	/**
	 * Disposes (kills) terminals associated with the given session id. Used
	 * when a session is removed: removal is an explicit user action, so the pty
	 * is torn down.
	 *
	 * Never disposes the terminal the user is currently working in. Removal also
	 * covers session *graduation* (untitled → committed via `onDidReplaceSession`,
	 * which surfaces the skeleton in `removed`): the focused (active) instance is
	 * therefore always protected.
	 *
	 * {@link reason} is logged for each killed terminal so unexpected disposals in
	 * the agents window can be diagnosed from the logs. See #313510, #318645.
	 */
	private async _closeTerminalsForSession(sessionId: string, reason: string): Promise<void> {
		const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
		for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
			if (protectedInstanceId !== undefined && instance.instanceId === protectedInstanceId) {
				this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
				continue;
			}
			const availableInstance = this._getAvailableTerminal(instance, `close removed session terminal for session ${sessionId}`);
			if (!availableInstance) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Killing terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
			await this._terminalService.safeDisposeTerminal(availableInstance);
			if (availableInstance.isDisposed) {
				this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
			}
		}
	}

	private async _closeArchivedSessionTerminals(session: ISession): Promise<void> {
		const cleanupGeneration = this._getTerminalOperationGeneration(session.sessionId);
		const terminals = new Map(this._getTrackedTerminalsForSession(session.sessionId).map(instance => [instance.instanceId, instance]));
		const untrackedWorktreeTerminalIds = new Set<number>();
		const worktreeCwd = getSessionWorktreeCwd(session);
		const anotherLiveSessionSharesWorktree = worktreeCwd && this._sessionsManagementService.getSessions().some(candidate =>
			candidate.sessionId !== session.sessionId
			&& !candidate.isArchived.get()
			&& isEqual(getSessionWorktreeCwd(candidate), worktreeCwd)
		);
		if (worktreeCwd && !anotherLiveSessionSharesWorktree) {
			for (const instance of await this._findUntrackedTerminalsForResource(worktreeCwd)) {
				if (instance.instanceId === this._terminalService.activeInstance?.instanceId) {
					continue;
				}
				terminals.set(instance.instanceId, instance);
				untrackedWorktreeTerminalIds.add(instance.instanceId);
			}
		}
		if (!this._isArchiveCleanupCurrent(session.sessionId, cleanupGeneration)) {
			return;
		}

		for (const instance of terminals.values()) {
			if (!this._isArchiveCleanupCurrent(session.sessionId, cleanupGeneration)) {
				return;
			}
			if (untrackedWorktreeTerminalIds.has(instance.instanceId)
				&& (this._isTerminalTracked(instance.instanceId)
					|| this._standaloneTerminalIds.has(instance.instanceId)
					|| this._terminalService.activeInstance?.instanceId === instance.instanceId)) {
				continue;
			}
			const availableInstance = this._getAvailableTerminal(instance, `close archived session terminal for session ${session.sessionId}`);
			if (!availableInstance) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Killing terminal ${availableInstance.instanceId} (session archived: ${session.sessionId})`);
			await this._terminalService.safeDisposeTerminal(availableInstance);
			if (availableInstance.isDisposed) {
				this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
			}
			if (!this._isArchiveCleanupCurrent(session.sessionId, cleanupGeneration)) {
				await this._ensureActiveSessionTerminalAfterLateArchiveCleanup(session.sessionId);
				return;
			}
		}
	}

	private _isArchiveCleanupCurrent(sessionId: string, generation: number): boolean {
		return this._archivedSessionIds.has(sessionId)
			&& this._getTerminalOperationGeneration(sessionId) === generation;
	}

	private async _ensureActiveSessionTerminalAfterLateArchiveCleanup(sessionId: string): Promise<void> {
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession
			|| activeSession.sessionId !== sessionId
			|| activeSession.isArchived.get()
			|| activeSession.loading.get()
			|| activeSession.worktreePending?.get()) {
			return;
		}
		this._activeKey = undefined;
		this._activeAgentHostAddress = undefined;
		this._activeSessionId = undefined;
		await this._onActiveSessionChanged(activeSession);
	}

	private async _findUntrackedTerminalsForResource(resource: URI): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of this._terminalService.instances) {
			if (!instance.shellLaunchConfig.attachPersistentProcess
				|| instance.shellLaunchConfig.hideFromUser
				|| this._isTerminalTracked(instance.instanceId)
				|| this._standaloneTerminalIds.has(instance.instanceId)) {
				continue;
			}
			try {
				if (isEqual(URI.file(await instance.getInitialCwd()), resource)
					&& !this._isTerminalTracked(instance.instanceId)
					&& !this._standaloneTerminalIds.has(instance.instanceId)) {
					result.push(instance);
				}
			} catch {
				// Ignore terminals whose cwd cannot be resolved.
			}
		}
		return result;
	}

	private _toTerminalOwner(owner: IChatLayoutOwner, session?: ISession): ITerminalChatOwner {
		session ??= this._sessionsManagementService.getSessions().find(candidate => isEqual(candidate.resource, owner.sessionResource))
			?? (isEqual(this._sessionsService.activeSession.get()?.resource, owner.sessionResource) ? this._sessionsService.activeSession.get() : undefined);
		const address = this._getSessionAgentHostAddress(session);
		return Object.freeze({ backend: address ? `agentHost:${address}` : this._terminalService.defaultBackendIdentity, sessionResource: owner.sessionResource.toString(), chatResource: owner.chatResource.toString() });
	}

	private _resolveChatOwner(chatResource: URI): ITerminalChatOwner | undefined {
		const active = this._sessionsService.activeSession.get();
		const sessions = active ? [active, ...this._sessionsManagementService.getSessions()] : this._sessionsManagementService.getSessions();
		for (const session of sessions) {
			if (session.chats.get().some(chat => isEqual(chat.resource, chatResource)) || isEqual(session.mainChat.get().resource, chatResource)) {
				const owner = this._toTerminalOwner({ sessionResource: session.resource, chatResource }, session);
				return this._ownerReplacements.get(JSON.stringify(owner)) ?? owner;
			}
		}
		return undefined;
	}

	private _getCreationOwner(options: ICreateTerminalOptions | undefined): ITerminalChatOwner | undefined {
		if (!this._layoutService.chatLayoutPresentation.state.get().active) {
			return undefined;
		}
		if (options?.originChatResource) {
			return this._resolveChatOwner(options.originChatResource);
		}
		const config = options?.config;
		if (config && !hasKey(config, { extensionIdentifier: true }) && !hasKey(config, { isDefault: true }) && (config.attachPersistentProcess || config.isFeatureTerminal || config.hideFromUser)) {
			return undefined;
		}
		const owner = this._chatContext.state.get().owner;
		return owner && this._toTerminalOwner(owner);
	}

	private _getTerminalOwner(instance: ITerminalInstance): ITerminalChatOwner | undefined {
		const chatResource = this._terminalChatService.getChatSessionResourceForInstance(instance);
		const stored = instance.shellLaunchConfig.chatOwner ?? instance.shellLaunchConfig.attachPersistentProcess?.chatOwner;
		const associated = chatResource && this._resolveChatOwner(chatResource);
		return associated ? Object.freeze({ ...associated, backend: stored?.backend ?? associated.backend }) : stored;
	}

	private _isChatDeleted(owner: ITerminalChatOwner): boolean {
		return this._deletedChats.has(JSON.stringify([owner.sessionResource, owner.chatResource]));
	}

	private _isEligibleChatTerminal(instance: ITerminalInstance): boolean {
		return !instance.isDisposed && (!instance.shellLaunchConfig.hideFromUser
			|| !!(instance.shellLaunchConfig.attachPersistentProcess?.chatOwner ?? instance.shellLaunchConfig.attachPersistentProcess?.sessionOwner) && instance.shellLaunchConfig.attachPersistentProcess?.hideFromUser !== true);
	}

	private _getChatTerminals(owner: ITerminalChatOwner): ITerminalInstance[] {
		return this._terminalService.instances.filter(instance => this._isEligibleChatTerminal(instance) && terminalChatOwnersEqual(this._getTerminalOwner(instance), owner));
	}

	private async _ensureChatTerminal(cwd: URI, session: ISession, owner: ITerminalChatOwner): Promise<ITerminalInstance[]> {
		const key = JSON.stringify(owner);
		const pending = this._chatOperations.get(key);
		if (pending) {
			return pending;
		}
		const presentation = this._layoutService.chatLayoutPresentation.state.get();
		const generation = this._getTerminalOperationGeneration(session.sessionId);
		const operation = (async () => {
			if (!presentation.active || this._isChatDeleted(owner) || session.isArchived.get() || !this._isSessionRemoteHostAvailable(session)) {
				return [];
			}
			if (isEqual(session.mainChat.get().resource, URI.parse(owner.chatResource))) {
				const legacyInstances = this._terminalService.instances.filter(instance => {
					const legacyOwner = instance.shellLaunchConfig.sessionOwner ?? instance.shellLaunchConfig.attachPersistentProcess?.sessionOwner;
					return this._isEligibleChatTerminal(instance) && legacyOwner?.backend === owner.backend && legacyOwner.sessionResource === owner.sessionResource;
				});
				for (const instance of new Set([...this._getTrackedTerminalsForSession(session.sessionId), ...legacyInstances])) {
					if (!this._getTerminalOwner(instance)) {
						await instance.setChatOwner(owner);
					}
				}
			}
			const existing = await this._filterTerminalsForScope(this._getChatTerminals(owner), cwd.fsPath.toLowerCase(), this._getSessionAgentHostAddress(session));
			if (existing.length > 0) {
				return existing;
			}
			if (!this._layoutService.chatLayoutPresentation.isCurrent(presentation)) {
				return [];
			}
			const address = this._getSessionAgentHostAddress(session);
			const instance = address
				? await this._agentHostTerminalService.createTerminalForEntry(address, { cwd, chatOwner: owner })
				: await this._terminalService.createTerminal({ config: { cwd }, chatOwner: owner });
			if (!instance) {
				throw new Error(`Failed to create owned terminal on agent host ${address}`);
			}
			if (!instance.shellLaunchConfig.chatOwner) {
				await instance.setChatOwner(owner);
			}
			if (!this._layoutService.chatLayoutPresentation.isCurrent(presentation)) {
				return [];
			}
			const replacement = this._ownerReplacements.get(key);
			if (replacement) {
				await instance.setChatOwner(replacement);
			}
			if (!replacement && (this._isChatDeleted(owner) || generation !== this._getTerminalOperationGeneration(session.sessionId) || session.isArchived.get())) {
				await this._terminalService.safeDisposeTerminal(instance, () => this._layoutService.chatLayoutPresentation.isCurrent(presentation) && terminalChatOwnersEqual(this._getTerminalOwner(instance), owner));
				return [];
			}
			return instance.isDisposed ? [] : [instance];
		})();
		this._chatOperations.set(key, operation);
		try {
			return await operation;
		} catch (error) {
			if (!isCancellationError(error)) {
				throw error;
			}
			this._logService.trace('[SessionsTerminal] Owned terminal creation was canceled', owner);
			return [];
		} finally {
			for (const [pendingKey, pendingOperation] of this._chatOperations) {
				if (pendingOperation === operation) {
					this._chatOperations.delete(pendingKey);
				}
			}
		}
	}

	private async _activateChatTerminals(session: IActiveSession, info: ISessionTerminalInfo | undefined, snapshot: IChatLayoutSnapshot): Promise<void> {
		if (!snapshot.owner || !this._chatContext.isCurrent(snapshot)) {
			return;
		}
		if (info?.cwd && !info.agentHostCwd && info.cwd.scheme === Schemas.file && !await this._fileService.exists(info.cwd)) {
			return;
		}
		const cwd = info?.cwd ?? await this._pathService.userHome();
		if (!this._chatContext.isCurrent(snapshot)) {
			return;
		}
		const owner = this._toTerminalOwner(snapshot.owner, session);
		let terminals = await this._ensureChatTerminal(cwd, session, owner);
		if (!this._chatContext.isCurrent(snapshot)) {
			return;
		}
		if (terminals.length === 0 && !this._isChatDeleted(owner) && !session.isArchived.get() && this._isSessionRemoteHostAvailable(session)) {
			terminals = await this._ensureChatTerminal(cwd, session, owner);
		}
		if (!this._chatContext.isCurrent(snapshot)) {
			return;
		}
		for (const instance of this._terminalService.instances) {
			if (!this._isEligibleChatTerminal(instance) || !this._getTerminalOwner(instance)) {
				continue;
			}
			if (!this._chatContext.isCurrent(snapshot)) {
				return;
			}
			if (terminalChatOwnersEqual(this._getTerminalOwner(instance), owner)) {
				await this._terminalService.showBackgroundTerminal(instance, true, true);
			} else {
				this._terminalService.moveToBackground(instance);
			}
		}
		if (!this._chatContext.isCurrent(snapshot)) {
			return;
		}
		let mostRecent = terminals[0];
		let timestamp = -1;
		for (const instance of this._getChatTerminals(owner)) {
			const command = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands.at(-1);
			if (command && command.timestamp > timestamp) {
				timestamp = command.timestamp;
				mostRecent = instance;
			}
		}
		if (mostRecent) {
			this._terminalService.setActiveInstance(mostRecent);
		}
	}

	private _replaceChatTerminalOwners(from: ISession, to: ISession, draft: boolean): void {
		if (!this._layoutService.chatLayoutPresentation.state.get().active) {
			return;
		}
		const mainOwner = this._toTerminalOwner({ sessionResource: from.resource, chatResource: from.mainChat.get().resource }, from);
		const instances = this._terminalService.instances.map(instance => ({ instance, owner: this._getTerminalOwner(instance) }));
		const sameScope = !draft || getSessionTerminalInfo(from)?.cwd.fsPath === getSessionTerminalInfo(to)?.cwd.fsPath
			&& this._getSessionAgentHostAddress(from) === this._getSessionAgentHostAddress(to);
		const target = sameScope ? this._toTerminalOwner(getChatLayoutOwnerAfterReplacement({ sessionResource: from.resource, chatResource: from.mainChat.get().resource }, { from, to }), to) : undefined;
		if (target) {
			this._ownerReplacements.set(JSON.stringify(mainOwner), target);
			const pending = this._chatOperations.get(JSON.stringify(mainOwner));
			if (pending) {
				this._chatOperations.set(JSON.stringify(target), pending);
			}
		}
		for (const [key, previous] of this._ownerReplacements) {
			if (previous.sessionResource !== from.resource.toString()) {
				continue;
			}
			if (sameScope) {
				this._ownerReplacements.set(key, this._toTerminalOwner(getChatLayoutOwnerAfterReplacement({ sessionResource: from.resource, chatResource: URI.parse(previous.chatResource) }, { from, to }), to));
			} else {
				this._ownerReplacements.delete(key);
			}
		}
		for (const [key, operation] of [...this._chatOperations]) {
			const pendingOwner: ITerminalChatOwner = JSON.parse(key);
			if (sameScope && pendingOwner.sessionResource === from.resource.toString()) {
				const replacement = this._toTerminalOwner(getChatLayoutOwnerAfterReplacement({ sessionResource: from.resource, chatResource: URI.parse(pendingOwner.chatResource) }, { from, to }), to);
				this._ownerReplacements.set(key, replacement);
				this._chatOperations.set(JSON.stringify(replacement), operation);
			}
		}
		for (const { instance, owner } of instances) {
			if (!owner || !isEqual(URI.parse(owner.sessionResource), from.resource)) {
				continue;
			}
			const replacement = sameScope ? this._toTerminalOwner(getChatLayoutOwnerAfterReplacement({ sessionResource: from.resource, chatResource: URI.parse(owner.chatResource) }, { from, to }), to) : undefined;
			if (replacement) {
				this._ownerReplacements.set(JSON.stringify(owner), replacement);
			}
			void instance.setChatOwner(replacement).catch(error => this._logService.error('[SessionsTerminal] Failed to transfer terminal ownership', error));
			if (replacement && this._terminalChatService.getChatSessionResourceForInstance(instance)) {
				this._terminalChatService.registerTerminalInstanceWithChatSession(URI.parse(replacement.chatResource), instance);
			}
		}
		this._invalidateTerminalOperations(from.sessionId);
	}

	private async _closeChatSessionTerminals(session: ISession, archived: boolean, chatResource?: URI, sessionResource: URI = session.resource): Promise<void> {
		const generation = this._getTerminalOperationGeneration(session.sessionId);
		const isCurrent = () => generation === this._getTerminalOperationGeneration(session.sessionId) && (!archived || session.isArchived.get());
		const owners = new Map<string, ITerminalChatOwner>();
		for (const instance of this._terminalService.instances) {
			const owner = this._getTerminalOwner(instance);
			if (owner && isEqual(URI.parse(owner.sessionResource), sessionResource) && (!chatResource || isEqual(URI.parse(owner.chatResource), chatResource))) {
				owners.set(JSON.stringify(owner), owner);
			}
		}
		for (const owner of owners.values()) {
			await this._closeChatTerminals(owner, archived, isCurrent, !chatResource);
		}
		if (archived && !isCurrent() && !session.isArchived.get()) {
			const active = this._sessionsService.activeSession.get();
			if (isEqual(active?.resource, session.resource) && active) {
				await this._activateChatTerminals(active, getActiveSessionTerminalInfo(active), this._chatContext.state.get());
			}
		}
	}

	private async _closeChatTerminals(owner: ITerminalChatOwner, archived: boolean, isCurrent: () => boolean, protectActive: boolean): Promise<void> {
		const presentation = this._layoutService.chatLayoutPresentation.state.get();
		const protectedInstance = archived || !protectActive ? undefined : this._terminalService.activeInstance;
		for (const instance of this._getChatTerminals(owner)) {
			if (!this._layoutService.chatLayoutPresentation.isCurrent(presentation) || !isCurrent()) {
				return;
			}
			if (instance === protectedInstance || !terminalChatOwnersEqual(this._getTerminalOwner(instance), owner)) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Closing chat terminal ${instance.instanceId} (${owner.chatResource})`);
			await this._terminalService.safeDisposeTerminal(instance, () => this._layoutService.chatLayoutPresentation.isCurrent(presentation) && isCurrent() && terminalChatOwnersEqual(this._getTerminalOwner(instance), owner));
		}
	}

	async dumpTracking(): Promise<void> {
		console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
		console.log(`[SessionsTerminal] Session terminals: ${JSON.stringify([...this._sessionTerminals.entries()].map(([sessionId, terminalIds]) => [sessionId, [...terminalIds]]))}`);
		console.log(`[SessionsTerminal] Standalone terminals: ${JSON.stringify([...this._standaloneTerminalIds])}`);
		console.log('[SessionsTerminal] === All Terminals ===');
		for (const instance of this._terminalService.instances) {
			let cwd = '<unknown>';
			try { cwd = await instance.getInitialCwd(); } catch { /* ignored */ }
			const isForeground = this._terminalService.foregroundInstances.includes(instance);
			console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? 'foreground' : 'background'}`);
		}
	}

	async showAllTerminals(): Promise<void> {
		for (const instance of this._terminalService.instances) {
			if (!this._terminalService.foregroundInstances.includes(instance)) {
				await this._terminalService.showBackgroundTerminal(instance, true);
				this._logService.trace(`[SessionsTerminal] Moved terminal ${instance.instanceId} to foreground`);
			}
		}
	}
}

registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);

/**
 * Registers an {@link AgentHostSessionTaskRunner} with the
 * {@link ISessionTaskRunnerRegistry}. Lives next to the other agent-host
 * terminal wiring so that the runner is removed together with the rest of
 * the sessions terminal contribution if the agents app shuts down.
 */
class RegisterAgentHostSessionTaskRunnerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.registerAgentHostTaskRunner';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionTaskRunnerRegistry registry: ISessionTaskRunnerRegistry,
	) {
		super();
		const runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
		this._register(registry.register(runner));
	}
}

registerWorkbenchContribution2(RegisterAgentHostSessionTaskRunnerContribution.ID, RegisterAgentHostSessionTaskRunnerContribution, WorkbenchPhase.BlockStartup);

class DumpTerminalTrackingAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.dumpTerminalTracking',
			title: localize2('dumpTerminalTracking', "Dump Terminal Tracking"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.dumpTracking();
	}
}

registerAction2(DumpTerminalTrackingAction);

class ShowAllTerminalsAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.showAllTerminals',
			title: localize2('showAllTerminals', "Show All Terminals"),
			f1: true,
		});
	}

	override async run(): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		await contribution.showAllTerminals();
	}
}

registerAction2(ShowAllTerminalsAction);
