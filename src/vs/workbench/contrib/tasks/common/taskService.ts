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
import { Task, ContributedTask, CustomTask, TaskSet, TaskSorter, TaskEvent, TaskIdentifier, ConfiguringTask, TaskRunSource } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskSummary, TaskTerminateResponse, TaskSystemInfo } from 'vs/workbench/contrib/tasks/common/taskSystem';
import { IStringDictionary } from 'vs/base/common/collections';

export { ITaskSummary, Task, TaskTerminateResponse };

export const ITaskService = createDecorator<ITaskService>('taskService');

export interface ITaskProvider {
	provideTasks(validTypes: IStringDictionary<boolean>): Promise<TaskSet>;
	resolveTask(task: ConfiguringTask): Promise<ContributedTask | undefined>;
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
	set: TaskSet | undefined;
	configurations: {
		byIdentifier: IStringDictionary<ConfiguringTask>;
	} | undefined;
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
	build(): Promise<ITaskSummary>;
	runTest(): Promise<ITaskSummary>;
	run(task: Task | undefined, options?: ProblemMatcherRunOptions): Promise<ITaskSummary>;
	inTerminal(): boolean;
	isActive(): Promise<boolean>;
	getActiveTasks(): Promise<Task[]>;
	restart(task: Task): void;
	terminate(task: Task): Promise<TaskTerminateResponse>;
	terminateAll(): Promise<TaskTerminateResponse[]>;
	tasks(filter?: TaskFilter): Promise<Task[]>;
	getWorkspaceTasks(runSource?: TaskRunSource): Promise<Map<string, WorkspaceFolderTaskResult>>;
	/**
	 * @param alias The task's name, label or defined identifier.
	 */
	getTask(workspaceFolder: IWorkspaceFolder | string, alias: string | TaskIdentifier, compareId?: boolean): Promise<Task | undefined>;
	getTasksForGroup(group: string): Promise<Task[]>;
	getRecentlyUsedTasks(): LinkedMap<string, string>;
	createSorter(): TaskSorter;

	needsFolderQualification(): boolean;
	canCustomize(task: ContributedTask | CustomTask): boolean;
	customize(task: ContributedTask | CustomTask, properties?: {}, openConfig?: boolean): Promise<void>;
	openConfig(task: CustomTask | undefined): Promise<void>;

	registerTaskProvider(taskProvider: ITaskProvider, type: string): IDisposable;

	registerTaskSystem(scheme: string, taskSystemInfo: TaskSystemInfo): void;

	extensionCallbackTaskComplete(task: Task, result: number | undefined): Promise<void>;
}
