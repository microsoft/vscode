/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Types from 'vs/base/common/types';

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';

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
	name: string;

	/**
	 * Whether the command is a shell command or not
	 */
	isShellCommand: boolean | ShellConfiguration;

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
	echo: boolean;
}

export enum ShowOutput {
	Always = 1,
	Silent = 2,
	Never = 3
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

export namespace TaskGroup {
	export const Clean: 'clean' = 'clean';

	export const Build: 'build' = 'build';

	export const RebuildAll: 'rebuildAll' = 'rebuildAll';

	export const Test: 'test' = 'test';

	export function is(value: string): value is TaskGroup {
		return value === Clean || value === Build || value === RebuildAll || value === Test;
	}
}

export type TaskGroup = 'clean' | 'build' | 'rebuildAll' | 'test';

/**
 * A task description
 */
export interface Task {

	/**
	 * The task's internal id
	 */
	_id: string;

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
	group?: TaskGroup;

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
	 * The other tasks this task depends on.
	 */
	dependsOn?: string[];

	/**
	 * The problem watchers to use for this task
	 */
	problemMatchers?: ProblemMatcher[];
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