/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export namespace workspace {

		export const onDidChangeWorkspaceFolders: Event<Uri[] | undefined>;

		export let workspaceFolders: Uri[] | undefined;
	}

	/**
	 * Controls the behaviour of the terminal's visibility.
	 */
	export enum TaskRevealKind {
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

	/**
	 * Controls how the task channel is used between tasks
	 */
	export enum TaskPanelKind {

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

	/**
	 * Controls how the task is presented in the UI.
	 */
	export interface TaskPresentationOptions {
		/**
		 * Controls whether the task output is reveal in the user interface.
		 * Defaults to `RevealKind.Always`.
		 */
		reveal?: TaskRevealKind;

		/**
		 * Controls whether the command associated with the task is echoed
		 * in the user interface.
		 */
		echo?: boolean;

		/**
		 * Controls whether the panel showing the task output is taking focus.
		 */
		focus?: boolean;

		/**
		 * Controls if the task panel is used for this task only (dedicated),
		 * shared between tasks (shared) or if a new panel is created on
		 * every task execution (new). Defaults to `TaskInstanceKind.Shared`
		 */
		panel?: TaskPanelKind;
	}

	export interface ProcessTaskOptions {
		/**
		 * The current working directory of the executed program or shell.
		 * If omitted the tools current workspace root is used.
		 */
		cwd?: string;

		/**
		 * The additional environment of the executed program or shell. If omitted
		 * the parent process' environment is used. If provided it is merged with
		 * the parent process' environment.
		 */
		env?: { [key: string]: string };
	}

	export namespace TaskGroup {
		/**
		 * The clean task group
		 */
		export const Clean: 'clean';
		/**
		 * The build task group. If a task is part of the build task group
		 * it can be executed via the run build short cut.
		 */
		export const Build: 'build';
		/**
		 * The rebuild all task group
		 */
		export const RebuildAll: 'rebuildAll';
		/**
		 * The test task group. If a task is part of the test task group
		 * it can be executed via the run test short cut.
		 */
		export const Test: 'test';
	}

	/**
	 * A task that starts an external process.
	 */
	export class ProcessTask {

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(name: string, process: string, problemMatchers?: string | string[]);

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param args arguments to be passed to the process.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(name: string, process: string, args: string[], problemMatchers?: string | string[]);

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param args arguments to be passed to the process.
		 * @param options additional options for the started process.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(name: string, process: string, args: string[], options: ProcessTaskOptions, problemMatchers?: string | string[]);

		/**
		 * The task's name
		 */
		readonly name: string;

		/**
		 * The task's identifier. If omitted the internal identifier will
		 * be `${extensionName}:${name}`
		 */
		identifier: string | undefined;

		/**
		 * Whether the task is a background task or not.
		 */
		isBackground: boolean;

		/**
		 * The process to be executed.
		 */
		readonly process: string;

		/**
		 * The arguments passed to the process. Defaults to an empty array.
		 */
		args: string[];

		/**
		 * A human-readable string describing the source of this
		 * shell task, e.g. 'gulp' or 'npm'.
		 */
		source: string | undefined;

		/**
		 * The task group this tasks belongs to. See TaskGroup
		 * for a predefined set of available groups.
		 * Defaults to undefined meaning that the task doesn't
		 * belong to any special group.
		 */
		group: string | undefined;

		/**
		 * The process options used when the process is executed.
		 * Defaults to an empty object literal.
		 */
		options: ProcessTaskOptions;

		/**
		 * The presentation options. Defaults to an empty literal.
		 */
		presentationOptions: TaskPresentationOptions;

		/**
		 * The problem matchers attached to the task. Defaults to an empty
		 * array.
		 */
		problemMatchers: string[];
	}

	export type ShellTaskOptions = {
		/**
		 * The shell executable.
		 */
		executable: string;

		/**
		 * The arguments to be passed to the shell executable used to run the task.
		 */
		shellArgs?: string[];

		/**
		 * The current working directory of the executed shell.
		 * If omitted the tools current workspace root is used.
		 */
		cwd?: string;

		/**
		 * The additional environment of the executed shell. If omitted
		 * the parent process' environment is used. If provided it is merged with
		 * the parent process' environment.
		 */
		env?: { [key: string]: string };
	} | {
			/**
			 * The current working directory of the executed shell.
			 * If omitted the tools current workspace root is used.
			 */
			cwd: string;

			/**
			 * The additional environment of the executed shell. If omitted
			 * the parent process' environment is used. If provided it is merged with
			 * the parent process' environment.
			 */
			env?: { [key: string]: string };
		} | {
			/**
			 * The current working directory of the executed shell.
			 * If omitted the tools current workspace root is used.
			 */
			cwd?: string;

			/**
			 * The additional environment of the executed shell. If omitted
			 * the parent process' environment is used. If provided it is merged with
			 * the parent process' environment.
			 */
			env: { [key: string]: string };
		};

	/**
	 * A task that executes a shell command.
	 */
	export class ShellTask {

		/**
		 * Creates a shell task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param commandLine the command line to execute.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(name: string, commandLine: string, problemMatchers?: string | string[]);

		/**
		 * Creates a shell task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param commandLine the command line to execute.
		 * @param options additional options used when creating the shell.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(name: string, commandLine: string, options: ShellTaskOptions, problemMatchers?: string | string[]);

		/**
		 * The task's name
		 */
		readonly name: string;

		/**
		 * The task's identifier. If omitted the internal identifier will
		 * be `${extensionName}:${name}`
		 */
		identifier: string | undefined;

		/**
		 * Whether the task is a background task or not.
		 */
		isBackground: boolean;

		/**
		 * The command line to execute.
		 */
		readonly commandLine: string;

		/**
		 * A human-readable string describing the source of this
		 * shell task, e.g. 'gulp' or 'npm'.
		 */
		source: string | undefined;

		/**
		 * The task group this tasks belongs to. See TaskGroup
		 * for a predefined set of available groups.
		 * Defaults to undefined meaning that the task doesn't
		 * belong to any special group.
		 */
		group: string | undefined;

		/**
		 * The shell options used when the shell is executed. Defaults to an
		 * empty object literal.
		 */
		options: ShellTaskOptions;

		/**
		 * The presentation options. Defaults to an empty literal.
		 */
		presentationOptions: TaskPresentationOptions;

		/**
		 * The problem matchers attached to the task. Defaults to an empty
		 * array.
		 */
		problemMatchers: string[];
	}

	export type Task = ProcessTask | ShellTask;

	/**
	 * A task provider allows to add tasks to the task service.
	 * A task provider is registerd via #workspace.registerTaskProvider.
	 */
	export interface TaskProvider {
		/**
		 * Provides additional tasks.
		 * @param token A cancellation token.
		 * @return a #TaskSet
		 */
		provideTasks(token: CancellationToken): ProviderResult<Task[]>;
	}

	export namespace workspace {
		/**
		 * Register a task provider.
		 *
		 * @param provider A task provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerTaskProvider(provider: TaskProvider): Disposable;
	}

	export namespace window {

		export function sampleFunction(): Thenable<any>;
	}

	/**
	 * The contiguous set of modified lines in a diff.
	 */
	export interface LineChange {
		readonly originalStartLineNumber: number;
		readonly originalEndLineNumber: number;
		readonly modifiedStartLineNumber: number;
		readonly modifiedEndLineNumber: number;
	}

	export namespace commands {

		/**
		 * Registers a diff information command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Diff information commands are different from ordinary [commands](#commands.registerCommand) as
		 * they only execute when there is an active diff editor when the command is called, and the diff
		 * information has been computed. Also, the command handler of an editor command has access to
		 * the diff information.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to the [diff information](#LineChange).
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerDiffInformationCommand(command: string, callback: (diff: LineChange[], ...args: any[]) => any, thisArg?: any): Disposable;
	}

	export interface Terminal {

		/**
		 * The name of the terminal.
		 */
		readonly name: string;

		/**
		 * The process ID of the shell process.
		 */
		readonly processId: Thenable<number>;

		/**
		 * Send text to the terminal. The text is written to the stdin of the underlying pty process
		 * (shell) of the terminal.
		 *
		 * @param text The text to send.
		 * @param addNewLine Whether to add a new line to the text being sent, this is normally
		 * required to run a command in the terminal. The character(s) added are \n or \r\n
		 * depending on the platform. This defaults to `true`.
		 */
		sendText(text: string, addNewLine?: boolean): void;

		/**
		 * Show the terminal panel and reveal this terminal in the UI.
		 *
		 * @param preserveFocus When `true` the terminal will not take focus.
		 */
		show(preserveFocus?: boolean): void;

		/**
		 * Hide the terminal panel if this terminal is currently showing.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;

		/**
		 * Experimental API that allows listening to the raw data stream coming from the terminal's
		 * pty process (including ANSI escape sequences).
		 *
		 * @param callback The callback that is triggered when data is sent to the terminal.
		 */
		onData(callback: (data: string) => any): void;
	}
}
