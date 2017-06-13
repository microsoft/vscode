/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Filters = require('vs/base/common/filters');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action, IAction } from 'vs/base/common/actions';
import { IStringDictionary } from 'vs/base/common/collections';

import Quickopen = require('vs/workbench/browser/quickopen');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

import { Task, TaskSourceKind } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { ActionBarContributor, ContributableActionProvider } from 'vs/workbench/browser/actions';

export class TaskEntry extends Model.QuickOpenEntry {

	constructor(protected taskService: ITaskService, protected _task: Task, highlights: Model.IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.task._label;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, tasks", this.getLabel());
	}

	public get task(): Task {
		return this._task;
	}
}

export class TaskGroupEntry extends Model.QuickOpenEntryGroup {
	constructor(entry: TaskEntry, groupLabel: string, withBorder: boolean) {
		super(entry, groupLabel, withBorder);
	}
}

export abstract class QuickOpenHandler extends Quickopen.QuickOpenHandler {

	private tasks: TPromise<Task[]>;


	constructor(
		protected quickOpenService: IQuickOpenService,
		protected taskService: ITaskService
	) {
		super();

		this.quickOpenService = quickOpenService;
		this.taskService = taskService;
	}

	public onOpen(): void {
		this.tasks = this.getTasks();
	}

	public onClose(canceled: boolean): void {
		this.tasks = undefined;
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		return this.tasks.then((tasks) => {
			let entries: Model.QuickOpenEntry[] = [];
			if (tasks.length === 0) {
				return new Model.QuickOpenModel(entries);
			}
			let recentlyUsedTasks = this.taskService.getRecentlyUsedTasks();
			let recent: Task[] = [];
			let others: Task[] = [];
			let taskMap: IStringDictionary<Task> = Object.create(null);
			tasks.forEach(task => taskMap[task.identifier] = task);
			recentlyUsedTasks.keys().forEach(key => {
				let task = taskMap[key];
				if (task) {
					recent.push(task);
				}
			});
			for (let task of tasks) {
				if (!recentlyUsedTasks.has(task.identifier)) {
					others.push(task);
				}
			}
			others = others.sort((a, b) => a._source.label.localeCompare(b._source.label));
			let sortedTasks = recent.concat(others);
			let recentlyUsed: boolean = recentlyUsedTasks.has(tasks[0].identifier);
			let otherTasks: boolean = !recentlyUsedTasks.has(tasks[tasks.length - 1].identifier);
			let hasRecentlyUsed: boolean = false;
			for (let task of sortedTasks) {
				let highlights = Filters.matchesContiguousSubString(input, task._label);
				if (!highlights) {
					continue;
				}
				if (recentlyUsed) {
					recentlyUsed = false;
					hasRecentlyUsed = true;
					entries.push(new TaskGroupEntry(this.createEntry(this.taskService, task, highlights), nls.localize('recentlyUsed', 'recently used'), false));
				} else if (!recentlyUsedTasks.has(task.identifier) && otherTasks) {
					otherTasks = false;
					entries.push(new TaskGroupEntry(this.createEntry(this.taskService, task, highlights), nls.localize('other tasks', 'other tasks'), hasRecentlyUsed));
				} else {
					entries.push(this.createEntry(this.taskService, task, highlights));
				}
			}
			return new Model.QuickOpenModel(entries, new ContributableActionProvider());
		});
	}

	protected abstract getTasks(): TPromise<Task[]>;

	protected abstract createEntry(taskService: ITaskService, task: Task, highlights: Model.IHighlight[]): TaskEntry;

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: !!input
		};
	}
}

class CustomizeTaskAction extends Action {

	private static ID = 'workbench.action.tasks.customizeTask';
	private static LABEL = nls.localize('customizeTask', "Customize Task");

	constructor(private taskService: ITaskService, private quickOpenService: IQuickOpenService, private task: Task) {
		super(CustomizeTaskAction.ID, CustomizeTaskAction.LABEL);
		this.updateClass();
	}

	public updateClass(): void {
		this.class = 'quick-open-task-configure';
	}

	public run(context: any): TPromise<any> {
		return this.taskService.customize(this.task, true).then(() => {
			this.quickOpenService.close();
		});
	}
}

export class QuickOpenActionContributor extends ActionBarContributor {

	constructor( @ITaskService private taskService: ITaskService, @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super();
	}

	public hasActions(context: any): boolean {
		let task = this.getTask(context);

		return !!task;
	}

	public getActions(context: any): IAction[] {
		let actions: Action[] = [];
		let task = this.getTask(context);
		if (task && task._source.kind === TaskSourceKind.Extension) {
			actions.push(new CustomizeTaskAction(this.taskService, this.quickOpenService, task));
		}
		return actions;
	}

	private getTask(context: any): Task {
		if (!context) {
			return undefined;
		}
		let element = context.element;
		if (element instanceof TaskEntry) {
			return element.task;
		} else if (element instanceof TaskGroupEntry) {
			return (element.getEntry() as TaskEntry).task;
		}
		return undefined;
	}
}