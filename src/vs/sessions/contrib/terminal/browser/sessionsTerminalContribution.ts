/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - Terminals from other worktrees are hidden (or closed if hiding is not possible)
 *   when they are not actively running.
 * - Hidden terminals are unhidden when switching back to their worktree.
 * - All terminals for a worktree are closed when the session is archived.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	private readonly _hiddenInstances = new Set<number>();
	private _lastTargetFsPath: string | undefined;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// React to active session worktree/repository path changes
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			const targetPath = session?.worktree ?? session?.repository;
			this._onActivePathChanged(targetPath);
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

		// Clean up hidden tracking when terminals are disposed
		this._register(this._terminalGroupService.onDidDisposeInstance(instance => {
			this._hiddenInstances.delete(instance.instanceId);
		}));
	}

	private async _onActivePathChanged(targetPath: URI | undefined): Promise<void> {
		if (!targetPath) {
			return;
		}

		const targetFsPath = targetPath.fsPath;
		if (this._lastTargetFsPath?.toLowerCase() === targetFsPath.toLowerCase()) {
			return;
		}
		this._lastTargetFsPath = targetFsPath;

		let existingInstance: ITerminalInstance | undefined;

		// Iterate over a snapshot to avoid issues when modifying the list
		for (const instance of [...this._terminalGroupService.instances]) {
			if (this._matchesCwd(instance, targetFsPath)) {
				existingInstance ??= instance;
				// Unhide if this terminal was previously hidden
				if (this._hiddenInstances.has(instance.instanceId)) {
					this._unhideTerminal(instance);
				}
			} else if (!instance.hasChildProcesses) {
				this._hideOrCloseTerminal(instance);
			}
		}

		if (existingInstance) {
			this._terminalService.setActiveInstance(existingInstance);
		} else {
			const instance = await this._terminalService.createTerminal({ config: { cwd: targetPath } });
			this._terminalService.setActiveInstance(instance);
		}
	}

	private _unhideTerminal(instance: ITerminalInstance): void {
		const group = this._terminalGroupService.getGroupForInstance(instance);
		if (group) {
			group.setVisible(true);
			this._hiddenInstances.delete(instance.instanceId);
			this._logService.trace(`[SessionsTerminal] Unhid terminal ${instance.instanceId}`);
		}
	}

	private _hideOrCloseTerminal(instance: ITerminalInstance): void {
		const group = this._terminalGroupService.getGroupForInstance(instance);
		if (group) {
			group.setVisible(false);
			this._hiddenInstances.add(instance.instanceId);
			this._logService.trace(`[SessionsTerminal] Hid terminal ${instance.instanceId}`);
		} else {
			this._terminalService.safeDisposeTerminal(instance);
			this._logService.trace(`[SessionsTerminal] Closed terminal ${instance.instanceId} (no group)`);
		}
	}

	private _closeTerminalsForPath(fsPath: string): void {
		for (const instance of [...this._terminalGroupService.instances]) {
			if (this._matchesCwd(instance, fsPath)) {
				this._hiddenInstances.delete(instance.instanceId);
				this._terminalService.safeDisposeTerminal(instance);
				this._logService.trace(`[SessionsTerminal] Closed archived terminal ${instance.instanceId}`);
			}
		}
	}

	private _matchesCwd(instance: ITerminalInstance, fsPath: string): boolean {
		return !!instance.cwd && instance.cwd.toLowerCase() === fsPath.toLowerCase();
	}
}

registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);
