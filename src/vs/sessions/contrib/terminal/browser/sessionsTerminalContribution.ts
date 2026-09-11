/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
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

/**
 * Returns terminal info for the given session: worktree or repository path for
 * workspace-backed agent sessions. Returns `undefined` for sessions without a
 * workspace (e.g. Cloud), or when no path is available.
 */
function getSessionTerminalInfo(session: ISession | undefined, reader?: IReader): ISessionTerminalInfo | undefined {
	if (!session) {
		return undefined;
	}
	const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
	if (workspace?.isVirtualWorkspace !== false) {
		return undefined;
	}
	const folder = workspace.folders[0];
	const cwd = folder?.workingDirectory;
	if (!cwd) {
		return undefined;
	}
	if (cwd.scheme === AGENT_HOST_SCHEME) {
		return { cwd: fromAgentHostUri(cwd), agentHostCwd: cwd };
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
	private _activeSessionId: string | undefined;
	private readonly _sessionTerminals = new Map<string, Set<number>>();
	private readonly _standaloneTerminalIds = new Set<number>();
	/** In-flight terminal work for drafts, retained only until each operation settles. */
	private readonly _pendingTerminalOperations = new Map<string, IPendingTerminalOperation>();
	private readonly _sessionTerminalGenerations = new Map<string, number>();

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
	) {
		super();

		// Seed with sessions that are already archived (e.g. restored archived
		// from a previous window) so they are not treated as newly archived on
		// their first change event.
		for (const session of this._sessionsManagementService.getSessions()) {
			if (session.isArchived.get()) {
				this._archivedSessionIds.add(session.sessionId);
			}
		}

		const profileOverride = derived(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
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
			const session = this._sessionsService.activeSession.read(reader);
			const remoteConnectionStatus = session?.remoteConnectionStatus?.read(reader);
			const remoteHostAvailable = remoteConnectionStatus === undefined || remoteConnectionStatus.kind === 'connected';
			if (session?.loading.read(reader) || session?.isArchived.read(reader) || session?.worktreePending?.read(reader) || !remoteHostAvailable) {
				this._agentHostTerminalService.setDefaultCwd(undefined);
				return;
			}
			const info = getSessionTerminalInfo(session, reader);
			this._agentHostTerminalService.setDefaultCwd(info?.cwd);
		}));

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
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
					this._activeSessionId = undefined;
				}
				return;
			}
			this._onActiveSessionChanged(session);
		}));

		// Repeated New Session actions replace one draft with another. Transfer
		// the old draft's terminals when both drafts use the same cwd and backend.
		this._register(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
			this._onDidReplaceNewDraftSession(from, to);
		}));

		// When a session is replaced (untitled → committed graduation), transfer
		// tracked terminals from the old session id to the new one so they are
		// not orphaned and closed by the removal cleanup.
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			this._transferTerminals(from.sessionId, to.sessionId);
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
			// Skip hidden tool terminals — managed by the chat tool lifecycle
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

	private async _ensureTerminal(cwd: URI, focus: boolean, session?: ISession, generation?: number): Promise<ITerminalInstance[]> {
		if (session && this._isTerminalOperationCancelled(session, generation)) {
			return [];
		}

		const key = cwd.fsPath.toLowerCase();
		let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
		if (existing.length === 0) {
			existing = await this._findTerminalsForKey(key, { excludeTracked: !!session });
			if (session && this._isTerminalOperationCancelled(session, generation)) {
				return [];
			}
		}

		if (existing.length === 0) {
			try {
				const instance = await this._createTerminalForSession(cwd, session);
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
			this._trackTerminalsForSession(session.sessionId, existing);
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}

		return existing;
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
	private async _createTerminalForSession(cwd: URI, session: ISession | undefined): Promise<ITerminalInstance> {
		const address = session && this._getSessionAgentHostAddress(session);
		if (address) {
			const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd });
			if (instance) {
				return instance;
			}
		}
		return this._terminalService.createTerminal({ config: { cwd } });
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
		return provider.remoteAddress ?? '__local__';
	}

	private async _onActiveSessionChanged(session: ISession | undefined): Promise<void> {
		if (!session) {
			return;
		}

		this._beginTerminalOperation(session.sessionId);
		try {
			const generation = this._getTerminalOperationGeneration(session.sessionId);
			const info = getSessionTerminalInfo(session);
			// A legacy session's worktree checkout may not be materialized yet (it is
			// recreated lazily on the first send). Launching a local terminal into a
			// missing cwd fails with "starting directory does not exist", so defer
			// until the directory exists; a later session refresh retries.
			if (info?.cwd && !info.agentHostCwd && info.cwd.scheme === Schemas.file && !(await this._fileService.exists(info.cwd))) {
				return;
			}
			const targetPath = info?.cwd ?? await this._pathService.userHome();
			const targetKey = targetPath.fsPath.toLowerCase();
			if (this._activeKey === targetKey && this._activeSessionId === session.sessionId) {
				return;
			}
			this._activeKey = targetKey;
			this._activeSessionId = session.sessionId;

			const instances = await this._ensureTerminal(targetPath, false, session, generation);

			// If the active session or key changed while we were awaiting, a newer
			// call has taken over — skip the visibility update to avoid flicker.
			if (this._activeKey !== targetKey || this._activeSessionId !== session.sessionId) {
				return;
			}
			await this._updateTerminalVisibility(session, targetKey, instances.map(instance => instance.instanceId));
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

	private _trackTerminalsForSession(sessionId: string, instances: readonly ITerminalInstance[]): void {
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
			this._transferTerminals(from.sessionId, to.sessionId);
		} else {
			this._rehomeTerminals(from.sessionId);
		}
	}

	private _rehomeTerminals(sessionId: string): void {
		const terminals = this._getTrackedTerminalsForSession(sessionId);
		for (const terminal of terminals) {
			this._standaloneTerminalIds.add(terminal.instanceId);
		}
		if (terminals.length > 0) {
			this._logService.trace(`[SessionsTerminal] Rehomed ${terminals.length} terminal(s) from session ${sessionId}`);
		}
		this._sessionTerminals.delete(sessionId);
	}

	private _transferTerminals(fromSessionId: string, toSessionId: string): void {
		const terminalIds = this._sessionTerminals.get(fromSessionId);
		if (terminalIds && terminalIds.size > 0) {
			let targetIds = this._sessionTerminals.get(toSessionId);
			if (!targetIds) {
				targetIds = new Set<number>();
				this._sessionTerminals.set(toSessionId, targetIds);
			}
			for (const id of terminalIds) {
				targetIds.add(id);
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
	private async _updateTerminalVisibility(activeSession: ISession, activeKey: string, forceForegroundTerminalIds: number[]): Promise<void> {
		const toShow: ITerminalInstance[] = [];
		const toHide: ITerminalInstance[] = [];
		const trackedTerminalIds = new Set(this._getTrackedTerminalsForSession(activeSession.sessionId).map(instance => instance.instanceId));

		for (const instance of [...this._terminalService.instances]) {
			// Skip hidden tool terminals — managed by the chat tool lifecycle
			if (instance.shellLaunchConfig.hideFromUser || this._standaloneTerminalIds.has(instance.instanceId)) {
				continue;
			}
			let cwd: string | undefined;
			const currentInstance = this._getAvailableTerminal(instance, 'update terminal visibility');
			if (!currentInstance) {
				continue;
			}

			const isForeground = this._terminalService.foregroundInstances.includes(currentInstance);
			const isForceVisible = forceForegroundTerminalIds.includes(currentInstance.instanceId);
			let belongsToActiveSession = trackedTerminalIds.has(currentInstance.instanceId);
			if (!belongsToActiveSession && !this._isTerminalTracked(currentInstance.instanceId)) {
				// Untracked terminal (e.g. restored from a previous window) — fall
				// back to cwd matching so it is shown alongside the session's tracked
				// terminals rather than incorrectly hidden.
				try {
					cwd = (await currentInstance.getInitialCwd()).toLowerCase();
				} catch {
					continue;
				}
				belongsToActiveSession = cwd === activeKey;
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
			this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
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
