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
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { isAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

/**
 * Returns the cwd URI for the given session: worktree for non-cloud agent
 * sessions, repository otherwise, or `undefined` when neither is available.
 */
function getSessionCwd(session: IActiveSessionItem | undefined): URI | undefined {
	if (isAgentSession(session) && session.providerType !== AgentSessionProviders.Cloud) {
		return session.worktree ?? session.repository;
	}
	return session?.repository;
}

/**
 * Manages terminal instances in the sessions window, ensuring:
 * - A terminal exists for the active session's worktree (or repository if no worktree).
 * - A path→instanceId mapping tracks which terminal belongs to which worktree.
 * - All terminals for a worktree are closed when the session is archived.
 */
export class SessionsTerminalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTerminal';

	/** Maps worktree/repository fsPath (lower-cased) to the terminal instance id. */
	private readonly _pathToInstanceId = new Map<string, number>();
	private _lastTargetFsPath: string | undefined;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// React to active session worktree/repository path changes
		this._register(autorun(reader => {
			const session = this._sessionsManagementService.activeSession.read(reader);
			const targetPath = getSessionCwd(session);
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

		// Clean up mapping when terminals are disposed
		this._register(this._terminalService.onDidDisposeInstance(instance => {
			for (const [path, id] of this._pathToInstanceId) {
				if (id === instance.instanceId) {
					this._pathToInstanceId.delete(path);
					break;
				}
			}
		}));
	}

	/**
	 * Ensures a terminal exists for the given cwd, reusing an existing one
	 * from the mapping or creating a new one. Sets it as active and optionally
	 * focuses it.
	 */
	async ensureTerminal(cwd: URI, focus: boolean): Promise<void> {
		const key = cwd.fsPath.toLowerCase();
		const existingId = this._pathToInstanceId.get(key);
		const existing = existingId !== undefined ? this._terminalService.getInstanceFromId(existingId) : undefined;

		if (existing) {
			this._terminalService.setActiveInstance(existing);
		} else {
			const instance = await this._terminalService.createTerminal({ config: { cwd } });
			this._pathToInstanceId.set(key, instance.instanceId);
			this._terminalService.setActiveInstance(instance);
			this._logService.trace(`[SessionsTerminal] Created terminal ${instance.instanceId} for ${cwd.fsPath}`);
		}

		if (focus) {
			await this._terminalService.focusActiveInstance();
		}
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

		await this.ensureTerminal(targetPath, false);
	}

	private _closeTerminalsForPath(fsPath: string): void {
		const key = fsPath.toLowerCase();
		const instanceId = this._pathToInstanceId.get(key);
		if (instanceId !== undefined) {
			const instance = this._terminalService.getInstanceFromId(instanceId);
			if (instance) {
				this._terminalService.safeDisposeTerminal(instance);
				this._logService.trace(`[SessionsTerminal] Closed archived terminal ${instanceId}`);
			}
			this._pathToInstanceId.delete(key);
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
				id: Menus.OpenSubMenu,
				group: 'navigation',
				order: 1,
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
