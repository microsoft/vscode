/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import Severity from '../../../../base/common/severity.js';
import { TerminateResponse } from '../../../../base/common/processes.js';
import { Event } from '../../../../base/common/event.js';
import { Platform } from '../../../../base/common/platform.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { Task, ITaskEvent, KeyedTaskIdentifier } from './tasks.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';

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

export namespace Triggers {
	export const shortcut: string = 'shortcut';
	export const command: string = 'command';
	export const reconnect: string = 'reconnect';
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
	promise: Promise<ITaskSummary>;
	task: Task;
	started?: {
		restartOnFileChanges?: string;
	};
	active?: {
		same: boolean;
		background: boolean;
	};
}

export interface ITaskResolver {
	resolve(uri: URI | string, identifier: string | KeyedTaskIdentifier | undefined): Promise<Task | undefined>;
}

export interface ITaskTerminateResponse extends TerminateResponse {
	task: Task | undefined;
}

export interface IResolveSet {
	process?: {
		name: string;
		cwd?: string;
		path?: string;
	};
	variables: Set<string>;
}

export interface IResolvedVariables {
	process?: string;
	variables: Map<string, string>;
}

export interface ITaskSystemInfo {
	platform: Platform;
	context: any;
	uriProvider: (this: void, path: string) => URI;
	resolveVariables(workspaceFolder: IWorkspaceFolder, toResolve: IResolveSet, target: ConfigurationTarget): Promise<IResolvedVariables | undefined>;
	findExecutable(command: string, cwd?: string, paths?: string[]): Promise<string | undefined>;
}

export interface ITaskSystemInfoResolver {
	(workspaceFolder: IWorkspaceFolder | undefined): ITaskSystemInfo | undefined;
}

export interface ITaskSystem {
	onDidStateChange: Event<ITaskEvent>;
	reconnect(task: Task, resolver: ITaskResolver): ITaskExecuteResult;
	run(task: Task, resolver: ITaskResolver): ITaskExecuteResult;
	rerun(): ITaskExecuteResult | undefined;
	isActive(): Promise<boolean>;
	isActiveSync(): boolean;
	getActiveTasks(): Task[];
	getLastInstance(task: Task): Task | undefined;
	getBusyTasks(): Task[];
	canAutoTerminate(): boolean;
	terminate(task: Task): Promise<ITaskTerminateResponse>;
	terminateAll(): Promise<ITaskTerminateResponse[]>;
	revealTask(task: Task): boolean;
	customExecutionComplete(task: Task, result: number): Promise<void>;
	isTaskVisible(task: Task): boolean;
}
