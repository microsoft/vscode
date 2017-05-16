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

import { Task } from 'vs/workbench/parts/tasks/common/tasks';
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

export abstract class QuickOpenHandler extends Quickopen.QuickOpenHandler {

	constructor(
		@IQuickOpenService protected quickOpenService: IQuickOpenService,
		@ITaskService protected taskService: ITaskService
	) {
		super();

		this.quickOpenService = quickOpenService;
		this.taskService = taskService;
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		return this.getTasks().then(tasks => tasks
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(task => ({ task: task, highlights: Filters.matchesContiguousSubString(input, task.name) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ task, highlights }) => this.createEntry(this.taskService, task, highlights))
			, _ => []).then(e => new Model.QuickOpenModel(e));
	}

	protected abstract getTasks(): TPromise<Task[]>;

	protected abstract createEntry(taskService: ITaskService, task: Task, highlights: Model.IHighlight[]): TaskEntry;

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
}