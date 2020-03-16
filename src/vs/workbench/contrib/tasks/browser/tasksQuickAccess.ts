/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IPickerQuickAccessItem, PickerQuickAccessProvider, TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITaskService } from 'vs/workbench/contrib/tasks/common/taskService';
import { CustomTask, ContributedTask } from 'vs/workbench/contrib/tasks/common/tasks';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class TasksQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'task ';

	private activationPromise: Promise<void>;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@ITaskService private taskService: ITaskService
	) {
		super(TasksQuickAccessProvider.PREFIX);

		this.activationPromise = extensionService.activateByEvent('onCommand:workbench.action.tasks.runTask');
	}

	protected async getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {

		// always await extensions
		await this.activationPromise;

		if (token.isCancellationRequested) {
			return [];
		}

		// Resolve custom and contributed tasks
		const tasks = (await this.taskService.tasks())
			.filter<CustomTask | ContributedTask>((task): task is CustomTask | ContributedTask => ContributedTask.is(task) || CustomTask.is(task));

		if (token.isCancellationRequested) {
			return [];
		}

		this.taskService.migrateRecentTasks(tasks);

		// Split up tasks across recently used, configured and detected
		const recentlyUsedTasks = this.taskService.getRecentlyUsedTasks();
		const recent: Array<CustomTask | ContributedTask> = [];
		const configured: CustomTask[] = [];
		const detected: ContributedTask[] = [];
		const taskMap: IStringDictionary<CustomTask | ContributedTask> = Object.create(null);
		for (const task of tasks) {
			const key = task.getRecentlyUsedKey();
			if (key) {
				taskMap[key] = task;
			}
		}
		for (const key of recentlyUsedTasks.keys()) {
			const task = taskMap[key];
			if (task) {
				recent.push(task);
			}
		}
		for (const task of tasks) {
			const key = task.getRecentlyUsedKey();
			if (!key || !recentlyUsedTasks.has(key)) {
				if (CustomTask.is(task)) {
					configured.push(task);
				} else {
					detected.push(task);
				}
			}
		}

		const taskPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];
		const sorter = this.taskService.createSorter();

		// Fill picks in sorted order

		this.fillPicks(taskPicks, filter, recent, localize('recentlyUsed', "recently used tasks"));

		configured.sort((a, b) => sorter.compare(a, b));
		this.fillPicks(taskPicks, filter, configured, localize('configured', "configured tasks"));

		detected.sort((a, b) => sorter.compare(a, b));
		this.fillPicks(taskPicks, filter, detected, localize('detected', "detected tasks"));

		return taskPicks;
	}

	private fillPicks(taskPicks: Array<IPickerQuickAccessItem | IQuickPickSeparator>, input: string, tasks: Array<CustomTask | ContributedTask>, groupLabel: string): void {
		let first = true;
		for (const task of tasks) {
			const highlights = matchesFuzzy(input, task._label);
			if (!highlights) {
				continue;
			}
			if (first) {
				first = false;
				taskPicks.push({ type: 'separator', label: groupLabel });
			}
			taskPicks.push({
				label: task._label,
				ariaLabel: localize('entryAriaLabel', "{0}, tasks picker", task._label),
				description: this.taskService.getTaskDescription(task),
				highlights: { label: highlights },
				buttons: (() => {
					const buttons = [];

					if (ContributedTask.is(task) || CustomTask.is(task)) {
						buttons.push({
							iconClass: 'codicon-gear',
							tooltip: localize('customizeTask', "Configure Task")
						});
					}

					return buttons;
				})(),
				trigger: () => {
					if (ContributedTask.is(task)) {
						this.taskService.customize(task, undefined, true);
					} else {
						this.taskService.openConfig(task);
					}

					return TriggerAction.CLOSE_PICKER;
				},
				accept: () => {
					this.taskService.run(task, { attachProblemMatcher: true });
				}
			});
		}
	}
}
