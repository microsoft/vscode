/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { TaskRunSource } from '../../../../workbench/contrib/tasks/common/tasks.js';
import { ITaskService } from '../../../../workbench/contrib/tasks/common/taskService.js';
import { ISession } from '../../../services/sessions/common/session.js';
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
	) { }

	canRun(session: ISession): boolean {
		const cwd = this._getCwd(session);
		// The workbench task service only works against folders loaded into
		// the workbench workspace. Restrict to file-scheme URIs that resolve
		// to a known workspace folder so we don't no-op against virtual /
		// agent-host workspaces.
		if (!cwd || cwd.scheme !== Schemas.file) {
			return false;
		}
		return !!this._workspaceContextService.getWorkspaceFolder(cwd);
	}

	async runTask(task: ITaskEntry, session: ISession): Promise<IDisposable | undefined> {
		const cwd = this._getCwd(session);
		if (!cwd) {
			return undefined;
		}
		const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwd);
		if (!workspaceFolder) {
			return undefined;
		}
		const resolved = await this._taskService.getTask(workspaceFolder, task.label);
		if (!resolved) {
			return undefined;
		}
		await this._taskService.run(resolved, undefined, TaskRunSource.User);

		// Hand back a stop handle so auto-dispatched setup/build tasks can be
		// terminated when the session is marked done. See #321021.
		return toDisposable(() => {
			this._taskService.terminate(resolved);
		});
	}

	private _getCwd(session: ISession) {
		const repo = session.workspace.get()?.folders[0];
		return repo?.workingDirectory ?? repo?.root;
	}
}
