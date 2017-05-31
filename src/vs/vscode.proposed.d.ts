/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

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
	 * Controls terminal specific behavior.
	 */
	export interface TaskTerminalBehavior {
		/**
		 * Controls whether the terminal executing a task is brought to front or not.
		 * Defaults to `RevealKind.Always`.
		 */
		reveal?: TaskRevealKind;

		/**
		 * Controls whether the command is echoed in the terminal or not.
		 */
		echo?: boolean;
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
		 * The terminal behavior. Defaults to an empty object literal.
		 */
		terminalBehavior: TaskTerminalBehavior;

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
		 * The terminal behavior. Defaults to an empty object literal.
		 */
		terminalBehavior: TaskTerminalBehavior;

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

	export namespace window {
		/**
		 * Register a [TreeDataProvider](#TreeDataProvider) for the view contributed using the extension point `views`.
		 * @param viewId Id of the view contributed using the extension point `views`.
		 * @param treeDataProvider A [TreeDataProvider](#TreeDataProvider) that provides tree data for the view
		 */
		export function registerTreeDataProvider<T>(viewId: string, treeDataProvider: TreeDataProvider<T>): Disposable;
	}

	/**
	 * A data provider that provides tree data for a view
	 */
	export interface TreeDataProvider<T> {
		/**
		 * An optional event to signal that an element or root has changed.
		 */
		onDidChangeTreeData?: Event<T | undefined | null>;

		/**
		 * Get [TreeItem](#TreeItem) representation of the `element`
		 *
		 * @param element The element for which [TreeItem](#TreeItem) representation is asked for.
		 * @return [TreeItem](#TreeItem) representation of the element
		 */
		getTreeItem(element: T): TreeItem | Thenable<TreeItem>;

		/**
		 * Get the children of `element` or root if no element (`undefined`) is passed.
		 *
		 * @param element The element from which the provider gets children. Can be `undefined`.
		 * @return Children of `element` or root if no element (`undefined`) is passed.
		 */
		getChildren(element?: T): ProviderResult<T[]>;
	}

	export class TreeItem {
		/**
		 * A human-readable string describing this item
		 */
		label: string;

		/**
		 * The icon path for the tree item
		 */
		iconPath?: string | Uri | { light: string | Uri; dark: string | Uri };

		/**
		 * The [command](#Command) which should be run when the tree item is selected.
		 */
		command?: Command;

		/**
		 * [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item.
		 */
		collapsibleState?: TreeItemCollapsibleState;

		/**
		 * Context value of the tree item. This can be used to contribute item specific actions in the tree.
		 * For example, a tree item is given a context value as `folder`. When contributing actions to `view/item/context`
		 * using `menus` extension point, you can specify context value for key `viewItem` in `when` expression like `viewItem == folder`.
		 * ```
		 *	"contributes": {
		 *		"menus": {
		 *			"view/item/context": [
		 *				{
		 *					"command": "extension.deleteFolder",
		 *					"when": "viewItem == folder"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This will show action `extension.deleteFolder` only for items with `contextValue` is `folder`.
		 */
		contextValue?: string;

		/**
		 * @param label A human-readable string describing this item
		 * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
		 */
		constructor(label: string, collapsibleState?: TreeItemCollapsibleState);
	}

	/**
	 * Collapsible state of the tree item
	 */
	export enum TreeItemCollapsibleState {
		/**
		 * Determines an item can be neither collapsed nor expanded. Implies it has no children.
		 */
		None = 0,
		/**
		 * Determines an item is collapsed
		 */
		Collapsed = 1,
		/**
		 * Determines an item is expanded
		 */
		Expanded = 2
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
