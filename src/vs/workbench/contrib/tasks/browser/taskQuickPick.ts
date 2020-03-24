/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Task, ContributedTask, CustomTask, ConfiguringTask } from 'vs/workbench/contrib/tasks/common/tasks';
import { IWorkspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import * as Types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITaskService, WorkspaceFolderTaskResult } from 'vs/workbench/contrib/tasks/common/taskService';
import { IQuickPickItem, QuickPickInput, IQuickPick } from 'vs/base/parts/quickinput/common/quickInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';

export const QUICKOPEN_DETAIL_CONFIG = 'task.quickOpen.detail';

export function isWorkspaceFolder(folder: IWorkspace | IWorkspaceFolder): folder is IWorkspaceFolder {
	return 'uri' in folder;
}

export class TaskMap {
	private _store: Map<string, Task[]> = new Map();

	public forEach(callback: (value: Task[], folder: string) => void): void {
		this._store.forEach(callback);
	}

	private getKey(workspaceFolder: IWorkspace | IWorkspaceFolder | string): string {
		let key: string | undefined;
		if (Types.isString(workspaceFolder)) {
			key = workspaceFolder;
		} else {
			const uri: URI | null | undefined = isWorkspaceFolder(workspaceFolder) ? workspaceFolder.uri : workspaceFolder.configuration;
			key = uri ? uri.toString() : '';
		}
		return key;
	}

	public get(workspaceFolder: IWorkspace | IWorkspaceFolder | string): Task[] {
		const key = this.getKey(workspaceFolder);
		let result: Task[] | undefined = this._store.get(key);
		if (!result) {
			result = [];
			this._store.set(key, result);
		}
		return result;
	}

	public add(workspaceFolder: IWorkspace | IWorkspaceFolder | string, ...task: Task[]): void {
		const key = this.getKey(workspaceFolder);
		let values = this._store.get(key);
		if (!values) {
			values = [];
			this._store.set(key, values);
		}
		values.push(...task);
	}

	public all(): Task[] {
		let result: Task[] = [];
		this._store.forEach((values) => result.push(...values));
		return result;
	}
}

export interface TaskQuickPickEntry extends IQuickPickItem {
	task: Task | undefined | null;
}
export interface TaskQuickPickEntry2 extends IQuickPickItem {
	task: Task | ConfiguringTask | string | undefined | null;
}

export class TaskQuickPick extends Disposable {
	private constructor(
		private taskService: ITaskService,
		private configurationService: IConfigurationService,
		private quickInputService: IQuickInputService,
		/*private groupedTasks?: TaskMap*/) {
		super();
	}

	private showDetail(): boolean {
		return this.configurationService.getValue<boolean>(QUICKOPEN_DETAIL_CONFIG);
	}

	private createTaskEntry(task: Task | ConfiguringTask): TaskQuickPickEntry2 {
		let entryLabel = task._label;
		let commonKey = task._id.split('|');
		if (commonKey.length > 1) {
			entryLabel = entryLabel + ' (' + commonKey[1] + ')';
		}
		const entry: TaskQuickPickEntry2 = { label: entryLabel, description: this.taskService.getTaskDescription(task), task, detail: this.showDetail() ? task.configurationProperties.detail : undefined };
		entry.buttons = [{ iconClass: 'codicon-gear', tooltip: nls.localize('configureTask', "Configure Task") }];
		return entry;
	}

	private createEntriesForGroup(entries: QuickPickInput<TaskQuickPickEntry2>[], tasks: (Task | ConfiguringTask)[], groupLabel: string) {
		entries.push({ type: 'separator', label: groupLabel });
		tasks.forEach(task => {
			entries.push(this.createTaskEntry(task));
		});
	}

	private createTypeEntries(entries: QuickPickInput<TaskQuickPickEntry2>[], types: string[]) {
		entries.push({ type: 'separator', label: nls.localize('contributedTasks', "contributed tasks") });
		types.forEach(type => {
			entries.push({ label: type, task: type });
		});
	}

	private handleFolderTaskResult(result: Map<string, WorkspaceFolderTaskResult>): (Task | ConfiguringTask)[] {
		let tasks: (Task | ConfiguringTask)[] = [];
		Array.from(result).forEach(([key, folderTasks]) => {
			if (folderTasks.set) {
				tasks.push(...folderTasks.set.tasks);
			}
			if (folderTasks.configurations) {
				for (const configuration in folderTasks.configurations.byIdentifier) {
					tasks.push(folderTasks.configurations.byIdentifier[configuration]);
				}
			}
		});
		return tasks;
	}

