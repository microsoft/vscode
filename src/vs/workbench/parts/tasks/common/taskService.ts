/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { LinkedMap } from 'vs/base/common/map';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { Task, ContributedTask, CustomTask, TaskSet, TaskSorter, TaskEvent } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskSummary, TaskTerminateResponse } from 'vs/workbench/parts/tasks/common/taskSystem';

export { ITaskSummary, Task, TaskTerminateResponse };

export const ITaskService = createDecorator<ITaskService>('taskService');

export interface ITaskProvider {
	provideTasks(): TPromise<TaskSet>;
}

export interface RunOptions {
	attachProblemMatcher?: boolean;
}

export interface CustomizationProperties {
	group?: string | { kind?: string; isDefault?: boolean; };
	problemMatcher?: string | string[];
	isBackground?: boolean;
}

export interface ITaskService {
	_serviceBrand: any;
	onDidStateChange: Event<TaskEvent>;
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
	tasks(): TPromise<Task[]>;
	/**
	 * @param alias The task's name, label or defined identifier.
	 */
	getTask(workspaceFolder: IWorkspaceFolder | string, alias: string, compareId?: boolean): TPromise<Task>;
	getTasksForGroup(group: string): TPromise<Task[]>;
	getRecentlyUsedTasks(): LinkedMap<string, string>;
	createSorter(): TaskSorter;

	needsFolderQualification();
	canCustomize(task: ContributedTask | CustomTask): boolean;
	customize(task: ContributedTask | CustomTask, properties?: {}, openConfig?: boolean): TPromise<void>;
	openConfig(task: CustomTask): TPromise<void>;

	registerTaskProvider(handle: number, taskProvider: ITaskProvider): void;
	unregisterTaskProvider(handle: number): boolean;
}