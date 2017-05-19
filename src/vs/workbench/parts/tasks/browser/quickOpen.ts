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

import { Task, TaskSourceKind } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';

export class TaskEntry extends Model.QuickOpenEntry {

	constructor(protected taskService: ITaskService, protected task: Task, highlights: Model.IHighlight[] = []) {
		super(highlights);
		this.task = task;
	}

	public getLabel(): string {
		return this.task.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, tasks", this.getLabel());
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
		protected taskService: ITaskService,
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
			tasks = tasks.sort((a, b) => {
				let aKind = a._source.kind;
				let bKind = b._source.kind;
				if (aKind === bKind) {
					return a.name.localeCompare(b.name);
				}
				if (aKind === TaskSourceKind.Workspace) {
					return -1;
				} else {
					return +1;
				}
			});
			let hasWorkspace: boolean = tasks[0]._source.kind === TaskSourceKind.Workspace;
			let hasExtension: boolean = tasks[tasks.length - 1]._source.kind === TaskSourceKind.Extension;
			let groupWorkspace = hasWorkspace && hasExtension;
			let groupExtension = groupWorkspace;
			let hadWorkspace = false;
			for (let task of tasks) {
				let highlights = Filters.matchesContiguousSubString(input, task.name);
				if (!highlights) {
					continue;
				}
				if (task._source.kind === TaskSourceKind.Workspace && groupWorkspace) {
					groupWorkspace = false;
					hadWorkspace = true;
					entries.push(new TaskGroupEntry(this.createEntry(this.taskService, task, highlights), nls.localize('workspace', 'From Workspace'), false));
				} else if (task._source.kind === TaskSourceKind.Extension && groupExtension) {
					groupExtension = false;
					entries.push(new TaskGroupEntry(this.createEntry(this.taskService, task, highlights), nls.localize('extension', 'From Extensions'), hadWorkspace));
				} else {
					entries.push(this.createEntry(this.taskService, task, highlights));
				}
			}
			return new Model.QuickOpenModel(entries);
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