/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { TerminateResponse } from 'vs/base/common/processes';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Task, TaskSet } from 'vs/workbench/parts/tasks/common/tasks';
import { ITaskSummary, TaskEvent, TaskType } from 'vs/workbench/parts/tasks/common/taskSystem';

export { ITaskSummary, Task, TaskEvent, TaskType };

export const ITaskService = createDecorator<ITaskService>('taskService');

export namespace TaskServiceEvents {
	export let Active: string = 'active';
	export let Inactive: string = 'inactive';
	export let ConfigChanged: string = 'configChanged';
	export let Terminated: string = 'terminated';
}

export interface ITaskProvider {
	provideTasks(): TPromise<TaskSet>;
}

export interface ITaskService extends IEventEmitter {
	_serviceBrand: any;
	configureAction(): Action;
	build(): TPromise<ITaskSummary>;
	rebuild(): TPromise<ITaskSummary>;
	clean(): TPromise<ITaskSummary>;
	runTest(): TPromise<ITaskSummary>;
	run(task: string | Task): TPromise<ITaskSummary>;
	inTerminal(): boolean;
	isActive(): TPromise<boolean>;
	getActiveTasks(): TPromise<Task[]>;
	restart(task: string | Task): void;
	terminate(task: string | Task): TPromise<TerminateResponse>;
	terminateAll(): TPromise<TerminateResponse>;
	tasks(): TPromise<Task[]>;

	registerTaskProvider(handle: number, taskProvider: ITaskProvider): void;
	unregisterTaskProvider(handle: number): boolean;
}