/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { isEqualOrParent } from '../../../../base/common/extpath.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';

/**
 * Returns the cwd URI for the given session: worktree or repository path for
 * background sessions only. Returns `undefined` for non-background sessions
 * (Cloud, Local, etc.) which have no local worktree, or when no path is available.
 */
function getSessionCwd(session: IActiveSessionItem | undefined): URI | undefined {
	if (session?.providerType !== AgentSessionProviders.Background) {
		return undefined;
	}
	return session.worktree ?? session.repository;
}

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - A path→instanceId mapping tracks which terminal belongs to which worktree.
 * - All terminals for a worktree are closed when the session is archived.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	/** Maps worktree/repository fsPath (lower-cased) to terminal instance ids. */
	private readonly _pathToInstanceIds = new Map<string, Set<number>>();
	private _activeKey: string | undefined;
	private _isCreatingTerminal = false;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ILogService private readonly _logService: ILogService,
		@IPathService private readonly _pathService: IPathService,
	) {
		super();

		// React to active session changes — use worktree/repo for background sessions, home dir otherwise
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			this._onActiveSessionChanged(session);
		}));

		// When a session is archived, close all terminals for its worktree
		this._register(this._agentSessionsService.model.onDidChangeSessionArchivedState(session => {
			if (session.isArchived()) {
				const worktreePath = session.metadata?.worktreePath as string | undefined;
				if (worktreePath) {
					this._closeTerminalsForPath(URI.file(worktreePath).fsPath);
				}
			}
		}));

		// Clean up mapping when terminals are disposed
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			for (const [path, ids] of this._pathToInstanceIds) {
				if (ids.delete(instance.instanceId) && ids.size === 0) {
					this._pathToInstanceIds.delete(path);
				}
			}
		}));

		// When terminals are created externally, try to relate them to the active session
		this._register(this._terminalService.onDidCreateInstance(instance => {
			if (this._isCreatingTerminal || this._activeKey === undefined) {
				return;
			}
			// If this instance is already tracked by us, nothing to do
			const activeIds = this._pathToInstanceIds.get(this._activeKey);
			if (activeIds?.has(instance.instanceId)) {
				return;
			}
			this._tryAdoptTerminal(instance);
		}));
	}

	/**
	 * Ensures a terminal exists for the given cwd, reusing an existing one
	 * from the mapping or creating a new one. Sets it as active and optionally
	 * focuses it.
	 */
	async ensureTerminal(cwd: URI, focus: boolean): Promise<void> {
		const key = cwd.fsPath.toLowerCase();
		const ids = this._pathToInstanceIds.get(key);
		const existingId = ids ? ids.values().next().value : undefined;
		const existing = existingId !== undefined ? this._terminalService.getInstanceFromId(existingId) : undefined;

		if (existing) {
			await this._terminalService.showBackgroundTerminal(existing);
			this._terminalService.setActiveInstance(existing);
		} else {
			this._isCreatingTerminal = true;
			try {
				const instance = await this._terminalService.createTerminal({ config: { cwd } });
				this._addInstanceToPath(key, instance.instanceId);
				this._terminalService.setActiveInstance(instance);
				this._logService.trace(`[SessionsTerminal] Created terminal ${instance.instanceId} for ${cwd.fsPath}`);
			} finally {
				this._isCreatingTerminal = false;
			}
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}
	}

	private async _onActiveSessionChanged(session: IActiveSessionItem | undefined): Promise<void> {
		if (!session) {
			return;
		}

		const sessionCwd = getSessionCwd(session);

		const targetPath = sessionCwd ?? await this._pathService.userHome();
		const targetKey = targetPath.fsPath.toLowerCase();
		if (this._activeKey === targetKey) {
			return;
		}
		this._activeKey = targetKey;

		await this.ensureTerminal(targetPath, false);

		// If the active key changed while we were awaiting, a newer call has
		// taken over — skip the visibility update to avoid flicker.
		if (this._activeKey !== targetKey) {
			return;
		}
		this._updateTerminalVisibility(targetKey);
	}

	private _addInstanceToPath(key: string, instanceId: number): void {
		let ids = this._pathToInstanceIds.get(key);
		if (!ids) {
			ids = new Set();
			this._pathToInstanceIds.set(key, ids);
		}
		ids.add(instanceId);
	}

	/**
	 * Attempts to associate an externally-created terminal with the active
	 * session by checking whether its initial cwd falls within the active
	 * session's worktree or repository. Hides the terminal if it cannot be
	 * related.
	 */
	private async _tryAdoptTerminal(instance: ITerminalInstance): Promise<void> {
		let cwd: string | undefined;
		try {
			cwd = await instance.getInitialCwd();
		} catch {
			return;
		}

		if (instance.isDisposed) {
			return;
		}

		const activeKey = this._activeKey;
		if (!activeKey) {
			return;
		}

		// Re-check tracking — the terminal may have been adopted while awaiting
		const activeIds = this._pathToInstanceIds.get(activeKey);
		if (activeIds?.has(instance.instanceId)) {
			return;
		}

		const session = this._sessionsManagementService.activeSession.get();
		if (cwd && this._isRelatedToSession(cwd, session, activeKey)) {
			this._addInstanceToPath(activeKey, instance.instanceId);
			this._logService.trace(`[SessionsTerminal] Adopted terminal ${instance.instanceId} with cwd ${cwd}`);
		} else {
			this._terminalService.moveToBackground(instance);
		}
	}

	/**
	 * Returns whether the given cwd falls within the active session's
	 * worktree, repository, or the current active key (home dir fallback).
	 */
	private _isRelatedToSession(cwd: string, session: IActiveSessionItem | undefined, activeKey: string): boolean {
		if (isEqualOrParent(cwd, activeKey, true)) {
			return true;
		}
		if (session?.providerType === AgentSessionProviders.Background && session.repository) {
			return isEqualOrParent(cwd, session.repository.fsPath, true);
		}
		return false;
	}

	/**
	 * Hides all foreground terminals that do not belong to the given active key
	 * and shows all background terminals that do belong to it.
	 */
	private _updateTerminalVisibility(activeKey: string): void {
		const activeIds = this._pathToInstanceIds.get(activeKey);

		// Hide foreground terminals not belonging to the active session
		for (const instance of [...this._terminalService.foregroundInstances]) {
			if (!activeIds?.has(instance.instanceId)) {
				this._terminalService.moveToBackground(instance);
			}
		}

		// Show background terminals belonging to the active session
		if (activeIds) {
			for (const id of activeIds) {
				const instance = this._terminalService.getInstanceFromId(id);
				if (instance && !this._terminalService.foregroundInstances.includes(instance)) {
					this._terminalService.showBackgroundTerminal(instance, true);
				}
			}
		}
	}

	private _closeTerminalsForPath(fsPath: string): void {
		const key = fsPath.toLowerCase();
		const ids = this._pathToInstanceIds.get(key);
		if (ids) {
			for (const instanceId of ids) {
				const instance = this._terminalService.getInstanceFromId(instanceId);
				if (instance) {
					this._terminalService.safeDisposeTerminal(instance);
					this._logService.trace(`[SessionsTerminal] Closed archived terminal ${instanceId}`);
				}
			}
			this._pathToInstanceIds.delete(key);
		}
	}

	async dumpTracking(): Promise<void> {
		const trackedInstanceIds = new Set<number>();

		console.log('[SessionsTerminal] === Tracked Terminals ===');
		for (const [key, ids] of this._pathToInstanceIds) {
			for (const instanceId of ids) {
				trackedInstanceIds.add(instanceId);
				const instance = this._terminalService.getInstanceFromId(instanceId);
				let cwd = '<unknown>';
				if (instance) {
					try { cwd = await instance.getInitialCwd(); } catch { /* ignored */ }
				}
				console.log(`  ${instanceId} - ${cwd} - ${key}`);
			}
		}

		console.log('[SessionsTerminal] === Untracked Terminals ===');
		for (const instance of this._terminalService.instances) {
			if (!trackedInstanceIds.has(instance.instanceId)) {
				let cwd = '<unknown>';
				try { cwd = await instance.getInitialCwd(); } catch { /* ignored */ }
				console.log(`  ${instance.instanceId} - ${cwd}`);
			}
		}
	}
}

registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);

class OpenSessionInTerminalAction extends Action2 {

	constructor() {
		super({
			id: 'agentSession.openInTerminal',
			title: localize2('openInTerminal', "Open Terminal"),
			icon: Codicon.terminal,
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 9,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
			}]
		});
	}

	override async run(_accessor: ServicesAccessor): Promise<void> {
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		const sessionsManagementService = _accessor.get(ISessionsManagementService);
		const pathService = _accessor.get(IPathService);

		const activeSession = sessionsManagementService.activeSession.get();
		const cwd = getSessionCwd(activeSession) ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true);
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
