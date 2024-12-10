/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IQuickPickSeparator, IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ITaskService, Task } from '../common/taskService.js';
import { CustomTask, ContributedTask, ConfiguringTask } from '../common/tasks.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { TaskQuickPick, ITaskTwoLevelQuickPickEntry } from './taskQuickPick.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { isString } from '../../../../base/common/types.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export class TasksQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'task ';

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@ITaskService private _taskService: ITaskService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IQuickInputService private _quickInputService: IQuickInputService,
		@INotificationService private _notificationService: INotificationService,
		@IDialogService private _dialogService: IDialogService,
		@IThemeService private _themeService: IThemeService,
		@IStorageService private _storageService: IStorageService
	) {
		super(TasksQuickAccessProvider.PREFIX, {
			noResultsPick: {
				label: localize('noTaskResults', "No matching tasks")
			}
		});
	}

	protected async _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {
		if (token.isCancellationRequested) {
			return [];
		}

		const taskQuickPick = new TaskQuickPick(this._taskService, this._configurationService, this._quickInputService, this._notificationService, this._themeService, this._dialogService, this._storageService);
		const topLevelPicks = await taskQuickPick.getTopLevelEntries();
		const taskPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		for (const entry of topLevelPicks.entries) {
			const highlights = matchesFuzzy(filter, entry.label!);
			if (!highlights) {
				continue;
			}

			if (entry.type === 'separator') {
				taskPicks.push(entry);
			}

			const task: Task | ConfiguringTask | string = (<ITaskTwoLevelQuickPickEntry>entry).task!;
			const quickAccessEntry: IPickerQuickAccessItem = <ITaskTwoLevelQuickPickEntry>entry;
			quickAccessEntry.highlights = { label: highlights };
			quickAccessEntry.trigger = (index) => {
				if ((index === 1) && (quickAccessEntry.buttons?.length === 2)) {
					const key = (task && !isString(task)) ? task.getKey() : undefined;
					if (key) {
						this._taskService.removeRecentlyUsedTask(key);
					}
					return TriggerAction.REFRESH_PICKER;
				} else {
					if (ContributedTask.is(task)) {
						this._taskService.customize(task, undefined, true);
					} else if (CustomTask.is(task)) {
						this._taskService.openConfig(task);
					}
					return TriggerAction.CLOSE_PICKER;
				}
			};
			quickAccessEntry.accept = async () => {
				if (isString(task)) {
					// switch to quick pick and show second level
					const showResult = await taskQuickPick.show(localize('TaskService.pickRunTask', 'Select the task to run'), undefined, task);
					if (showResult) {
						this._taskService.run(showResult, { attachProblemMatcher: true });
					}
				} else {
					this._taskService.run(await this._toTask(task), { attachProblemMatcher: true });
				}
			};

			taskPicks.push(quickAccessEntry);
		}
		return taskPicks;
	}

	private async _toTask(task: Task | ConfiguringTask): Promise<Task | undefined> {
		if (!ConfiguringTask.is(task)) {
			return task;
		}

		return this._taskService.tryResolveTask(task);
	}
}
