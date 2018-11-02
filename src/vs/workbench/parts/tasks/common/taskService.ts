/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { LinkedMap } from 'vs/base/common/map';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Task, ContributedTask, CustomTask, TaskSet, TaskSorter, TaskEvent, TaskIdentifier } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskSummary, TaskTerminateResponse, TaskSystemInfo } from 'vs/workbench/parts/tasks/common/taskSystem';
import { IStringDictionary } from 'vs/base/common/collections';

export { ITaskSummary, Task, TaskTerminateResponse };

export const ITaskService = createDecorator<ITaskService>('taskService');

export interface ITaskProvider {
	provideTasks(validTypes: IStringDictionary<boolean>): TPromise<TaskSet>;
}

export interface RunOptions {
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

export interface ITaskService {
	_serviceBrand: any;
	onDidStateChange: Event<TaskEvent>;
	supportsMultipleTaskExecutions: boolean;

	configureAction(): Action;
	build(): TPromise<ITaskSummary>;
	runTest(): TPromise<ITaskSummary>;
	run(task: Task, options?: RunOptions): TPromise<ITaskSummary>;
	inTerminal(): boolean;
	isActive(): TPromise<boolean>;
	getActiveTasks(): TPromise<Task[]>;
	restart(task: Task): void;
	terminate(task: Task): TPromise<TaskTerminateResponse>;
	terminateAll(): TPromise<TaskTerminateResponse[]>;
	tasks(filter?: TaskFilter): TPromise<Task[]>;
	/**
	 * @param alias The task's name, label or defined identifier.
	 */
	getTask(workspaceFolder: IWorkspaceFolder | string, alias: string | TaskIdentifier, compareId?: boolean): TPromise<Task>;
	getTasksForGroup(group: string): TPromise<Task[]>;
	getRecentlyUsedTasks(): LinkedMap<string, string>;
	createSorter(): TaskSorter;

	needsFolderQualification();
	canCustomize(task: ContributedTask | CustomTask): boolean;
	customize(task: ContributedTask | CustomTask, properties?: {}, openConfig?: boolean): TPromise<void>;
	openConfig(task: CustomTask): TPromise<void>;

	registerTaskProvider(handle: number, taskProvider: ITaskProvider): void;
	unregisterTaskProvider(handle: number): boolean;

	registerTaskSystem(scheme: string, taskSystemInfo: TaskSystemInfo): void;
}
