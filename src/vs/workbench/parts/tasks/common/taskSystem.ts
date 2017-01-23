/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminateResponse } from 'vs/base/common/processes';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import * as Types from 'vs/base/common/types';

import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';

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

	// The command triggered
	command: string;

	// Whether the task ran successful
	success: boolean;
}

export namespace Triggers {
	export let shortcut: string = 'shortcut';
	export let command: string = 'command';
}

export enum ShowOutput {
	Always,
	Silent,
	Never
}

export namespace ShowOutput {
	export function fromString(value: string): ShowOutput {
		value = value.toLowerCase();
		if (value === 'always') {
			return ShowOutput.Always;
		} else if (value === 'silent') {
			return ShowOutput.Silent;
		} else if (value === 'never') {
			return ShowOutput.Never;
		} else {
			return undefined;
		}
	}
}

export interface CommandOptions {
	/**
	 * The current working directory of the executed program or shell.
	 * If omitted VSCode's current workspace root is used.
	 */
	cwd?: string;

	/**
	 * The environment of the executed program or shell. If omitted
	 * the parent process' environment is used.
	 */
	env?: { [key: string]: string; };
}

export interface ShellConfiguration {
	/**
	 * The shell executable.
	 */
	executable: string;
	/**
	 * The arguments to be passed to the shell executable.
	 */
	args?: string[];
}

export namespace ShellConfiguration {
	export function is(value: any): value is ShellConfiguration {
		let candidate: ShellConfiguration = value;
		return candidate && Types.isString(candidate.executable) && (candidate.args === void 0 || Types.isStringArray(candidate.args));
	}
}

export interface CommandConfiguration {
	/**
	 * The command to execute
	 */
	name?: string;

	/**
	 * Whether the command is a shell command or not
	 */
	isShellCommand?: boolean | ShellConfiguration;

	/**
	 * Additional command options.
	 */
	options?: CommandOptions;

	/**
	 * Command arguments.
	 */
	args?: string[];

	/**
	 * The task selector if needed.
	 */
	taskSelector?: string;

	/**
	 * Controls whether the executed command is printed to the output windows as well.
	 */
	echo?: boolean;
}

/**
 * A task description
 */
export interface TaskDescription {

	/**
	 * The task's internal id
	 */
	id: string;

	/**
	 * The task's name
	 */
	name: string;

	/**
	 * The command configuration
	 */
	command: CommandConfiguration;

	/**
	 * Suppresses the task name when calling the task using the task runner.
	 */
	suppressTaskName?: boolean;

	/**
	 * Additional arguments passed to the command when this target is
	 * invoked.
	 */
	args?: string[];

	/**
	 * Whether the task is a background task or not.
	 */
	isBackground?: boolean;

	/**
	 * Whether the task should prompt on close for confirmation if running.
	 */
	promptOnClose?: boolean;

	/**
	 * Controls whether the output of the running tasks is shown or not. Default
	 * value is "always".
	 */
	showOutput: ShowOutput;

	/**
	 * The problem watchers to use for this task
	 */
	problemMatchers?: ProblemMatcher[];
}

/**
 * Describs the settings of a task runner
 */
export interface TaskRunnerConfiguration {
	/**
	 * The inferred build tasks
	 */
	buildTasks: string[];

	/**
	 * The inferred test tasks;
	 */
	testTasks: string[];

	/**
	 * The configured tasks
	 */
	tasks?: { [id: string]: TaskDescription; };
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
}

export enum TaskType {
	SingleRun,
	Watching
}

export interface TaskEvent {
	taskId?: string;
	taskName?: string;
	type?: TaskType;
}

export interface ITaskSystem extends IEventEmitter {
	build(): ITaskExecuteResult;
	rebuild(): ITaskExecuteResult;
	clean(): ITaskExecuteResult;
	runTest(): ITaskExecuteResult;
	run(taskIdentifier: string): ITaskExecuteResult;
	isActive(): TPromise<boolean>;
	isActiveSync(): boolean;
	canAutoTerminate(): boolean;
	terminate(): TPromise<TerminateResponse>;
	tasks(): TPromise<TaskDescription[]>;
}

/**
 * Build configuration settings shared between program and
 * service build systems.
 */
export interface TaskConfiguration {
	/**
	 * The build system to use. If omitted program is used.
	 */
	_runner?: string;
}