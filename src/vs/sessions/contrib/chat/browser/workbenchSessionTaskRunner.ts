/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Task, TaskEventKind, TaskRunSource, TaskSourceKind, USER_TASKS_GROUP_KEY } from '../../../../workbench/contrib/tasks/common/tasks.js';
import { ITaskService } from '../../../../workbench/contrib/tasks/common/taskService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionTaskRunner, ISessionTaskRunOptions } from './sessionTaskRunner.js';
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

	async runTask(task: ITaskEntry, session: ISession, options?: ISessionTaskRunOptions): Promise<IDisposable | undefined> {
		const cwd = this._getCwd(session);
		if (!cwd) {
			return undefined;
		}
		const workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwd);
		if (!workspaceFolder) {
			return undefined;
		}
		const targetFolder = options?.taskTarget === 'user' ? USER_TASKS_GROUP_KEY : workspaceFolder;
		const resolved = await this._taskService.getTask(targetFolder, task.label);
		if (!resolved || !this._isTaskFromTarget(resolved, options?.taskTarget)) {
			return undefined;
		}
		if (options?.token?.isCancellationRequested) {
			return undefined;
		}
		const executionTaskIds = options?.token ? await this._getExecutionTaskIds(resolved) : undefined;
		if (options?.token?.isCancellationRequested) {
			return undefined;
		}
		const terminatedTaskIds = new Set<string>();
		const terminatingTaskIds = new Set<string>();
		const retryTasks = new Map<string, Task>();
		const terminate = (task: Task) => {
			if (terminatedTaskIds.has(task._id)) {
				return;
			}
			if (terminatingTaskIds.has(task._id)) {
				retryTasks.set(task._id, task);
				return;
			}
			terminatingTaskIds.add(task._id);
			this._taskService.terminate(task).then(result => {
				if (result.success && result.task) {
					terminatedTaskIds.add(task._id);
				}
			}).finally(() => {
				terminatingTaskIds.delete(task._id);
				const retryTask = retryTasks.get(task._id);
				retryTasks.delete(task._id);
				if (retryTask && !terminatedTaskIds.has(task._id)) {
					terminate(retryTask);
				}
			});
		};
		if (options?.token) {
			let cancelled = false;
			const executionTasks = new Map<string, Task>([[resolved._id, resolved]]);
			const launchListener = this._taskService.onDidStateChange(event => {
				if (event.kind !== TaskEventKind.Changed && executionTaskIds?.has(event.taskId)) {
					executionTasks.set(event.taskId, event.__task);
					if (cancelled) {
						terminate(event.__task);
					}
				}
			});
			const cancel = () => {
				if (cancelled) {
					return;
				}
				cancelled = true;
				for (const executionTask of executionTasks.values()) {
					terminate(executionTask);
				}
			};
			const cancellationListener = options.token.onCancellationRequested(cancel);

			const runPromise = this._taskService.run(resolved, undefined, TaskRunSource.System);
			runPromise.then(
				() => launchListener.dispose(),
				error => {
					launchListener.dispose();
					onUnexpectedError(error);
				}
			);

			// Keep the launch listener alive until run() settles so cancellation
			// remains effective while the task service performs pre-launch work.
			return toDisposable(() => {
				cancellationListener.dispose();
				cancel();
			});
		}

		await this._taskService.run(resolved, undefined, TaskRunSource.User);

		// Hand back a stop handle so auto-dispatched setup/build tasks can be
		// terminated when the session is marked done. See #321021.
		const handle = toDisposable(() => terminate(resolved));
		return handle;
	}

	private async _getExecutionTaskIds(task: Task, result = new Set<string>()): Promise<Set<string>> {
		if (result.has(task._id)) {
			return result;
		}
		result.add(task._id);
		for (const dependency of task.configurationProperties.dependsOn ?? []) {
			if (!dependency.task) {
				continue;
			}
			const folder = typeof dependency.uri === 'string' ? dependency.uri : dependency.uri.toString();
			const resolved = await this._taskService.getTask(folder, dependency.task);
			if (resolved) {
				await this._getExecutionTaskIds(resolved, result);
			}
		}
		return result;
	}

	private _isTaskFromTarget(task: Task, target: ISessionTaskRunOptions['taskTarget']): boolean {
		if (!target) {
			return true;
		}
		return target === 'user' ? task._source.kind === TaskSourceKind.User : task._source.kind !== TaskSourceKind.User;
	}

	private _getCwd(session: ISession) {
		const repo = session.workspace.get()?.folders[0];
		return repo?.workingDirectory ?? repo?.root;
	}
}
