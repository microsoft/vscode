/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	/**
	 * Defines a problem pattern
	 */
	export interface ProblemPattern {

		/**
		 * The regular expression to find a problem in the console output of an
		 * executed task.
		 */
		regexp: RegExp;

		/**
		 * The match group index of the filename.
		 *
		 * Defaults to 1 if omitted.
		 */
		file?: number;

		/**
		 * The match group index of the problems's location. Valid location
		 * patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn).
		 * If omitted the line and colum properties are used.
		 */
		location?: number;

		/**
		 * The match group index of the problem's line in the source file.
		 *
		 * Defaults to 2 if omitted.
		 */
		line?: number;

		/**
		 * The match group index of the problem's character in the source file.
		 *
		 * Defaults to 3 if omitted.
		 */
		character?: number;

		/**
		 * The match group index of the problem's end line in the source file.
		 *
		 * Defaults to undefined. No end line is captured.
		 */
		endLine?: number;

		/**
		 * The match group index of the problem's end character in the source file.
		 *
		 * Defaults to undefined. No end column is captured.
		 */
		endCharacter?: number;

		/**
		 * The match group index of the problem's severity.
		 *
		 * Defaults to undefined. In this case the problem matcher's severity
		 * is used.
		*/
		severity?: number;

		/**
		 * The match group index of the problems's code.
		 *
		 * Defaults to undefined. No code is captured.
		 */
		code?: number;

		/**
		 * The match group index of the message. If omitted it defaults
		 * to 4 if location is specified. Otherwise it defaults to 5.
		 */
		message?: number;

		/**
		 * Specifies if the last pattern in a multi line problem matcher should
		 * loop as long as it does match a line consequently. Only valid on the
		 * last problem pattern in a multi line problem matcher.
		 */
		loop?: boolean;
	}

	/**
	 * A multi line problem pattern.
	 */
	export type MultiLineProblemPattern = ProblemPattern[];

	/**
	 * The way how the file location is interpreted
	 */
	export enum FileLocationKind {
		/**
		 * VS Code should decide based on whether the file path found in the
		 * output is absolute or relative. A relative file path will be treated
		 * relative to the workspace root.
		 */
		Auto = 1,

		/**
		 * Always treat the file path relative.
		 */
		Relative = 2,

		/**
		 * Always treat the file path absolute.
		 */
		Absolute = 3
	}

	/**
	 * Controls to which kind of documents problems are applied.
	 */
	export enum ApplyToKind {
		/**
		 * Problems are applied to all documents.
		 */
		AllDocuments = 1,
		/**
		 * Problems are applied to open documents only.
		 */
		OpenDocuments = 2,

		/**
		 * Problems are applied to closed documents only.
		 */
		ClosedDocuments = 3
	}


	/**
	 * A background monitor pattern
	 */
	export interface BackgroundPattern {
		/**
		 * The actual regular expression
		 */
		regexp: RegExp;

		/**
		 * The match group index of the filename. If provided the expression
		 * is matched for that file only.
		 */
		file?: number;
	}

	/**
	 * A description to control the activity of a problem matcher
	 * watching a background task.
	 */
	export interface BackgroundMonitor {
		/**
		 * If set to true the monitor is in active mode when the task
		 * starts. This is equals of issuing a line that matches the
		 * beginPattern.
		 */
		activeOnStart?: boolean;

		/**
		 * If matched in the output the start of a background activity is signaled.
		 */
		beginsPattern: RegExp | BackgroundPattern;

		/**
		 * If matched in the output the end of a background activity is signaled.
		 */
		endsPattern: RegExp | BackgroundPattern;
	}

	/**
	 * Defines a problem matcher
	 */
	export interface ProblemMatcher {
		/**
		 * The owner of a problem. Defaults to a generated id
		 * if omitted.
		 */
		owner?: string;

		/**
		 * The type of documents problems detected by this matcher
		 * apply to. Default to `ApplyToKind.AllDocuments` if omitted.
		 */
		applyTo?: ApplyToKind;

		/**
		 * How a file location recognize by a matcher should be interpreted. If omitted the file location
		 * if `FileLocationKind.Auto`.
		 */
		fileLocation?: FileLocationKind | string;

		/**
		 * The actual pattern used by the problem matcher.
		 */
		pattern: ProblemPattern | MultiLineProblemPattern;

		/**
		 * The default severity of a detected problem in the output. Used
		 * if the `ProblemPattern` doesn't define a severity match group.
		 */
		severity?: DiagnosticSeverity;

		/**
		 * A background monitor for tasks that are running in the background.
		 */
		backgound?: BackgroundMonitor;
	}

	/**
	 * Controls the behaviour of the terminal's visibility.
	 */
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

	/**
	 * Controls terminal specific behaviour.
	 */
	export interface TerminalBehaviour {
		/**
		 * Controls whether the terminal executing a task is brought to front or not.
		 * Defaults to `RevealKind.Always`.
		 */
		reveal?: RevealKind;

		/**
		 * Controls whether the command is echoed in the terminal or not.
		 */
		echo?: boolean;
	}


	export interface ProcessOptions {
		/**
		 * The current working directory of the executed program or shell.
		 * If omitted VSCode's current workspace root is used.
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
		 * The build task group
		 */
		export const Build: 'build';
		/**
		 * The rebuild all task group
		 */
		export const RebuildAll: 'rebuildAll';
		/**
		 * The test task group
		 */
		export const Test: 'test';
	}

	/**
	 * The supported task groups.
	 */
	export type TaskGroup = 'clean' | 'build' | 'rebuildAll' | 'test';

	/**
	 * A task that starts an external process.
	 */
	export class ProcessTask {

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param problemMatchers the problem matchers to use.
		 */
		constructor(name: string, process: string, ...problemMatchers: ProblemMatcher[]);

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param args arguments to be passed to the process.
		 * @param problemMatchers the problem matchers to use.
		 */
		constructor(name: string, process: string, args: string[], ...problemMatchers: ProblemMatcher[]);

		/**
		 * Creates a process task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param process the process to start.
		 * @param args arguments to be passed to the process.
		 * @param options additional options for the started process.
		 * @param problemMatchers the problem matchers to use.
		 */
		constructor(name: string, process: string, args: string[], options: ProcessOptions, ...problemMatchers: ProblemMatcher[]);

		/**
		 * The task's name
		 */
		readonly name: string;

		/**
		 * The task's identifier. If omitted the name is
		 * used as an identifier.
		 */
		identifier: string;

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
		 * The task group this tasks belongs to. Defaults to undefined meaning
		 * that the task doesn't belong to any special group.
		 */
		group?: TaskGroup;

		/**
		 * The process options used when the process is executed.
		 * Defaults to an empty object literal.
		 */
		options: ProcessOptions;

		/**
		 * The terminal options. Defaults to an empty object literal.
		 */
		terminal: TerminalBehaviour;

		/**
		 * The problem matchers attached to the task. Defaults to an empty
		 * array.
		 */
		problemMatchers: ProblemMatcher[];
	}

	export type ShellOptions = {
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
		 * If omitted VSCode's current workspace root is used.
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
		 * If omitted VSCode's current workspace root is used.
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
		 * If omitted VSCode's current workspace root is used.
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
		 * @param problemMatchers the problem matchers to use.
		 */
		constructor(name: string, commandLine: string, ...problemMatchers: ProblemMatcher[]);

		/**
		 * Creates a shell task.
		 *
		 * @param name the task's name. Is presented in the user interface.
		 * @param commandLine the command line to execute.
		 * @param options additional options used when creating the shell.
		 * @param problemMatchers the problem matchers to use.
		 */
		constructor(name: string, commandLine: string, options: ShellOptions, ...problemMatchers: ProblemMatcher[]);

		/**
		 * The task's name
		 */
		readonly name: string;

		/**
		 * The task's identifier. If omitted the name is
		 * used as an identifier.
		 */
		identifier: string;

		/**
		 * Whether the task is a background task or not.
		 */
		isBackground: boolean;

		/**
		 * The command line to execute.
		 */
		readonly commandLine: string;

		/**
		 * The task group this tasks belongs to. Defaults to undefined meaning
		 * that the task doesn't belong to any special group.
		 */
		group?: TaskGroup;

		/**
		 * The shell options used when the shell is executed. Defaults to an
		 * empty object literal.
		 */
		options: ShellOptions;

		/**
		 * The terminal options. Defaults to an empty object literal.
		 */
		terminal: TerminalBehaviour;

		/**
		 * The problem matchers attached to the task. Defaults to an empty
		 * array.
		 */
		problemMatchers: ProblemMatcher[];
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

		/**
		 * Show window-wide progress, e.g. in the status bar, for the provided task. The task is
		 * considering running as long as the promise it returned isn't resolved or rejected.
		 *
		 * @param task A function callback that represents a long running operation.
		 */
		export function withWindowProgress<R>(title: string, task: (progress: Progress<string>, token: CancellationToken) => Thenable<R>): Thenable<R>;

		export function sampleFunction(): Thenable<any>;
	}

	export namespace window {

		/**
		 * Register a [TreeExplorerNodeProvider](#TreeExplorerNodeProvider).
		 *
		 * @param providerId A unique id that identifies the provider.
		 * @param provider A [TreeExplorerNodeProvider](#TreeExplorerNodeProvider).
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerTreeExplorerNodeProvider(providerId: string, provider: TreeExplorerNodeProvider<any>): Disposable;
	}

	/**
	 * A node provider for a tree explorer contribution.
	 *
	 * Providers are registered through (#window.registerTreeExplorerNodeProvider) with a
	 * `providerId` that corresponds to the `treeExplorerNodeProviderId` in the extension's
	 * `contributes.explorer` section.
	 *
	 * The contributed tree explorer will ask the corresponding provider to provide the root
	 * node and resolve children for each node. In addition, the provider could **optionally**
	 * provide the following information for each node:
	 * - label: A human-readable label used for rendering the node.
	 * - hasChildren: Whether the node has children and is expandable.
	 * - clickCommand: A command to execute when the node is clicked.
	 */
	export interface TreeExplorerNodeProvider<T> {

		/**
		 * Provide the root node. This function will be called when the tree explorer is activated
		 * for the first time. The root node is hidden and its direct children will be displayed on the first level of
		 * the tree explorer.
		 *
		 * @return The root node.
		 */
		provideRootNode(): T | Thenable<T>;

		/**
		 * Resolve the children of `node`.
		 *
		 * @param node The node from which the provider resolves children.
		 * @return Children of `node`.
		 */
		resolveChildren(node: T): T[] | Thenable<T[]>;

		/**
		 * Provide a human-readable string that will be used for rendering the node. Default to use
		 * `node.toString()` if not provided.
		 *
		 * @param node The node from which the provider computes label.
		 * @return A human-readable label.
		 */
		getLabel?(node: T): string;

		/**
		 * Determine if `node` has children and is expandable. Default to `true` if not provided.
		 *
		 * @param node The node to determine if it has children and is expandable.
		 * @return A boolean that determines if `node` has children and is expandable.
		 */
		getHasChildren?(node: T): boolean;

		/**
		 * Get the command to execute when `node` is clicked.
		 *
		 * Commands can be registered through [registerCommand](#commands.registerCommand). `node` will be provided
		 * as the first argument to the command's callback function.
		 *
		 * @param node The node that the command is associated with.
		 * @return The command to execute when `node` is clicked.
		 */
		getClickCommand?(node: T): string;
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
