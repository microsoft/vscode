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
import * as Objects from 'vs/base/common/objects';

import Quickopen = require('vs/workbench/browser/quickopen');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { ProblemMatcherRegistry, NamedProblemMatcher } from 'vs/platform/markers/common/problemMatcher';

import { Task, TaskSourceKind } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { ActionBarContributor, ContributableActionProvider } from 'vs/workbench/browser/actions';

interface ProblemMatcherPickEntry extends IPickOpenEntry {
	matcher: NamedProblemMatcher;
	learnMore?: boolean;
}

export class TaskEntry extends Model.QuickOpenEntry {

	constructor(protected taskService: ITaskService, protected quickOpenService: IQuickOpenService, protected _task: Task, highlights: Model.IHighlight[] = []) {
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

	protected attachProblemMatcher(task: Task): TPromise<Task> {
		let entries: ProblemMatcherPickEntry[] = [];
		for (let key of ProblemMatcherRegistry.keys()) {
			let matcher = ProblemMatcherRegistry.get(key);
			if (matcher.name === matcher.label) {
				entries.push({ label: matcher.name, matcher: matcher });
			} else {
				entries.push({
					label: matcher.label,
					description: `$${matcher.name}`,
					matcher: matcher
				});
			}
		}
		if (entries.length > 0) {
			entries = entries.sort((a, b) => a.label.localeCompare(b.label));
			entries[0].separator = { border: true };
			entries.unshift(
				{ label: nls.localize('continueWithout', 'Continue without scanning the build output'), matcher: undefined },
				{ label: nls.localize('learnMoreAbout', 'Learn more about scanning the build output'), matcher: undefined, learnMore: true }
			);
			return this.quickOpenService.pick(entries, {
				placeHolder: nls.localize('selectProblemMatcher', 'Select for which kind of errors and warnings to scan the build output')
			}).then((selected) => {
				if (selected) {
					if (selected.learnMore) {
						this.taskService.openDocumentation();
						return undefined;
					} else if (selected.matcher) {
						let newTask = Objects.deepClone(task);
						let matcherReference = `$${selected.matcher.name}`;
						newTask.problemMatchers = [matcherReference];
						this.taskService.customize(task, { problemMatcher: [matcherReference] }, true);
						return newTask;
					} else {
						return task;
					}
				} else {
					return task;
				}
			});
		}
		return TPromise.as(task);
	}

	protected doRun(task: Task): boolean {
		this.taskService.run(task);
		if (task.command.presentation.focus) {
			this.quickOpenService.close();
			return false;
		}
		return true;
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
			let configured: Task[] = [];
			let detected: Task[] = [];
			let taskMap: IStringDictionary<Task> = Object.create(null);
			tasks.forEach(task => taskMap[Task.getKey(task)] = task);
			recentlyUsedTasks.keys().forEach(key => {
				let task = taskMap[key];
				if (task) {
					recent.push(task);
				}
			});
			for (let task of tasks) {
				if (!recentlyUsedTasks.has(Task.getKey(task))) {
					if (task._source.kind === TaskSourceKind.Workspace) {
						configured.push(task);
					} else {
						detected.push(task);
					}
				}
			}
			let hasRecentlyUsed: boolean = recent.length > 0;
			this.fillEntries(entries, input, recent, nls.localize('recentlyUsed', 'recently used tasks'));
			configured = configured.sort((a, b) => a._label.localeCompare(b._label));
			let hasConfigured = configured.length > 0;
			this.fillEntries(entries, input, configured, nls.localize('configured', 'custom tasks'), hasRecentlyUsed);
			detected = detected.sort((a, b) => a._label.localeCompare(b._label));
			this.fillEntries(entries, input, detected, nls.localize('detected', 'detected tasks'), hasRecentlyUsed || hasConfigured);
			return new Model.QuickOpenModel(entries, new ContributableActionProvider());
		});
	}

	private fillEntries(entries: Model.QuickOpenEntry[], input: string, tasks: Task[], groupLabel: string, withBorder: boolean = false) {
		let first = true;
		for (let task of tasks) {
			let highlights = Filters.matchesContiguousSubString(input, task._label);
			if (!highlights) {
				continue;
			}
			if (first) {
				first = false;
				entries.push(new TaskGroupEntry(this.createEntry(task, highlights), groupLabel, withBorder));
			} else {
				entries.push(this.createEntry(task, highlights));
			}
		}
	}

	protected abstract getTasks(): TPromise<Task[]>;

	protected abstract createEntry(task: Task, highlights: Model.IHighlight[]): TaskEntry;

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
		return this.taskService.customize(this.task, undefined, true).then(() => {
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