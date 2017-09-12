/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { LinkedMap } from 'vs/base/common/map';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Task, ContributedTask, CustomTask, TaskSet } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskSummary, TaskEvent, TaskType, TaskTerminateResponse } from 'vs/workbench/parts/tasks/common/taskSystem';

export { ITaskSummary, Task, TaskEvent, TaskType, TaskTerminateResponse };

export const ITaskService = createDecorator<ITaskService>('taskService');

export namespace TaskServiceEvents {
	export let Active: string = 'active';
	export let Inactive: string = 'inactive';
	export let ConfigChanged: string = 'configChanged';
	export let Terminated: string = 'terminated';
	export let Changed: string = 'changed';
}

export interface ITaskProvider {
	provideTasks(): TPromise<TaskSet>;
}

export interface RunOptions {
	attachProblemMatcher?: boolean;
}

export interface CustomizationProperties {
	group?: string | { kind?: string; isDefault?: boolean; };
	problemMatcher?: string | string[];
}

export interface ITaskService extends IEventEmitter {
	_serviceBrand: any;
	configureAction(): Action;
	build(): TPromise<ITaskSummary>;
	rebuild(): TPromise<ITaskSummary>;
	clean(): TPromise<ITaskSummary>;
	runTest(): TPromise<ITaskSummary>;
	run(task: string | Task, options?: RunOptions): TPromise<ITaskSummary>;
	inTerminal(): boolean;
	isActive(): TPromise<boolean>;
	getActiveTasks(): TPromise<Task[]>;
	restart(task: string | Task): void;
	terminate(task: string | Task): TPromise<TaskTerminateResponse>;
	terminateAll(): TPromise<TaskTerminateResponse[]>;
	tasks(): TPromise<Task[]>;
	/**
	 * @param identifier The task's name, label or defined identifier.
	 */
	getTask(identifier: string): TPromise<Task>;
	getTasksForGroup(group: string): TPromise<Task[]>;
	getRecentlyUsedTasks(): LinkedMap<string, string>;

	canCustomize(): boolean;
	customize(task: ContributedTask | CustomTask, properties?: {}, openConfig?: boolean): TPromise<void>;
	openConfig(task: CustomTask): TPromise<void>;

	registerTaskProvider(handle: number, taskProvider: ITaskProvider): void;
	unregisterTaskProvider(handle: number): boolean;
}