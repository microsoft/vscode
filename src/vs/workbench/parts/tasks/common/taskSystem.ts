/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminateResponse } from 'vs/base/common/processes';
import { Event } from 'vs/base/common/event';
import { Platform } from 'vs/base/common/platform';

import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

import { Task, TaskEvent, KeyedTaskIdentifier } from './tasks';
import { IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';

export const enum TaskErrors {
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
		"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
		"exitCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
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

export const enum TaskExecuteKind {
	Started = 1,
	Active = 2
}

export interface ITaskExecuteResult {
	kind: TaskExecuteKind;
	promise: TPromise<ITaskSummary>;
	task: Task;
	started?: {
		restartOnFileChanges?: string;
	};
	active?: {
		same: boolean;
		background: boolean;
	};
}

export class PreparedTask {
	readonly task: Task;
	readonly resolver: ITaskResolver;
	readonly trigger: string;
	resolvedVariables?: Map<string, string>;
	systemInfo?: TaskSystemInfo;
	workspaceFolder?: IWorkspaceFolder;
	shellLaunchConfig?: IShellLaunchConfig;

	constructor(task: Task, resolver: ITaskResolver, trigger: string) {
		this.task = task;
		this.resolver = resolver;
		this.trigger = trigger;
	}

	public isPrepared(): boolean {
		return this.trigger && this.resolvedVariables && this.workspaceFolder && (this.shellLaunchConfig !== undefined);
	}

	public getPreparedTask(): { task: Task, resolver: ITaskResolver, trigger: string, resolvedVariables: Map<string, string>, systemInfo: TaskSystemInfo, workspaceFolder: IWorkspaceFolder, shellLaunchConfig: IShellLaunchConfig } {
		if (this.isPrepared()) {
			return { task: this.task, resolver: this.resolver, trigger: this.trigger, resolvedVariables: this.resolvedVariables, systemInfo: this.systemInfo, workspaceFolder: this.workspaceFolder, shellLaunchConfig: this.shellLaunchConfig };
		} else {
			throw new Error('PreparedTask was not checked.');
		}
	}
}

export interface ITaskResolver {
	resolve(workspaceFolder: IWorkspaceFolder, identifier: string | KeyedTaskIdentifier): Task;
}

export interface TaskTerminateResponse extends TerminateResponse {
	task: Task | undefined;
}

export interface TaskSystemInfo {
	platform: Platform;
	context: any;
	uriProvider: (this: void, path: string) => URI;
	resolveVariables(workspaceFolder: IWorkspaceFolder, variables: Set<string>): TPromise<Map<string, string>>;
}

export interface TaskSystemInfoResovler {
	(workspaceFolder: IWorkspaceFolder): TaskSystemInfo;
}

export interface ITaskSystem {
	onDidStateChange: Event<TaskEvent>;
	run(task: Task, resolver: ITaskResolver): ITaskExecuteResult;
	rerun(): ITaskExecuteResult | undefined;
	isActive(): TPromise<boolean>;
	isActiveSync(): boolean;
	getActiveTasks(): Task[];
	canAutoTerminate(): boolean;
	terminate(task: Task): TPromise<TaskTerminateResponse>;
	terminateAll(): TPromise<TaskTerminateResponse[]>;
	revealTask(task: Task): boolean;
}