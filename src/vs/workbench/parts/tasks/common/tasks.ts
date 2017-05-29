/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import * as Types from 'vs/base/common/types';

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';

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

export interface CommandOptions {

	/**
	 * The shell to use if the task is a shell command.
	 */
	shell?: ShellConfiguration;

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

export enum RevealKind {
	/**
	 * Always brings the terminal to front if the task is executed.
	 */
	Always = 1,

	/**
	 * Only brings the terminal to front if a problem is detected executing the task
	 * (e.g. the task couldn't be started because).
	 */
	Silent = 2,

	/**
	 * The terminal never comes to front when the task is executed.
	 */
	Never = 3
}

export namespace RevealKind {
	export function fromString(value: string): RevealKind {
		switch (value.toLowerCase()) {
			case 'always':
				return RevealKind.Always;
			case 'silent':
				return RevealKind.Silent;
			case 'never':
				return RevealKind.Never;
			default:
				return RevealKind.Always;
		}
	}
}

export interface TerminalBehavior {
	/**
	 * Controls whether the terminal executing a task is brought to front or not.
	 * Defaults to `RevealKind.Always`.
	 */
	reveal: RevealKind;

	/**
	 * Controls whether the executed command is printed to the output window or terminal as well.
	 */
	echo: boolean;
}

export enum CommandType {
	Shell = 1,
	Process = 2
}

export namespace CommandType {
	export function fromString(value: string): CommandType {
		switch (value.toLowerCase()) {
			case 'shell':
				return CommandType.Shell;
			case 'process':
				return CommandType.Process;
			default:
				return CommandType.Process;
		}
	}
}

export interface CommandConfiguration {

	/**
	 * The task type
	 */
	type: CommandType;

	/**
	 * The command to execute
	 */
	name: string;

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
	 * Describes how the terminal is supposed to behave.
	 */
	terminal: TerminalBehavior;
}

export namespace TaskGroup {
	export const Clean: 'clean' = 'clean';

	export const Build: 'build' = 'build';

	export const RebuildAll: 'rebuildAll' = 'rebuildAll';

	export const Test: 'test' = 'test';

	export function is(value: string): value is string {
		return value === Clean || value === Build || value === RebuildAll || value === Test;
	}
}

export type TaskGroup = 'clean' | 'build' | 'rebuildAll' | 'test';

export enum TaskSourceKind {
	Workspace = 1,
	Extension = 2,
	Generic = 3
}

export interface TaskSource {
	kind: TaskSourceKind;
	label: string;
	detail?: string;
}

/**
 * A task description
 */
export interface Task {

	/**
	 * The task's internal id
	 */
	_id: string;

	/**
	 * Indicated the source of the task (e.g tasks.json or extension)
	 */
	_source: TaskSource;

	/**
	 * The task's name
	 */
	name: string;

	/**
	 * The task's identifier.
	 */
	identifier: string;

	/**
	 * the task's group;
	 */
	group?: string;

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
	 * The other tasks this task depends on.
	 */
	dependsOn?: string[];

	/**
	 * The problem watchers to use for this task
	 */
	problemMatchers?: (string | ProblemMatcher)[];
}

export enum ExecutionEngine {
	Unknown = 0,
	Terminal = 1,
	Process = 2
}

export interface TaskSet {
	tasks: Task[];
	extension?: IExtensionDescription;
}

export function computeLabel(task: Task): string {
	if (task._source.kind === TaskSourceKind.Extension) {
		return nls.localize('taskEntry.label', '{0}: {1}', task._source.label, task.name);
	} else {
		return task.name;
	}
}