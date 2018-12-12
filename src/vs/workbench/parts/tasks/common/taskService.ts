/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { LinkedMap } from 'vs/base/common/map';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Task, ContributedTask, CustomTask, TaskSet, TaskSorter, TaskEvent, TaskIdentifier, ConfiguringTask, TaskRunSource } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskSummary, TaskTerminateResponse, TaskSystemInfo } from 'vs/workbench/parts/tasks/common/taskSystem';
import { IStringDictionary } from 'vs/base/common/collections';

export { ITaskSummary, Task, TaskTerminateResponse };

export const ITaskService = createDecorator<ITaskService>('taskService');

export interface ITaskProvider {
	provideTasks(validTypes: IStringDictionary<boolean>): Thenable<TaskSet>;
}

export interface ProblemMatcherRunOptions {
	attachProblemMatcher?: boolean;
}

export interface CustomizationProperties {
	group?: string | { kind?: string; isDefault?: boolean; };
	problemMatcher?: string | string[];
	isBackground?: boolean;
}

export interface TaskFilter {
	version?: string;
	type?: string;
}

interface WorkspaceTaskResult {
	set: TaskSet;
	configurations: {
		byIdentifier: IStringDictionary<ConfiguringTask>;
	};
	hasErrors: boolean;
}

export interface WorkspaceFolderTaskResult extends WorkspaceTaskResult {
	workspaceFolder: IWorkspaceFolder;
}

export interface ITaskService {
	_serviceBrand: any;
	onDidStateChange: Event<TaskEvent>;
	supportsMultipleTaskExecutions: boolean;

	configureAction(): Action;
	build(): Thenable<ITaskSummary>;
	runTest(): Thenable<ITaskSummary>;
	run(task: Task, options?: ProblemMatcherRunOptions): Thenable<ITaskSummary>;
	inTerminal(): boolean;
	isActive(): Thenable<boolean>;
	getActiveTasks(): Thenable<Task[]>;
	restart(task: Task): void;
	terminate(task: Task): Thenable<TaskTerminateResponse>;
	terminateAll(): Thenable<TaskTerminateResponse[]>;
	tasks(filter?: TaskFilter): Thenable<Task[]>;
	getWorkspaceTasks(runSource?: TaskRunSource): Thenable<Map<string, WorkspaceFolderTaskResult>>;
	/**
	 * @param alias The task's name, label or defined identifier.
	 */
	getTask(workspaceFolder: IWorkspaceFolder | string, alias: string | TaskIdentifier, compareId?: boolean): Thenable<Task>;
	getTasksForGroup(group: string): Thenable<Task[]>;
	getRecentlyUsedTasks(): LinkedMap<string, string>;
	createSorter(): TaskSorter;

	needsFolderQualification();
	canCustomize(task: ContributedTask | CustomTask): boolean;
	customize(task: ContributedTask | CustomTask, properties?: {}, openConfig?: boolean): Thenable<void>;
	openConfig(task: CustomTask | undefined): Thenable<void>;

	registerTaskProvider(taskProvider: ITaskProvider): IDisposable;

	registerTaskSystem(scheme: string, taskSystemInfo: TaskSystemInfo): void;
}
