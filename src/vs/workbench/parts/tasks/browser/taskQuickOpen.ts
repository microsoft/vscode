/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as QuickOpen from 'vs/base/parts/quickopen/common/quickOpen';
import * as Model from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

import { CustomTask, ContributedTask } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

import * as base from './quickOpen';

class TaskEntry extends base.TaskEntry {
	constructor(quickOpenService: IQuickOpenService, taskService: ITaskService, task: CustomTask | ContributedTask, highlights: Model.IHighlight[] = []) {
		super(quickOpenService, taskService, task, highlights);
	}

	public run(mode: QuickOpen.Mode, context: Model.IContext): boolean {
		if (mode === QuickOpen.Mode.PREVIEW) {
			return false;
		}
		let task = this._task;
		return this.doRun(task, { attachProblemMatcher: true });
	}
}

export class QuickOpenHandler extends base.QuickOpenHandler {

	public static readonly ID = 'workbench.picker.tasks';

	private activationPromise: Promise<void>;

	constructor(
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IExtensionService extensionService: IExtensionService,
		@ITaskService taskService: ITaskService
	) {
		super(quickOpenService, taskService);
		this.activationPromise = extensionService.activateByEvent('onCommand:workbench.action.tasks.runTask');
	}

	public getAriaLabel(): string {
		return nls.localize('tasksAriaLabel', "Type the name of a task to run");
	}

	protected getTasks(): Promise<Array<CustomTask | ContributedTask>> {
		return this.activationPromise.then(() => {
			return this.taskService.tasks().then(tasks => tasks.filter<CustomTask | ContributedTask>((task): task is CustomTask | ContributedTask => ContributedTask.is(task) || CustomTask.is(task)));
		});
	}

	protected createEntry(task: CustomTask | ContributedTask, highlights: Model.IHighlight[]): base.TaskEntry {
		return new TaskEntry(this.quickOpenService, this.taskService, task, highlights);
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noTasksMatching', "No tasks matching");
		}
		return nls.localize('noTasksFound', "No tasks found");
	}
}