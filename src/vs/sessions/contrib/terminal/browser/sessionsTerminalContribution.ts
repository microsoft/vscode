/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionsWelcomeVisibleContext, IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ITerminalProfileService, TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionTaskRunnerRegistry } from '../../chat/browser/sessionTaskRunner.js';
import { AgentHostSessionTaskRunner } from './agentHostSessionTaskRunner.js';

const SessionsTerminalViewVisibleContext = new RawContextKey<boolean>('sessionsTerminalViewVisible', false);

interface ISessionTerminalInfo {
	/** The cwd to use for terminal matching/creation. For agent host sessions this is the unwrapped file URI. */
	readonly cwd: URI;
	/** When set, the terminal should be created on the agent host rather than locally. */
	readonly agentHostCwd?: URI;
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

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals are tracked per session id and shown/hidden based on that association.
 * - Terminals created before session-id tracking fall back to initial cwd matching
 *   until they are associated with a session in this window.
 * - Terminals for archived/removed sessions are hidden/closed using their tracked
 *   session id association while keeping the active terminal protected.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private _activeKey: string | undefined;
	private _activeSessionId: string | undefined;
	private readonly _sessionTerminals = new Map<string, Set<number>>();

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
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IViewsService viewsService: IViewsService,
		@IContextKeyService contextKeyService: IContextKeyService,
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
			if (session?.loading.read(reader)) {
				this._agentHostTerminalService.setDefaultCwd(undefined);
				return;
			}
			const info = getSessionTerminalInfo(session, reader);
			this._agentHostTerminalService.setDefaultCwd(info?.cwd);
		}));

		// Track whether the terminal view is visible so the titlebar toggle
		// button shows the correct checked state.
		const terminalViewVisible = SessionsTerminalViewVisibleContext.bindTo(contextKeyService);
		terminalViewVisible.set(viewsService.isViewVisible(TERMINAL_VIEW_ID));
		this._register(viewsService.onDidChangeViewVisibility(e => {
			if (e.id === TERMINAL_VIEW_ID) {
				terminalViewVisible.set(e.visible);
			}
		}));

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
			const session = this._sessionsService.activeSession.read(reader);
			if (session?.loading.read(reader)) {
				this._activeKey = undefined;
				this._activeSessionId = undefined;
				return;
			}
			this._onActiveSessionChanged(session);
		}));

		// When a session is replaced (untitled → committed graduation), transfer
		// tracked terminals from the old session id to the new one so they are
		// not orphaned and closed by the removal cleanup.
		this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			const terminalIds = this._sessionTerminals.get(from.sessionId);
			if (terminalIds && terminalIds.size > 0) {
				let targetIds = this._sessionTerminals.get(to.sessionId);
				if (!targetIds) {
					targetIds = new Set<number>();
					this._sessionTerminals.set(to.sessionId, targetIds);
				}
				for (const id of terminalIds) {
					targetIds.add(id);
				}
				this._logService.trace(`[SessionsTerminal] Transferred ${terminalIds.size} terminal(s) from session ${from.sessionId} to ${to.sessionId}`);
			}
			this._sessionTerminals.delete(from.sessionId);
		}));

		// Clean up tracked terminal ids when terminals are externally disposed
		// (e.g. user closes a terminal tab) so the map doesn't hold stale entries.
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			this._removeTerminalFromTrackedSessions(instance.instanceId);
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
		// Archive vs remove differ in how aggressive the cleanup is:
		// - Archiving is reversible and terminals can be reused by
		//   the same session, so we only HIDE the terminal (the pty survives and can
		//   be shown again on unarchive or reuse). See `_hideTerminalsForSession`.
		// - Removal is an explicit, destructive user action, so we KILL the
		//   terminal. See `_closeTerminalsForSession`.
		//
		// The archive cleanup runs only on the not-archived → archived transition.
		// The provider keeps archived sessions cached and re-emits them in
		// `changed` on every sync; acting on the current archived state would
		// re-run the cwd cleanup each time and sweep terminals the user opened
		// after archiving.
		//
		// Both paths are asynchronous and can land while the user is working in a
		// just-opened terminal at this cwd (e.g. removal also covers untitled →
		// committed graduation via `onDidReplaceSession`, which surfaces the
		// skeleton in `removed`). The focused (active) terminal is therefore never
		// touched on either path. See #313510, #318645.

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
						justArchived.push(session);
					}
				} else {
					this._archivedSessionIds.delete(session.sessionId);
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
				void this._hideTerminalsForSession(session.sessionId, `session archived (${session.sessionId})`);
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
		const key = cwd.fsPath.toLowerCase();
		let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
		if (existing.length === 0) {
			existing = await this._findTerminalsForKey(key, { excludeTracked: !!session });
		}

		if (existing.length === 0) {
			try {
				const instance = await this._createTerminalForSession(cwd, session);
				const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
				if (!createdInstance) {
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

		const info = getSessionTerminalInfo(session);
		const targetPath = info?.cwd ?? await this._pathService.userHome();
		const targetKey = targetPath.fsPath.toLowerCase();
		if (this._activeKey === targetKey && this._activeSessionId === session.sessionId) {
			return;
		}
		this._activeKey = targetKey;
		this._activeSessionId = session.sessionId;

		const instances = await this.ensureTerminal(targetPath, false, session);

		// If the active session or key changed while we were awaiting, a newer
		// call has taken over — skip the visibility update to avoid flicker.
		if (this._activeKey !== targetKey || this._activeSessionId !== session.sessionId) {
			return;
		}
		await this._updateTerminalVisibility(session, targetKey, instances.map(instance => instance.instanceId));
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
			if (options?.excludeTracked && this._isTerminalTracked(instance.instanceId)) {
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
			if (instance.shellLaunchConfig.hideFromUser) {
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

	/**
	 * Hides (moves to background) terminals associated with the given session id
	 * without disposing them. Used when a session is archived ("Mark as Done"):
	 * archiving is reversible and the pty must survive so it can be shown again.
	 *
	 * Archiving is asynchronous and can land while the user is working in a
	 * just-opened terminal at this cwd, so the focused (active) instance is
	 * never hidden out from under the user.
	 *
	 * {@link reason} is logged for each hidden terminal so unexpected visibility
	 * changes in the agents window can be diagnosed from the logs. See #313510,
	 * #318645.
	 */
	private async _hideTerminalsForSession(sessionId: string, reason: string): Promise<void> {
		const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
		for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
			if (protectedInstanceId !== undefined && instance.instanceId === protectedInstanceId) {
				this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
				continue;
			}
			const availableInstance = this._getAvailableTerminal(instance, `hide archived terminal for session ${sessionId}`);
			if (!availableInstance) {
				continue;
			}
			this._logService.info(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
			this._terminalService.moveToBackground(availableInstance);
		}
	}

	async dumpTracking(): Promise<void> {
		console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
		console.log(`[SessionsTerminal] Session terminals: ${JSON.stringify([...this._sessionTerminals.entries()].map(([sessionId, terminalIds]) => [sessionId, [...terminalIds]]))}`);
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

class OpenSessionInTerminalAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.openInTerminal',
			title: localize2('openInTerminal', "Open Terminal"),
			icon: Codicon.terminal,
			toggled: {
				condition: SessionsTerminalViewVisibleContext,
				title: localize('hideTerminal', "Hide Terminal"),
			},
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(_accessor: ServicesAccessor): Promise<void> {
		const telemetryService = _accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openTerminal');

		const layoutService = _accessor.get(IWorkbenchLayoutService);
		const viewsService = _accessor.get(IViewsService);

		// Toggle: if panel is visible and the terminal view is active, hide it.
		// If the panel is visible but showing another view, open the terminal instead.
		if (layoutService.isVisible(Parts.PANEL_PART)) {
			if (viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
				layoutService.setPartHidden(true, Parts.PANEL_PART);
				return;
			}
		}

		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		const sessionsService = _accessor.get(ISessionsService);
		const pathService = _accessor.get(IPathService);

		const activeSession = sessionsService.activeSession.get();
		const info = getSessionTerminalInfo(activeSession);
		const cwd = info?.cwd ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true, activeSession);
		viewsService.openView(TERMINAL_VIEW_ID);
	}
}

registerAction2(OpenSessionInTerminalAction);

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
