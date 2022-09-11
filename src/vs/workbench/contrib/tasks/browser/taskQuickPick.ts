/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import { Task, ContributedTask, CustomTask, ConfiguringTask, TaskSorter, KeyedTaskIdentifier } from 'vs/workbench/contrib/tasks/common/tasks';
import { IWorkspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import * as Types from 'vs/base/common/types';
import { ITaskService, IWorkspaceFolderTaskResult } from 'vs/workbench/contrib/tasks/common/taskService';
import { IQuickPickItem, QuickPickInput, IQuickPick, IQuickInputButton } from 'vs/base/parts/quickinput/common/quickInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Codicon } from 'vs/base/common/codicons';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { getColorClass, getColorStyleElement } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { TaskQuickPickEntryType } from 'vs/workbench/contrib/tasks/browser/abstractTaskService';

export const QUICKOPEN_DETAIL_CONFIG = 'task.quickOpen.detail';
export const QUICKOPEN_SKIP_CONFIG = 'task.quickOpen.skip';
export function isWorkspaceFolder(folder: IWorkspace | IWorkspaceFolder): folder is IWorkspaceFolder {
	return 'uri' in folder;
}

export interface ITaskQuickPickEntry extends IQuickPickItem {
	task: Task | undefined | null;
}

export interface ITaskTwoLevelQuickPickEntry extends IQuickPickItem {
	task: Task | ConfiguringTask | string | undefined | null;
	settingType?: string;
}

const SHOW_ALL: string = nls.localize('taskQuickPick.showAll', "Show All Tasks...");

export const configureTaskIcon = registerIcon('tasks-list-configure', Codicon.gear, nls.localize('configureTaskIcon', 'Configuration icon in the tasks selection list.'));
const removeTaskIcon = registerIcon('tasks-remove', Codicon.close, nls.localize('removeTaskIcon', 'Icon for remove in the tasks selection list.'));

export class TaskQuickPick extends Disposable {
	private _sorter: TaskSorter;
	private _topLevelEntries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[] | undefined;
	constructor(
		private _taskService: ITaskService,
		private _configurationService: IConfigurationService,
		private _quickInputService: IQuickInputService,
		private _notificationService: INotificationService,
		private _themeService: IThemeService,
		private _dialogService: IDialogService) {
		super();
		this._sorter = this._taskService.createSorter();
	}

	private _showDetail(): boolean {
		// Ensure invalid values get converted into boolean values
		return !!this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
	}

	private _guessTaskLabel(task: Task | ConfiguringTask): string {
		if (task._label) {
			return task._label;
		}
		if (ConfiguringTask.is(task)) {
			let label: string = task.configures.type;
			const configures: Partial<KeyedTaskIdentifier> = Objects.deepClone(task.configures);
			delete configures['_key'];
			delete configures['type'];
			Object.keys(configures).forEach(key => label += `: ${configures[key]}`);
			return label;
		}
		return '';
	}

	public static getTaskLabelWithIcon(task: Task | ConfiguringTask, labelGuess?: string): string {
		const label = labelGuess || task._label;
		const icon = task.configurationProperties.icon;
		if (!icon) {
			return `${label}`;
		}
		return icon.id ? `$(${icon.id}) ${label}` : `$(${Codicon.tools.id}) ${label}`;
	}

	public static applyColorStyles(task: Task | ConfiguringTask, entry: TaskQuickPickEntryType | ITaskTwoLevelQuickPickEntry, themeService: IThemeService): void {
		if (task.configurationProperties.icon?.color) {
			const colorTheme = themeService.getColorTheme();
			const styleElement = getColorStyleElement(colorTheme);
			entry.iconClasses = [getColorClass(task.configurationProperties.icon.color)];
			document.body.appendChild(styleElement);
		}
	}

	private _createTaskEntry(task: Task | ConfiguringTask, extraButtons: IQuickInputButton[] = []): ITaskTwoLevelQuickPickEntry {
		const entry: ITaskTwoLevelQuickPickEntry = { label: TaskQuickPick.getTaskLabelWithIcon(task, this._guessTaskLabel(task)), description: this._taskService.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : undefined };
		entry.buttons = [];
		entry.buttons.push({ iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize('configureTask', "Configure Task") });
		entry.buttons.push(...extraButtons);
		TaskQuickPick.applyColorStyles(task, entry, this._themeService);
		return entry;
	}

	private _createEntriesForGroup(entries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[], tasks: (Task | ConfiguringTask)[],
		groupLabel: string, extraButtons: IQuickInputButton[] = []) {
		entries.push({ type: 'separator', label: groupLabel });
		tasks.forEach(task => {
			if (!task.configurationProperties.hide) {
				entries.push(this._createTaskEntry(task, extraButtons));
			}
		});
	}

	private _createTypeEntries(entries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[], types: string[]) {
		entries.push({ type: 'separator', label: nls.localize('contributedTasks', "contributed") });
		types.forEach(type => {
			entries.push({ label: `$(folder) ${type}`, task: type, ariaLabel: nls.localize('taskType', "All {0} tasks", type) });
		});
		entries.push({ label: SHOW_ALL, task: SHOW_ALL, alwaysShow: true });
	}

	private _handleFolderTaskResult(result: Map<string, IWorkspaceFolderTaskResult>): (Task | ConfiguringTask)[] {
		const tasks: (Task | ConfiguringTask)[] = [];
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

	private _dedupeConfiguredAndRecent(recentTasks: (Task | ConfiguringTask)[], configuredTasks: (Task | ConfiguringTask)[]): { configuredTasks: (Task | ConfiguringTask)[]; recentTasks: (Task | ConfiguringTask)[] } {
		let dedupedConfiguredTasks: (Task | ConfiguringTask)[] = [];
		const foundRecentTasks: boolean[] = Array(recentTasks.length).fill(false);
		for (let j = 0; j < configuredTasks.length; j++) {
			const workspaceFolder = configuredTasks[j].getWorkspaceFolder()?.uri.toString();
			const definition = configuredTasks[j].getDefinition()?._key;
			const type = configuredTasks[j].type;
			const label = configuredTasks[j]._label;
			const recentKey = configuredTasks[j].getRecentlyUsedKey();
			const findIndex = recentTasks.findIndex((value) => {
				return (workspaceFolder && definition && value.getWorkspaceFolder()?.uri.toString() === workspaceFolder
					&& ((value.getDefinition()?._key === definition) || (value.type === type && value._label === label)))
					|| (recentKey && value.getRecentlyUsedKey() === recentKey);
			});
			if (findIndex === -1) {
				dedupedConfiguredTasks.push(configuredTasks[j]);
			} else {
				recentTasks[findIndex] = configuredTasks[j];
				foundRecentTasks[findIndex] = true;
			}
		}
		dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => this._sorter.compare(a, b));
		const prunedRecentTasks: (Task | ConfiguringTask)[] = [];
		for (let i = 0; i < recentTasks.length; i++) {
			if (foundRecentTasks[i] || ConfiguringTask.is(recentTasks[i])) {
				prunedRecentTasks.push(recentTasks[i]);
			}
		}
		return { configuredTasks: dedupedConfiguredTasks, recentTasks: prunedRecentTasks };
	}

	public async getTopLevelEntries(defaultEntry?: ITaskQuickPickEntry): Promise<{ entries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[]; isSingleConfigured?: Task | ConfiguringTask }> {
		if (this._topLevelEntries !== undefined) {
			return { entries: this._topLevelEntries };
		}
		let recentTasks: (Task | ConfiguringTask)[] = (await this._taskService.getSavedTasks('historical')).reverse();
		const configuredTasks: (Task | ConfiguringTask)[] = this._handleFolderTaskResult(await this._taskService.getWorkspaceTasks());
		const extensionTaskTypes = this._taskService.taskTypes();
		this._topLevelEntries = [];
		// Dedupe will update recent tasks if they've changed in tasks.json.
		const dedupeAndPrune = this._dedupeConfiguredAndRecent(recentTasks, configuredTasks);
		const dedupedConfiguredTasks: (Task | ConfiguringTask)[] = dedupeAndPrune.configuredTasks;
		recentTasks = dedupeAndPrune.recentTasks;
		if (recentTasks.length > 0) {
			const removeRecentButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(removeTaskIcon),
				tooltip: nls.localize('removeRecent', 'Remove Recently Used Task')
			};
			this._createEntriesForGroup(this._topLevelEntries, recentTasks, nls.localize('recentlyUsed', 'recently used'), [removeRecentButton]);
		}
		if (configuredTasks.length > 0) {
			if (dedupedConfiguredTasks.length > 0) {
				this._createEntriesForGroup(this._topLevelEntries, dedupedConfiguredTasks, nls.localize('configured', 'configured'));
			}
		}

		if (defaultEntry && (configuredTasks.length === 0)) {
			this._topLevelEntries.push({ type: 'separator', label: nls.localize('configured', 'configured') });
			this._topLevelEntries.push(defaultEntry);
		}

		if (extensionTaskTypes.length > 0) {
			this._createTypeEntries(this._topLevelEntries, extensionTaskTypes);
		}
		return { entries: this._topLevelEntries, isSingleConfigured: configuredTasks.length === 1 ? configuredTasks[0] : undefined };
	}

	public async handleSettingOption(selectedType: string) {
		const noButton = nls.localize('TaskQuickPick.changeSettingNo', "No");
		const yesButton = nls.localize('TaskQuickPick.changeSettingYes', "Yes");
		const changeSettingResult = await this._dialogService.show(Severity.Warning,
			nls.localize('TaskQuickPick.changeSettingDetails',
				"Task detection for {0} tasks causes files in any workspace you open to be run as code. Enabling {0} task detection is a user setting and will apply to any workspace you open. \n\n Do you want to enable {0} task detection for all workspaces?", selectedType),
			[noButton, yesButton],
			{ cancelId: 1 }
		);
		if (changeSettingResult.choice === 1) {
			await this._configurationService.updateValue(`${selectedType}.autoDetect`, 'on');
			await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
			return this.show(nls.localize('TaskService.pickRunTask', 'Select the task to run'), undefined, selectedType);
		}
		return undefined;
	}

	public async show(placeHolder: string, defaultEntry?: ITaskQuickPickEntry, startAtType?: string, name?: string): Promise<Task | undefined | null> {
		const picker: IQuickPick<ITaskTwoLevelQuickPickEntry> = this._quickInputService.createQuickPick();
		picker.placeholder = placeHolder;
		picker.matchOnDescription = true;
		picker.ignoreFocusOut = false;
		picker.show();

		picker.onDidTriggerItemButton(async (context) => {
			const task = context.item.task;
			if (context.button.iconClass === ThemeIcon.asClassName(removeTaskIcon)) {
				const key = (task && !Types.isString(task)) ? task.getRecentlyUsedKey() : undefined;
				if (key) {
					this._taskService.removeRecentlyUsedTask(key);
				}
				const indexToRemove = picker.items.indexOf(context.item);
				if (indexToRemove >= 0) {
					picker.items = [...picker.items.slice(0, indexToRemove), ...picker.items.slice(indexToRemove + 1)];
				}
			} else {
				this._quickInputService.cancel();
				if (ContributedTask.is(task)) {
					this._taskService.customize(task, undefined, true);
				} else if (CustomTask.is(task) || ConfiguringTask.is(task)) {
					let canOpenConfig: boolean = false;
					try {
						canOpenConfig = await this._taskService.openConfig(task);
					} catch (e) {
						// do nothing.
					}
					if (!canOpenConfig) {
						this._taskService.customize(task, undefined, true);
					}
				}
			}
		});
		let firstLevelTask: Task | ConfiguringTask | string | undefined | null = startAtType;
		if (!firstLevelTask) {
			// First show recent tasks configured tasks. Other tasks will be available at a second level
			const topLevelEntriesResult = await this.getTopLevelEntries(defaultEntry);
			if (topLevelEntriesResult.isSingleConfigured && this._configurationService.getValue<boolean>(QUICKOPEN_SKIP_CONFIG)) {
				picker.dispose();
				return this._toTask(topLevelEntriesResult.isSingleConfigured);
			}
			const taskQuickPickEntries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[] = topLevelEntriesResult.entries;
			if (name) {
				picker.value = name;
			}
			firstLevelTask = await this._doPickerFirstLevel(picker, taskQuickPickEntries);
		}
		do {
			if (Types.isString(firstLevelTask)) {
				// Proceed to second level of quick pick
				const selectedEntry = await this.doPickerSecondLevel(picker, firstLevelTask, name);
				if (selectedEntry && !selectedEntry.settingType && selectedEntry.task === null) {
					// The user has chosen to go back to the first level
					firstLevelTask = await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries);
					picker.value = '';
				} else if (selectedEntry && Types.isString(selectedEntry.settingType)) {
					picker.dispose();
					return this.handleSettingOption(selectedEntry.settingType);
				} else {
					picker.dispose();
					return (selectedEntry?.task && !Types.isString(selectedEntry?.task)) ? this._toTask(selectedEntry?.task) : undefined;
				}
			} else if (firstLevelTask) {
				picker.dispose();
				return this._toTask(firstLevelTask);
			} else {
				picker.dispose();
				return firstLevelTask;
			}
		} while (1);
		return;
	}



	private async _doPickerFirstLevel(picker: IQuickPick<ITaskTwoLevelQuickPickEntry>, taskQuickPickEntries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[]): Promise<Task | ConfiguringTask | string | null | undefined> {
		picker.items = taskQuickPickEntries;
		const firstLevelPickerResult = await new Promise<ITaskTwoLevelQuickPickEntry | undefined | null>(resolve => {
			Event.once(picker.onDidAccept)(async () => {
				resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
			});
		});
		return firstLevelPickerResult?.task;
	}

	public async doPickerSecondLevel(picker: IQuickPick<ITaskTwoLevelQuickPickEntry>, type: string, name?: string) {
		picker.busy = true;
		if (type === SHOW_ALL) {
			const items = (await this._taskService.tasks()).filter(t => !t.configurationProperties.hide).sort((a, b) => this._sorter.compare(a, b)).map(task => this._createTaskEntry(task));
			items.push(...TaskQuickPick.allSettingEntries(this._configurationService));
			picker.items = items;
		} else {
			picker.value = name || '';
			picker.items = await this._getEntriesForProvider(type);
		}
		picker.show();
		picker.busy = false;
		const secondLevelPickerResult = await new Promise<ITaskTwoLevelQuickPickEntry | undefined | null>(resolve => {
			Event.once(picker.onDidAccept)(async () => {
				resolve(picker.selectedItems ? picker.selectedItems[0] : undefined);
			});
		});
		return secondLevelPickerResult;
	}

	public static allSettingEntries(configurationService: IConfigurationService): (ITaskTwoLevelQuickPickEntry & { settingType: string })[] {
		const entries: (ITaskTwoLevelQuickPickEntry & { settingType: string })[] = [];
		const gruntEntry = TaskQuickPick.getSettingEntry(configurationService, 'grunt');
		if (gruntEntry) {
			entries.push(gruntEntry);
		}
		const gulpEntry = TaskQuickPick.getSettingEntry(configurationService, 'gulp');
		if (gulpEntry) {
			entries.push(gulpEntry);
		}
		const jakeEntry = TaskQuickPick.getSettingEntry(configurationService, 'jake');
		if (jakeEntry) {
			entries.push(jakeEntry);
		}
		return entries;
	}

	public static getSettingEntry(configurationService: IConfigurationService, type: string): (ITaskTwoLevelQuickPickEntry & { settingType: string }) | undefined {
		if (configurationService.getValue(`${type}.autoDetect`) === 'off') {
			return {
				label: nls.localize('TaskQuickPick.changeSettingsOptions', "$(gear) {0} task detection is turned off. Enable {1} task detection...",
					type[0].toUpperCase() + type.slice(1), type),
				task: null,
				settingType: type,
				alwaysShow: true
			};
		}
		return undefined;
	}

	private async _getEntriesForProvider(type: string): Promise<QuickPickInput<ITaskTwoLevelQuickPickEntry>[]> {
		const tasks = (await this._taskService.tasks({ type })).sort((a, b) => this._sorter.compare(a, b));
		let taskQuickPickEntries: QuickPickInput<ITaskTwoLevelQuickPickEntry>[] = [];
		if (tasks.length > 0) {
			for (const task of tasks) {
				if (!task.configurationProperties.hide) {
					taskQuickPickEntries.push(this._createTaskEntry(task));
				}
			}
			taskQuickPickEntries.push({
				type: 'separator'
			}, {
				label: nls.localize('TaskQuickPick.goBack', 'Go back ↩'),
				task: null,
				alwaysShow: true
			});
		} else {
			taskQuickPickEntries = [{
				label: nls.localize('TaskQuickPick.noTasksForType', 'No {0} tasks found. Go back ↩', type),
				task: null,
				alwaysShow: true
			}];
		}

		const settingEntry = TaskQuickPick.getSettingEntry(this._configurationService, type);
		if (settingEntry) {
			taskQuickPickEntries.push(settingEntry);
		}
		return taskQuickPickEntries;
	}

	private async _toTask(task: Task | ConfiguringTask): Promise<Task | undefined> {
		if (!ConfiguringTask.is(task)) {
			return task;
		}

		const resolvedTask = await this._taskService.tryResolveTask(task);

		if (!resolvedTask) {
			this._notificationService.error(nls.localize('noProviderForTask', "There is no task provider registered for tasks of type \"{0}\".", task.type));
		}
		return resolvedTask;
	}

	static async show(taskService: ITaskService, configurationService: IConfigurationService,
		quickInputService: IQuickInputService, notificationService: INotificationService,
		dialogService: IDialogService, themeService: IThemeService, placeHolder: string, defaultEntry?: ITaskQuickPickEntry, type?: string, name?: string) {
		const taskQuickPick = new TaskQuickPick(taskService, configurationService, quickInputService, notificationService, themeService, dialogService);
		return taskQuickPick.show(placeHolder, defaultEntry, type, name);
	}
}
