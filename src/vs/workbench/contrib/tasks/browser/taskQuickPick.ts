/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Task, ContributedTask, CustomTask } from 'vs/workbench/contrib/tasks/common/tasks';
import { IWorkspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import * as Types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITaskService, TaskCategories } from 'vs/workbench/contrib/tasks/common/taskService';
import { IQuickPickItem, QuickPickInput, IQuickPick } from 'vs/base/parts/quickinput/common/quickInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable } from 'vs/base/common/lifecycle';

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
	task: Task | string | undefined | null;
}

export class TaskQuickPick extends Disposable {
	private taskInstanceCount: { [key: string]: number; } = {};
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

	private createTaskEntry(task: Task): TaskQuickPickEntry {
		let entryLabel = task._label;
		let commonKey = task._id.split('|')[0];
		if (this.taskInstanceCount[commonKey]) {
			entryLabel = entryLabel + ' (' + this.taskInstanceCount[commonKey].toString() + ')';
			this.taskInstanceCount[commonKey]++;
		} else {
			this.taskInstanceCount[commonKey] = 1;
		}
		const entry: TaskQuickPickEntry = { label: entryLabel, description: this.taskService.getTaskDescription(task), task, detail: this.showDetail() ? task.configurationProperties.detail : undefined };
		entry.buttons = [{ iconClass: 'codicon-gear', tooltip: nls.localize('configureTask', "Configure Task") }];
		return entry;
	}

	private createEntriesForGroup(entries: QuickPickInput<TaskQuickPickEntry>[], tasks: Task[], groupLabel: string) {
		entries.push({ type: 'separator', label: groupLabel });
		tasks.forEach(task => {
			entries.push(this.createTaskEntry(task));
		});
	}

	private createTypeEntries(entries: QuickPickInput<TaskQuickPickEntry>[], types: string[]) {
		entries.push({ type: 'separator', label: nls.localize('contributedTasks', "contributed tasks") });
		types.forEach(type => {
			entries.push({ label: type, task: type });
		});
	}

	private async show(placeHolder?: string): Promise<Task | undefined | null> {
		// First show recent tasks configured tasks. Other tasks will be available at a second level
		const recentTasks = await this.taskService.tasks({ type: TaskCategories.Recent });
		const configuredTasks = await this.taskService.tasks({ type: TaskCategories.Configured });
		const extensionTaskTypes = this.taskService.taskTypes();
		const sorter = this.taskService.createSorter();
		const taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry>[] = [];
		if (recentTasks.length > 0) {
			this.createEntriesForGroup(taskQuickPickEntries, recentTasks, nls.localize('recentlyUsed', 'recently used tasks'));
		}
		if (configuredTasks.length > 0) {
			for (let i = 0; i < configuredTasks.length; i++) {

			}
			this.createEntriesForGroup(taskQuickPickEntries, configuredTasks.sort((a, b) => sorter.compare(a, b)), nls.localize('configured', 'configured tasks'));
		}
		if (extensionTaskTypes.length > 0) {
			this.createTypeEntries(taskQuickPickEntries, extensionTaskTypes);
		}
		// TODO: Add additional entries
		// TODO: skip if only one entry and setting is set
		// TODO: handle default entry

		const picker: IQuickPick<TaskQuickPickEntry> = this.quickInputService.createQuickPick();
		picker.placeholder = placeHolder;
		picker.matchOnDescription = true;
		picker.ignoreFocusOut = false;
		picker.items = taskQuickPickEntries;

		picker.onDidTriggerItemButton(context => {
			let task = context.item.task;
			this.quickInputService.cancel();
			if (ContributedTask.is(task)) {
				this.taskService.customize(task, undefined, true);
			} else if (CustomTask.is(task)) {
				this.taskService.openConfig(task);
			}
		});
		picker.show();

		const firstLevelPickerResult = await new Promise<TaskQuickPickEntry | undefined | null>(resolve => {
			this._register(picker.onDidAccept(async () => {
				let selection = picker.selectedItems ? picker.selectedItems[0] : undefined;
				// if (cancellationToken.isCancellationRequested) {
				// 	// canceled when there's only one task
				// 	const task = (await pickEntries)[0];
				// 	if ((<any>task).task) {
				// 		selection = <TaskQuickPickEntry>task;
				// 	}
				// }
				picker.dispose();
				if (!selection) {
					resolve();
				}
				resolve(selection);
			}));
		});
		const firstLevelTask: string | Task | undefined | null = firstLevelPickerResult?.task;
		if (Types.isString(firstLevelTask)) {
			// Proceed to second level of quick pick
			return;
		} else if (firstLevelTask) {
			return firstLevelTask;
		} else {
			return;
		}
	}

	static async show(taskService: ITaskService, configurationService: IConfigurationService, quickInputService: IQuickInputService, _groupedTasks?: TaskMap) {
		const taskQuickPick = new TaskQuickPick(taskService, configurationService, quickInputService /*, groupedTasks*/);
		return taskQuickPick.show();
	}
}
