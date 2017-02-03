/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Filters = require('vs/base/common/filters');
import { TPromise } from 'vs/base/common/winjs.base';
import Quickopen = require('vs/workbench/browser/quickopen');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

import { ITaskService, TaskDescription } from 'vs/workbench/parts/tasks/common/taskService';

class TaskEntry extends Model.QuickOpenEntry {

	private taskService: ITaskService;
	private task: TaskDescription;

	constructor(taskService: ITaskService, task: TaskDescription, highlights: Model.IHighlight[] = []) {
		super(highlights);
		this.taskService = taskService;
		this.task = task;
	}

	public getLabel(): string {
		return this.task.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, tasks", this.getLabel());
	}

	public run(mode: QuickOpen.Mode, context: Model.IContext): boolean {
		if (mode === QuickOpen.Mode.PREVIEW) {
			return false;
		}
		this.taskService.run(this.task.id);
		return true;
	}
}

export class QuickOpenHandler extends Quickopen.QuickOpenHandler {

	private quickOpenService: IQuickOpenService;
	private taskService: ITaskService;

	constructor(
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@ITaskService taskService: ITaskService
	) {
		super();

		this.quickOpenService = quickOpenService;
		this.taskService = taskService;
	}

	public getAriaLabel(): string {
		return nls.localize('tasksAriaLabel', "Type the name of a task to run");
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		return this.taskService.tasks().then(tasks => tasks
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(task => ({ task: task, highlights: Filters.matchesContiguousSubString(input, task.name) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ task, highlights }) => new TaskEntry(this.taskService, task, highlights))
			, _ => []).then(e => new Model.QuickOpenModel(e));
	}

	public getClass(): string {
		return null;
	}

	public canRun(): boolean {
		return true;
	}

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: !!input
		};
	}

	public onClose(canceled: boolean): void {
		return;
	}

	public getGroupLabel(): string {
		return null;
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noTasksMatching', "No tasks matching");
		}
		return nls.localize('noTasksFound', "No tasks found");
	}
}
