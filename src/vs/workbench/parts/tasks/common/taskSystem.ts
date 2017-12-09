/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminateResponse } from 'vs/base/common/processes';
import Event from 'vs/base/common/event';

import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import { Task, TaskEvent } from './tasks';

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

/* __GDPR__FRAGMENT__
	"TelemetryEvent" : {
		"trigger" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"runner": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"taskKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		"exitCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	}
*/
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

export interface ITaskResolver {
	resolve(workspaceFolder: IWorkspaceFolder, identifier: string): Task;
}

export interface TaskTerminateResponse extends TerminateResponse {
	task: Task | undefined;
}

export interface ITaskSystem {
	onDidStateChange: Event<TaskEvent>;
	run(task: Task, resolver: ITaskResolver): ITaskExecuteResult;
	isActive(): TPromise<boolean>;
	isActiveSync(): boolean;
	getActiveTasks(): Task[];
	canAutoTerminate(): boolean;
	terminate(task: Task): TPromise<TaskTerminateResponse>;
	terminateAll(): TPromise<TaskTerminateResponse[]>;
	revealTask(task: Task): boolean;
}