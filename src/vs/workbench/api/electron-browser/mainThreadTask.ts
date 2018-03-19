/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as crypto from 'crypto';

import URI from 'vs/base/common/uri';
import * as Objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';

import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

import { ContributedTask, ExtensionTaskSourceTransfer, TaskItem, TaskIdentifier, TaskExecution, Task, TaskEvent, TaskEventKind } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';

import { ExtHostContext, MainThreadTaskShape, ExtHostTaskShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

import { TaskItemTransfer, TaskDefinitionTransfer, TaskExecutionTransfer } from '../common/commonTask';

namespace TaskIdentifier {
	export function to(value: TaskIdentifier): TaskDefinitionTransfer {
		let result = Objects.assign(Object.create(null), value);
		delete result._key;
		return result;
	}
	export function from(value: TaskDefinitionTransfer): TaskIdentifier {
		const hash = crypto.createHash('md5');
		hash.update(JSON.stringify(value));
		let result = Objects.assign(Object.create(null), value);
		result._key = hash.digest('hex');
		return result;
	}
}

namespace TaskItem {
	export function to(value: TaskItem): TaskItemTransfer {
		return {
			id: value.id,
			label: value.label,
			definition: TaskIdentifier.to(value.definition),
			workspaceFolderUri: value.workspaceFolder.uri
		};
	}
	export function from(value: TaskItemTransfer, workspace: IWorkspaceContextService): TaskItem {
		return {
			id: value.id,
			label: value.label,
			definition: TaskIdentifier.from(value.definition),
			workspaceFolder: workspace.getWorkspaceFolder(URI.revive(value.workspaceFolderUri))
		};
	}
}

namespace TaskExecution {
	export function to(value: TaskExecution): TaskExecutionTransfer {
		return {
			id: value.id,
		};
	}
	export function from(value: TaskExecutionTransfer, workspace: IWorkspaceContextService): TaskExecution {
		return {
			id: value.id,
		};
	}
}


@extHostNamedCustomer(MainContext.MainThreadTask)
export class MainThreadTask implements MainThreadTaskShape {

	private _proxy: ExtHostTaskShape;
	private _activeHandles: { [handle: number]: boolean; };

	constructor(
		extHostContext: IExtHostContext,
		@ITaskService private readonly _taskService: ITaskService,
		@IWorkspaceContextService private readonly _workspaceContextServer: IWorkspaceContextService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
		this._activeHandles = Object.create(null);
		this._taskService.onDidStateChange((event: TaskEvent) => {
			let task = event.__task;
			if (event.kind === TaskEventKind.Start) {
				this._proxy.$taskStarted(TaskExecution.to(Task.getTaskExecution(task)));
			} else if (event.kind === TaskEventKind.End) {
				this._proxy.$taskEnded(TaskExecution.to(Task.getTaskExecution(task)));
			}
		});
	}

	public dispose(): void {
		Object.keys(this._activeHandles).forEach((handle) => {
			this._taskService.unregisterTaskProvider(parseInt(handle, 10));
		});
		this._activeHandles = Object.create(null);
	}

	public $registerTaskProvider(handle: number): TPromise<void> {
		this._taskService.registerTaskProvider(handle, {
			provideTasks: () => {
				return this._proxy.$provideTasks(handle).then((value) => {
					for (let task of value.tasks) {
						if (ContributedTask.is(task)) {
							let uri = (task._source as any as ExtensionTaskSourceTransfer).__workspaceFolder;
							if (uri) {
								delete (task._source as any as ExtensionTaskSourceTransfer).__workspaceFolder;
								(task._source as any).workspaceFolder = this._workspaceContextServer.getWorkspaceFolder(URI.revive(uri));
							}
						}
					}
					return value;
				});
			}
		});
		this._activeHandles[handle] = true;
		return TPromise.wrap<void>(undefined);
	}

	public $unregisterTaskProvider(handle: number): TPromise<void> {
		this._taskService.unregisterTaskProvider(handle);
		delete this._activeHandles[handle];
		return TPromise.wrap<void>(undefined);
	}

	public $executeTaskProvider(): TPromise<TaskItemTransfer[]> {
		return this._taskService.tasks().then((tasks) => {
			let result: TaskItemTransfer[] = [];
			for (let task of tasks) {
				let item = Task.getTaskItem(task);
				if (item) {
					result.push(TaskItem.to(item));
				}
			}
			return result;
		});
	}

	public $executeTask(value: TaskItemTransfer): TPromise<TaskExecutionTransfer> {
		let item: TaskItem = TaskItem.from(value, this._workspaceContextServer);
		return new TPromise<TaskExecutionTransfer>((resolve, reject) => {
			this._taskService.getTask(item.workspaceFolder, item.id, true).then((task: Task) => {
				this._taskService.run(task);
				let result: TaskExecutionTransfer = {
					id: value.id
				};
				resolve(result);
			}, (error) => {
				reject(new Error('Task not found'));
			});
		});
	}

	public $terminateTask(value: TaskExecutionTransfer): TPromise<void> {
		let execution: TaskExecution = TaskExecution.from(value, this._workspaceContextServer);
		return new TPromise<void>((resolve, reject) => {
			this._taskService.getActiveTasks().then((tasks) => {
				for (let task of tasks) {
					if (execution.id === task._id) {
						this._taskService.terminate(task).then((value) => {
							resolve(undefined);
						}, (error) => {
							reject(undefined);
						});
						return;
					}
				}
				reject(new Error('Task to terminate not found'));
			});
		});
	}
}
