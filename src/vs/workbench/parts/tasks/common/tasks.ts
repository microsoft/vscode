/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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

export enum PanelKind {

	/**
	 * Shares a panel with other tasks. This is the default.
	 */
	Shared = 1,

	/**
	 * Uses a dedicated panel for this tasks. The panel is not
	 * shared with other tasks.
	 */
	Dedicated = 2,

	/**
	 * Creates a new panel whenever this task is executed.
	 */
	New = 3
}

export namespace PanelKind {
	export function fromString(value: string): PanelKind {
		switch (value.toLowerCase()) {
			case 'shared':
				return PanelKind.Shared;
			case 'dedicated':
				return PanelKind.Dedicated;
			case 'new':
				return PanelKind.New;
			default:
				return PanelKind.Shared;
		}
	}
}

export interface PresentationOptions {
	/**
	 * Controls whether the task output is reveal in the user interface.
	 * Defaults to `RevealKind.Always`.
	 */
	reveal: RevealKind;

	/**
	 * Controls whether the command associated with the task is echoed
	 * in the user interface.
	 */
	echo: boolean;

	/**
	 * Controls whether the panel showing the task output is taking focus.
	 */
	focus: boolean;

	/**
	 * Controls if the task panel is used for this task only (dedicated),
	 * shared between tasks (shared) or if a new panel is created on
	 * every task execution (new). Defaults to `TaskInstanceKind.Shared`
	 */
	panel: PanelKind;
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
	 * Whether to suppress the task name when merging global args
	 *
	 */
	suppressTaskName?: boolean;

	/**
	 * Describes how the task is presented in the UI.
	 */
	presentation: PresentationOptions;
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
	 * The cached label.
	 */
	_label: string;

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
	 * The id of the customized task
	 */
	customize?: string;

	/**
	 * the task's group;
	 */
	group?: string;

	/**
	 * The command configuration
	 */
	command: CommandConfiguration;

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
	Process = 1,
	Terminal = 2
}

export enum JsonSchemaVersion {
	V0_1_0 = 1,
	V2_0_0 = 2
}

export interface TaskSet {
	tasks: Task[];
	extension?: IExtensionDescription;
}