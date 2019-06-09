/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as Filters from 'vs/base/common/filters';
import { Action, IAction } from 'vs/base/common/actions';
import { IStringDictionary } from 'vs/base/common/collections';

import * as Quickopen from 'vs/workbench/browser/quickopen';
import * as QuickOpen from 'vs/base/parts/quickopen/common/quickOpen';
import * as Model from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

import { CustomTask, ContributedTask } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, ProblemMatcherRunOptions } from 'vs/workbench/contrib/tasks/common/taskService';
import { ActionBarContributor, ContributableActionProvider } from 'vs/workbench/browser/actions';
import { CancellationToken } from 'vs/base/common/cancellation';

export class TaskEntry extends Model.QuickOpenEntry {

	constructor(protected quickOpenService: IQuickOpenService, protected taskService: ITaskService, protected _task: CustomTask | ContributedTask, highlights: Model.IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.task._label;
	}

	public getDescription(): string | undefined {
		if (!this.taskService.needsFolderQualification()) {
			return undefined;
		}
		let workspaceFolder = this.task.getWorkspaceFolder();
		if (!workspaceFolder) {
			return undefined;
		}
		return `${workspaceFolder.name}`;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, tasks", this.getLabel());
	}

	public get task(): CustomTask | ContributedTask {
		return this._task;
	}

	protected doRun(task: CustomTask | ContributedTask, options?: ProblemMatcherRunOptions): boolean {
		this.taskService.run(task, options).then(undefined, reason => {
			// eat the error, it has already been surfaced to the user and we don't care about it here
		});
		if (!task.command || (task.command.presentation && task.command.presentation.focus)) {
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

	private tasks?: Promise<Array<CustomTask | ContributedTask>>;

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

	public getResults(input: string, token: CancellationToken): Promise<Model.QuickOpenModel | null> {
		if (!this.tasks) {
			return Promise.resolve(null);
		}
		return this.tasks.then((tasks) => {
			let entries: Model.QuickOpenEntry[] = [];
			if (tasks.length === 0 || token.isCancellationRequested) {
				return new Model.QuickOpenModel(entries);
			}
			let recentlyUsedTasks = this.taskService.getRecentlyUsedTasks();
			let recent: Array<CustomTask | ContributedTask> = [];
			let configured: CustomTask[] = [];
			let detected: ContributedTask[] = [];
			let taskMap: IStringDictionary<CustomTask | ContributedTask> = Object.create(null);
			tasks.forEach(task => {
				let key = task.getRecentlyUsedKey();
				if (key) {
					taskMap[key] = task;
				}
			});
			recentlyUsedTasks.keys().forEach(key => {
				let task = taskMap[key];
				if (task) {
					recent.push(task);
				}
			});
			for (let task of tasks) {
				let key = task.getRecentlyUsedKey();
				if (!key || !recentlyUsedTasks.has(key)) {
					if (CustomTask.is(task)) {
						configured.push(task);
					} else {
						detected.push(task);
					}
				}
			}
			const sorter = this.taskService.createSorter();
			let hasRecentlyUsed: boolean = recent.length > 0;
			this.fillEntries(entries, input, recent, nls.localize('recentlyUsed', 'recently used tasks'));
			configured = configured.sort((a, b) => sorter.compare(a, b));
			let hasConfigured = configured.length > 0;
			this.fillEntries(entries, input, configured, nls.localize('configured', 'configured tasks'), hasRecentlyUsed);
			detected = detected.sort((a, b) => sorter.compare(a, b));
			this.fillEntries(entries, input, detected, nls.localize('detected', 'detected tasks'), hasRecentlyUsed || hasConfigured);
			return new Model.QuickOpenModel(entries, new ContributableActionProvider());
		});
	}

	private fillEntries(entries: Model.QuickOpenEntry[], input: string, tasks: Array<CustomTask | ContributedTask>, groupLabel: string, withBorder: boolean = false) {
		let first = true;
		for (let task of tasks) {
			let highlights = Filters.matchesFuzzy(input, task._label);
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

	protected abstract getTasks(): Promise<Array<CustomTask | ContributedTask>>;

	protected abstract createEntry(task: CustomTask | ContributedTask, highlights: Model.IHighlight[]): TaskEntry;

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: !!input
		};
	}
}

class CustomizeTaskAction extends Action {

	private static readonly ID = 'workbench.action.tasks.customizeTask';
	private static readonly LABEL = nls.localize('customizeTask', "Configure Task");

	constructor(private taskService: ITaskService, private quickOpenService: IQuickOpenService) {
		super(CustomizeTaskAction.ID, CustomizeTaskAction.LABEL);
		this.updateClass();
	}

	public updateClass(): void {
		this.class = 'quick-open-task-configure';
	}

	public run(element: any): Promise<any> {
		let task = this.getTask(element);
		if (ContributedTask.is(task)) {
			return this.taskService.customize(task, undefined, true).then(() => {
				this.quickOpenService.close();
			});
		} else {
			return this.taskService.openConfig(task).then(() => {
				this.quickOpenService.close();
			});
		}
	}

	private getTask(element: any): CustomTask | ContributedTask | undefined {
		if (element instanceof TaskEntry) {
			return element.task;
		} else if (element instanceof TaskGroupEntry) {
			return (element.getEntry() as TaskEntry).task;
		}
		return undefined;
	}
}

export class QuickOpenActionContributor extends ActionBarContributor {

	private action: CustomizeTaskAction;

	constructor(@ITaskService taskService: ITaskService, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super();
		this.action = new CustomizeTaskAction(taskService, quickOpenService);
	}

	public hasActions(context: any): boolean {
		let task = this.getTask(context);

		return !!task;
	}

	public getActions(context: any): ReadonlyArray<IAction> {
		let actions: Action[] = [];
		let task = this.getTask(context);
		if (task && ContributedTask.is(task) || CustomTask.is(task)) {
			actions.push(this.action);
		}
		return actions;
	}

	private getTask(context: any): CustomTask | ContributedTask | undefined {
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