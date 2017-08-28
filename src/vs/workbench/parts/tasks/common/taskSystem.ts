/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminateResponse } from 'vs/base/common/processes';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { Task } from './tasks';

export enum TaskErrors {
	NotConfigured,
	RunningTask,
	NoBuildTask,
	NoTestTask,
	ConfigValidationError,
	TaskNotFound,
	NoValidTaskRunner,
	UnknownError
}

export class TaskError {
	public severity: Severity;
	public message: string;
	public code: TaskErrors;

	constructor(severity: Severity, message: string, code: TaskErrors) {
		this.severity = severity;
		this.message = message;
		this.code = code;
	}
}

export interface TelemetryEvent {
	// How the task got trigger. Is either shortcut or command
	trigger: string;

	runner: 'terminal' | 'output';

	taskKind: string;

	// The command triggered
	command: string;

	// Whether the task ran successful
	success: boolean;

	// The exit code
	exitCode?: number;
}

export namespace Triggers {
	export let shortcut: string = 'shortcut';
	export let command: string = 'command';
}

export interface ITaskSummary {
	/**
	 * Exit code of the process.
	 */
	exitCode?: number;
}

export enum TaskExecuteKind {
	Started = 1,
	Active = 2
}

export interface ITaskExecuteResult {
	kind: TaskExecuteKind;
	promise: TPromise<ITaskSummary>;
	started?: {
		restartOnFileChanges?: string;
	};
	active?: {
		same: boolean;
		background: boolean;
	};
}

export namespace TaskSystemEvents {
	export let Active: string = 'active';
	export let Inactive: string = 'inactive';
	export let Terminated: string = 'terminated';
	export let Changed: string = 'changed';
}

export enum TaskType {
	SingleRun,
	Watching
}

export interface TaskEvent {
	taskId?: string;
	taskName?: string;
	type?: TaskType;
	group?: string;
	__task?: Task;
}

export interface ITaskResolver {
	resolve(identifier: string): Task;
}

export interface TaskTerminateResponse extends TerminateResponse {
	task: Task | undefined;
}

export interface ITaskSystem extends IEventEmitter {
	run(task: Task, resolver: ITaskResolver): ITaskExecuteResult;
	isActive(): TPromise<boolean>;
	isActiveSync(): boolean;
	getActiveTasks(): Task[];
	canAutoTerminate(): boolean;
	terminate(id: string): TPromise<TaskTerminateResponse>;
	terminateAll(): TPromise<TaskTerminateResponse[]>;
	revealTask(task: Task): boolean;
}