/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
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
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';

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
 * - Terminals are shown/hidden based on their initial cwd matching the active path.
 * - All terminals for a worktree are closed when the session is archived.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private _activeKey: string | undefined;

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

		// Hide restored terminals from a previous window session that don't
		// belong to the current active session. These arrive asynchronously
		// during reconnection and would otherwise flash in the foreground.
		this._register(this._terminalService.onDidCreateInstance(instance => {
			if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
				instance.getInitialCwd().then(cwd => {
					if (cwd.toLowerCase() !== this._activeKey) {
						this._terminalService.moveToBackground(instance);
						this._logService.trace(`[SessionsTerminal] Hid restored terminal ${instance.instanceId} (cwd: ${cwd})`);
					}
				});
			}
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
	}

	/**
	 * Ensures a terminal exists for the given cwd by scanning all terminal
	 * instances for a matching initial cwd. If none is found, creates a new
	 * one. Sets it as active and optionally focuses it.
	 */
	async ensureTerminal(cwd: URI, focus: boolean): Promise<ITerminalInstance[]> {
		const key = cwd.fsPath.toLowerCase();
		let existing = await this._findTerminalsForKey(key);

		if (existing.length === 0) {
			existing = [await this._terminalService.createTerminal({ config: { cwd } })];
			this._terminalService.setActiveInstance(existing[0]);
			this._logService.trace(`[SessionsTerminal] Created terminal ${existing[0].instanceId} for ${cwd.fsPath}`);
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}

		return existing;
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

		const instances = await this.ensureTerminal(targetPath, false);

		// If the active key changed while we were awaiting, a newer call has
		// taken over — skip the visibility update to avoid flicker.
		if (this._activeKey !== targetKey) {
			return;
		}
		await this._updateTerminalVisibility(targetKey, instances.map(instance => instance.instanceId));
	}

	/**
	 * Finds the first terminal instance whose initial cwd (lower-cased) matches
	 * the given key.
	 */
	private async _findTerminalsForKey(key: string): Promise<ITerminalInstance[]> {
		const result: ITerminalInstance[] = [];
		for (const instance of this._terminalService.instances) {
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

	/**
	 * Shows background terminals whose initial cwd matches the active key and
	 * hides foreground terminals whose initial cwd does not match.
	 */
	private async _updateTerminalVisibility(activeKey: string, forceForegroundTerminalIds: number[]): Promise<void> {
		const toShow: ITerminalInstance[] = [];
		const toHide: ITerminalInstance[] = [];

		for (const instance of [...this._terminalService.instances]) {
			let cwd: string | undefined;
			try {
				cwd = (await instance.getInitialCwd()).toLowerCase();
			} catch {
				continue;
			}

			const isForeground = this._terminalService.foregroundInstances.includes(instance);
			const isForceVisible = forceForegroundTerminalIds.includes(instance.instanceId);
			const belongsToActiveSession = cwd === activeKey;
			if ((belongsToActiveSession || isForceVisible) && !isForeground) {
				toShow.push(instance);
			} else if (!belongsToActiveSession && !isForceVisible && isForeground) {
				toHide.push(instance);
			}
		}

		for (const instance of toShow) {
			await this._terminalService.showBackgroundTerminal(instance, true);
		}
		for (const instance of toHide) {
			this._terminalService.moveToBackground(instance);
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

	private async _closeTerminalsForPath(fsPath: string): Promise<void> {
		const key = fsPath.toLowerCase();
		for (const instance of [...this._terminalService.instances]) {
			try {
				const cwd = (await instance.getInitialCwd()).toLowerCase();
				if (cwd === key) {
					this._terminalService.safeDisposeTerminal(instance);
					this._logService.trace(`[SessionsTerminal] Closed archived terminal ${instance.instanceId}`);
				}
			} catch {
				// ignore
			}
		}
	}

	async dumpTracking(): Promise<void> {
		console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? '<none>'}`);
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
		const viewsService = _accessor.get(IViewsService);

		const activeSession = sessionsManagementService.activeSession.get();
		const cwd = getSessionCwd(activeSession) ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true);
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
