/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { TaskRunSource } from '../../../../workbench/contrib/tasks/common/tasks.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IChatLayoutPresentationSnapshot } from '../../../common/chatLayout.js';
import { ITerminalChatOwner } from '../../../../platform/terminal/common/terminal.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { ITaskService } from '../../../../workbench/contrib/tasks/common/taskService.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionTaskRunner } from './sessionTaskRunner.js';
import { ITaskEntry } from './sessionsTasksService.js';

/**
 * Default task runner that delegates to the workbench `ITaskService`. Used
 * for sessions whose workspace is a real local folder loaded into the
 * workbench (so the Tasks extension can run them). Acts as the lowest-priority
 * fallback when no specialized runner (e.g. for an agent host) claims the
 * session.
 */
export class WorkbenchSessionTaskRunner implements ISessionTaskRunner {

	readonly id = 'workbench';
	readonly priority = 0;

	constructor(
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentWorkbenchLayoutService private readonly _layoutService: IAgentWorkbenchLayoutService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) { }

	canRun(session: ISession, chat?: IChat): boolean {
		const cwd = this._getCwd(chat ?? session);
		// The workbench task service only works against folders loaded into
		// the workbench workspace. Restrict to file-scheme URIs that resolve
		// to a known workspace folder so we don't no-op against virtual /
		// agent-host workspaces.
		if (!cwd || cwd.scheme !== Schemas.file) {
			return false;
		}
		return !!this._workspaceContextService.getWorkspaceFolder(cwd);
	}

	async runTask(task: ITaskEntry, session: ISession, chat?: IChat): Promise<IDisposable | undefined> {
		const presentation = this._layoutService.chatLayoutPresentation;
		const snapshot = presentation.state.get();
		if (presentation.enabled && !snapshot.active) {
			return undefined;
		}
		const chatResource = (chat ?? session.mainChat.get()).resource;
		const owner = Object.freeze({ backend: this._terminalService.defaultBackendIdentity, sessionResource: session.resource.toString(), chatResource: chatResource.toString() });
		let deleted = false;
		const deletionListener = this._sessionsManagementService.onDidDeleteChat(e => {
			if (isEqual(e.sessionResource, session.resource) && isEqual(e.chatResource, chatResource)) {
				deleted = true;
			}
		});
		const removalListener = this._sessionsManagementService.onDidChangeSessions(e => {
			if (e.removed.some(removed => isEqual(removed.resource, session.resource))) {
				deleted = true;
			}
		});
		try {
			return await this._runTask(task, session, chat, snapshot, owner, () => !deleted);
		} finally {
			deletionListener.dispose();
			removalListener.dispose();
		}
	}

	private async _runTask(task: ITaskEntry, session: ISession, chat: IChat | undefined, snapshot: IChatLayoutPresentationSnapshot, owner: ITerminalChatOwner, isAlive: () => boolean): Promise<IDisposable | undefined> {
		const presentation = this._layoutService.chatLayoutPresentation;
		const chatResource = (chat ?? session.mainChat.get()).resource;
		const cwd = this._getCwd(chat ?? session);
		if (!cwd) {
			return undefined;
		}
		const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwd);
		if (!workspaceFolder) {
			return undefined;
		}
		let resolved = await this._taskService.getTask(workspaceFolder, task.label);
		if (!resolved) {
			return undefined;
		}
		if (presentation.enabled) {
			if (!presentation.isCurrent(snapshot) || !isAlive()) {
				return undefined;
			}
			resolved = resolved.clone();
			resolved.terminalScope = {
				owner,
				isCurrent: () => presentation.isCurrent(snapshot) && isAlive() && !session.isArchived.get(),
				isForeground: () => {
					const active = this._sessionsService.activeSession.get();
					return presentation.isCurrent(snapshot) && isEqual(active?.resource, session.resource) && isEqual(active?.activeChat.get().resource, chatResource);
				},
			};
		}
		await this._taskService.run(resolved, undefined, TaskRunSource.User);

		// Hand back a stop handle so auto-dispatched setup/build tasks can be
		// terminated when the session is marked done. See #321021.
		return toDisposable(() => {
			if (presentation.enabled && !presentation.state.get().active) {
				return;
			}
			this._taskService.terminate(resolved);
		});
	}

	private _getCwd(session: ISession | IChat) {
		const repo = session.workspace.get()?.folders[0];
		return repo?.workingDirectory ?? repo?.root;
	}
}