	private async show(placeHolder?: string): Promise<Task | undefined | null> {
		const picker: IQuickPick<TaskQuickPickEntry2> = this.quickInputService.createQuickPick();
		picker.placeholder = placeHolder;
		picker.matchOnDescription = true;
		picker.ignoreFocusOut = false;
		picker.busy = true;
		picker.show();

		// First show recent tasks configured tasks. Other tasks will be available at a second level
		const recentTasks: (Task | ConfiguringTask)[] = (await this.taskService.readRecentTasks()).reverse();
		const configuredTasks: (Task | ConfiguringTask)[] = this.handleFolderTaskResult(await this.taskService.getWorkspaceTasks());
		const extensionTaskTypes = this.taskService.taskTypes();
		const sorter = this.taskService.createSorter();
		const taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[] = [];
		if (recentTasks.length > 0) {
			this.createEntriesForGroup(taskQuickPickEntries, recentTasks, nls.localize('recentlyUsed', 'recently used tasks'));
		}
		if (configuredTasks.length > 0) {
			let dedupedConfiguredTasks: (Task | ConfiguringTask)[] = [];
			for (let j = 0; j < configuredTasks.length; j++) {
				const workspaceFolder = configuredTasks[j].getWorkspaceFolder()?.uri.toString();
				const definition = configuredTasks[j].getDefinition()?._key;
				const recentKey = configuredTasks[j].getRecentlyUsedKey();
				if (!recentTasks.find((value) => {
					return (workspaceFolder && definition && value.getWorkspaceFolder()?.uri.toString() === workspaceFolder && value.getDefinition()?._key === definition)
						|| (recentKey && value.getRecentlyUsedKey() === recentKey);
				})) {
					dedupedConfiguredTasks.push(configuredTasks[j]);
				}
			}
			dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => sorter.compare(a, b));
			this.createEntriesForGroup(taskQuickPickEntries, dedupedConfiguredTasks, nls.localize('configured', 'configured tasks'));
		}
		if (extensionTaskTypes.length > 0) {
			this.createTypeEntries(taskQuickPickEntries, extensionTaskTypes);
		}
		// TODO: Add additional entries
		// TODO: skip if only one entry and setting is set
		// TODO: handle default entry

		picker.items = taskQuickPickEntries;
		picker.busy = false;

		picker.onDidTriggerItemButton(context => {
			let task = context.item.task;
			this.quickInputService.cancel();
			if (ContributedTask.is(task)) {
				this.taskService.customize(task, undefined, true);
			} else if (CustomTask.is(task)) {
				this.taskService.openConfig(task);
			}
		});

		const firstLevelPickerResult = await new Promise<TaskQuickPickEntry2 | undefined | null>(resolve => {
			Event.once(picker.onDidAccept)(async () => {
				let selection = picker.selectedItems ? picker.selectedItems[0] : undefined;
				// if (cancellationToken.isCancellationRequested) {
				// 	// canceled when there's only one task
				// 	const task = (await pickEntries)[0];
				// 	if ((<any>task).task) {
				// 		selection = <TaskQuickPickEntry>task;
				// 	}
				// }
				if (!selection) {
					resolve();
				}
				resolve(selection);
			});
		});
		const firstLevelTask: string | Task | ConfiguringTask | undefined | null = firstLevelPickerResult?.task;
		if (Types.isString(firstLevelTask)) {
			// Proceed to second level of quick pick
			picker.busy = true;
			picker.value = '';
			const secondLevelPickerResult = new Promise<TaskQuickPickEntry2 | undefined | null>(resolve => {
				Event.once(picker.onDidAccept)(async () => {
					let selection = picker.selectedItems ? picker.selectedItems[0] : undefined;
					// if (cancellationToken.isCancellationRequested) {
					// 	// canceled when there's only one task
					// 	const task = (await pickEntries)[0];
					// 	if ((<any>task).task) {
					// 		selection = <TaskQuickPickEntry>task;
					// 	}
					// }
					if (!selection) {
						resolve();
					}
					resolve(selection);
				});
			});
			picker.items = await this.getEntriesForProvider(firstLevelTask);
			picker.busy = false;
			const selectedEntry = (await secondLevelPickerResult);
			picker.dispose();
			return (selectedEntry?.task && !Types.isString(selectedEntry?.task)) ? this.toTask(selectedEntry?.task) : undefined;
		} else if (firstLevelTask) {
			picker.dispose();
			return this.toTask(firstLevelTask);
		} else {
			return;
		}
	}

	private async getEntriesForProvider(type: string): Promise<QuickPickInput<TaskQuickPickEntry2>[]> {
		const tasks = await this.taskService.tasks({ type });
		const taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[] = tasks.map(task => this.createTaskEntry(task));
		return taskQuickPickEntries;
	}

	private async toTask(task: Task | ConfiguringTask): Promise<Task | undefined> {
		if (!ConfiguringTask.is(task)) {
			return task;
		}

		return this.taskService.tryResolveTask(task);
	}

	static async show(taskService: ITaskService, configurationService: IConfigurationService, quickInputService: IQuickInputService, _groupedTasks?: TaskMap) {
		const taskQuickPick = new TaskQuickPick(taskService, configurationService, quickInputService /*, groupedTasks*/);
		return taskQuickPick.show();
	}
}
