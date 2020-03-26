/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Task, ContributedTask, CustomTask, ConfiguringTask, TaskSorter } from 'vs/workbench/contrib/tasks/common/tasks';
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
export const QUICKOPEN_SKIP_CONFIG = 'task.quickOpen.skip';

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

const SHOW_ALL: string = nls.localize('taskQuickPick.showAll', "Show All Tasks...");

export class TaskQuickPick extends Disposable {
	private sorter: TaskSorter;
	private constructor(
		private taskService: ITaskService,
		private configurationService: IConfigurationService,
		private quickInputService: IQuickInputService) {
		super();
		this.sorter = this.taskService.createSorter();
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
		entries.push({ type: 'separator', label: nls.localize('contributedTasks', "contributed") });
		types.forEach(type => {
			entries.push({ label: type, task: type, description: SHOW_ALL });
		});
		entries.push({ label: SHOW_ALL, task: SHOW_ALL });
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

	private dedupeConfiguredAndRecent(recentTasks: (Task | ConfiguringTask)[], configuredTasks: (Task | ConfiguringTask)[]): (Task | ConfiguringTask)[] {
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
		dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => this.sorter.compare(a, b));
		return dedupedConfiguredTasks;
	}

	private async createTopLevelEntries(defaultEntry?: TaskQuickPickEntry): Promise<{ entries: QuickPickInput<TaskQuickPickEntry2>[], isSingleConfigured?: Task | ConfiguringTask }> {
		const recentTasks: (Task | ConfiguringTask)[] = (await this.taskService.readRecentTasks()).reverse();
		const configuredTasks: (Task | ConfiguringTask)[] = this.handleFolderTaskResult(await this.taskService.getWorkspaceTasks());
		const extensionTaskTypes = this.taskService.taskTypes();
		const taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[] = [];
		if (recentTasks.length > 0) {
			this.createEntriesForGroup(taskQuickPickEntries, recentTasks, nls.localize('recentlyUsed', 'recently used'));
		}
		if (configuredTasks.length > 0) {
			let dedupedConfiguredTasks: (Task | ConfiguringTask)[] = this.dedupeConfiguredAndRecent(recentTasks, configuredTasks);
			if (dedupedConfiguredTasks.length > 0) {
				this.createEntriesForGroup(taskQuickPickEntries, dedupedConfiguredTasks, nls.localize('configured', 'configured'));
			}
		}

		if (defaultEntry && (configuredTasks.length === 0)) {
			taskQuickPickEntries.push({ type: 'separator', label: nls.localize('configured', 'configured') });
			taskQuickPickEntries.push(defaultEntry);
		}

		if (extensionTaskTypes.length > 0) {
			this.createTypeEntries(taskQuickPickEntries, extensionTaskTypes);
		}
		return { entries: taskQuickPickEntries, isSingleConfigured: configuredTasks.length === 1 ? configuredTasks[0] : undefined };
	}

	private async show(placeHolder: string, defaultEntry?: TaskQuickPickEntry): Promise<Task | undefined | null> {
		const picker: IQuickPick<TaskQuickPickEntry2> = this.quickInputService.createQuickPick();
		picker.placeholder = placeHolder;
		picker.matchOnDescription = true;
		picker.ignoreFocusOut = false;
		picker.show();

		picker.onDidTriggerItemButton(context => {
			let task = context.item.task;
			this.quickInputService.cancel();
			if (ContributedTask.is(task)) {
				this.taskService.customize(task, undefined, true);
			} else if (CustomTask.is(task)) {
				this.taskService.openConfig(task);
			}
		});

		// First show recent tasks configured tasks. Other tasks will be available at a second level
		const topLevelEntriesResult = await this.createTopLevelEntries(defaultEntry);
		if (topLevelEntriesResult.isSingleConfigured && this.configurationService.getValue<boolean>(QUICKOPEN_SKIP_CONFIG)) {
			picker.dispose();
			return this.toTask(topLevelEntriesResult.isSingleConfigured);
		}
		const taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[] = topLevelEntriesResult.entries;

		do {
			const firstLevelTask = await this.doPickerFirstLevel(picker, taskQuickPickEntries);
			if (Types.isString(firstLevelTask)) {
				// Proceed to second level of quick pick
				const selectedEntry = await this.doPickerSecondLevel(picker, firstLevelTask);
				if (selectedEntry && selectedEntry.task === null) {
					// The user has chosen to go back to the first level
					continue;
				} else {
					picker.dispose();
					return (selectedEntry?.task && !Types.isString(selectedEntry?.task)) ? this.toTask(selectedEntry?.task) : undefined;
				}
			} else if (firstLevelTask) {
				picker.dispose();
				return this.toTask(firstLevelTask);
			} else {
				return;
			}
		} while (1);
		return;
	}

	private async doPickerFirstLevel(picker: IQuickPick<TaskQuickPickEntry2>, taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[]): Promise<Task | ConfiguringTask | string | null | undefined> {
		picker.items = taskQuickPickEntries;
		const firstLevelPickerResult = await new Promise<TaskQuickPickEntry2 | undefined | null>(resolve => {
			Event.once(picker.onDidAccept)(async () => {
				resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
			});
		});
		return firstLevelPickerResult?.task;
	}

	private async doPickerSecondLevel(picker: IQuickPick<TaskQuickPickEntry2>, type: string) {
		picker.busy = true;
		picker.value = '';
		if (type === SHOW_ALL) {
			picker.items = (await this.taskService.tasks()).sort((a, b) => this.sorter.compare(a, b)).map(task => this.createTaskEntry(task));
		} else {
			picker.items = await this.getEntriesForProvider(type);
		}
		picker.busy = false;
		const secondLevelPickerResult = await new Promise<TaskQuickPickEntry2 | undefined | null>(resolve => {
			Event.once(picker.onDidAccept)(async () => {
				resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
			});
		});

		return secondLevelPickerResult;
	}

	private async getEntriesForProvider(type: string): Promise<QuickPickInput<TaskQuickPickEntry2>[]> {
		const tasks = (await this.taskService.tasks({ type })).sort((a, b) => this.sorter.compare(a, b));
		let taskQuickPickEntries: QuickPickInput<TaskQuickPickEntry2>[];
		if (tasks.length > 0) {
			taskQuickPickEntries = tasks.map(task => this.createTaskEntry(task));
			taskQuickPickEntries.unshift({
				label: nls.localize('TaskQuickPick.goBack', 'Go back...'),
				task: null
			});
		} else {
			taskQuickPickEntries = [{
				label: nls.localize('TaskQuickPick.noTasksForType', 'No {0} tasks found. Go back...', type),
				task: null
			}];
		}
		return taskQuickPickEntries;
	}

	private async toTask(task: Task | ConfiguringTask): Promise<Task | undefined> {
		if (!ConfiguringTask.is(task)) {
			return task;
		}

		return this.taskService.tryResolveTask(task);
	}

	static async show(taskService: ITaskService, configurationService: IConfigurationService, quickInputService: IQuickInputService, placeHolder: string, defaultEntry?: TaskQuickPickEntry, selectedEntry?: TaskQuickPickEntry, additionalEntries?: TaskQuickPickEntry[], tasks?: Promise<Task[]> | Task[], taskSet?: TaskMap) {
		const taskQuickPick = new TaskQuickPick(taskService, configurationService, quickInputService);
		return taskQuickPick.show(placeHolder, defaultEntry);
	}
}
