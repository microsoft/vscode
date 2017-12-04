/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	// export enum FileErrorCodes {
	// 	/**
	// 	 * Not owner.
	// 	 */
	// 	EPERM = 1,
	// 	/**
	// 	 * No such file or directory.
	// 	 */
	// 	ENOENT = 2,
	// 	/**
	// 	 * I/O error.
	// 	 */
	// 	EIO = 5,
	// 	/**
	// 	 * Permission denied.
	// 	 */
	// 	EACCES = 13,
	// 	/**
	// 	 * File exists.
	// 	 */
	// 	EEXIST = 17,
	// 	/**
	// 	 * Not a directory.
	// 	 */
	// 	ENOTDIR = 20,
	// 	/**
	// 	 * Is a directory.
	// 	 */
	// 	EISDIR = 21,
	// 	/**
	// 	 *  File too large.
	// 	 */
	// 	EFBIG = 27,
	// 	/**
	// 	 * No space left on device.
	// 	 */
	// 	ENOSPC = 28,
	// 	/**
	// 	 * Directory is not empty.
	// 	 */
	// 	ENOTEMPTY = 66,
	// 	/**
	// 	 * Invalid file handle.
	// 	 */
	// 	ESTALE = 70,
	// 	/**
	// 	 * Illegal NFS file handle.
	// 	 */
	// 	EBADHANDLE = 10001,
	// }

	export enum FileChangeType {
		Updated = 0,
		Added = 1,
		Deleted = 2
	}

	export interface FileChange {
		type: FileChangeType;
		resource: Uri;
	}

	export enum FileType {
		File = 0,
		Dir = 1,
		Symlink = 2
	}

	export interface FileStat {
		id: number | string;
		mtime: number;
		// atime: number;
		size: number;
		type: FileType;
	}

	// todo@joh discover files etc
	export interface FileSystemProvider {

		onDidChange?: Event<FileChange[]>;

		root: Uri;

		// more...
		//
		utimes(resource: Uri, mtime: number, atime: number): Thenable<FileStat>;

		stat(resource: Uri): Thenable<FileStat>;

		read(resource: Uri, offset: number, length: number, progress: Progress<Uint8Array>): Thenable<number>;

		// todo@remote
		// offset - byte offset to start
		// count - number of bytes to write
		// Thenable<number> - number of bytes actually written
		write(resource: Uri, content: Uint8Array): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		move(resource: Uri, target: Uri): Thenable<FileStat>;

		// todo@remote
		// helps with performance bigly
		// copy?(from: Uri, to: Uri): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		mkdir(resource: Uri): Thenable<FileStat>;

		readdir(resource: Uri): Thenable<[Uri, FileStat][]>;

		// todo@remote
		// ? merge both
		// ? recursive del
		rmdir(resource: Uri): Thenable<void>;
		unlink(resource: Uri): Thenable<void>;

		// todo@remote
		// create(resource: Uri): Thenable<FileStat>;

		// find files by names
		findFiles?(query: string, progress: Progress<Uri>, token: CancellationToken): Thenable<void>;
	}

	export namespace workspace {
		export function registerFileSystemProvider(authority: string, provider: FileSystemProvider): Disposable;
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

	//#region decorations

	//todo@joh -> make class
	export interface DecorationData {
		priority?: number;
		title?: string;
		bubble?: boolean;
		abbreviation?: string;
		color?: ThemeColor;
		source?: string;
	}

	export interface SourceControlResourceDecorations {
		source?: string;
		letter?: string;
		color?: ThemeColor;
	}

	export interface DecorationProvider {
		onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
		provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
	}

	export namespace window {
		export function registerDecorationProvider(provider: DecorationProvider): Disposable;
	}

	//#endregion

	/**
	 * Represents an action that can be performed in code.
	 *
	 * Shown using the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action)
	 */
	export class CodeAction {
		/**
		 * Label used to identify the code action in UI.
		 */
		title: string;

		/**
		 * Optional command that performs the code action.
		 *
		 * Executed after `edits` if any edits are provided. Either `command` or `edits` must be provided for a `CodeAction`.
		 */
		command?: Command;

		/**
		 * Optional edit that performs the code action.
		 *
		 * Either `command` or `edits` must be provided for a `CodeAction`.
		 */
		edits?: TextEdit[] | WorkspaceEdit;

		/**
		 * Diagnostics that this code action resolves.
		 */
		diagnostics?: Diagnostic[];

		constructor(title: string, edits?: TextEdit[] | WorkspaceEdit);
	}

	export interface CodeActionProvider {

		/**
		 * Provide commands for the given document and range.
		 *
		 * If implemented, overrides `provideCodeActions`
		 *
		 * @param document The document in which the command was invoked.
		 * @param range The range for which the command was invoked.
		 * @param context Context carrying additional information.
		 * @param token A cancellation token.
		 * @return An array of commands, quick fixes, or refactorings or a thenable of such. The lack of a result can be
		 * signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideCodeActions2?(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): ProviderResult<(Command | CodeAction)[]>;
	}

	export namespace debug {

		/**
		 * List of breakpoints.
		 *
		 * @readonly
		 */
		export let breakpoints: Breakpoint[];

		/**
		 * An event that is emitted when a breakpoint is added, removed, or changed.
		 */
		export const onDidChangeBreakpoints: Event<BreakpointsChangeEvent>;
	}

	/**
	 * An event describing a change to the set of [breakpoints](#debug.Breakpoint).
	 */
	export interface BreakpointsChangeEvent {
		/**
		 * Added breakpoints.
		 */
		readonly added: Breakpoint[];

		/**
		 * Removed breakpoints.
		 */
		readonly removed: Breakpoint[];

		/**
		 * Changed breakpoints.
		 */
		readonly changed: Breakpoint[];
	}

	export interface Breakpoint {
		/**
		 * Type of breakpoint.
		 */
		readonly type: 'source' | 'function';
		/**
		 * Is breakpoint enabled.
		 */
		readonly enabled: boolean;
		/**
		 * An optional expression for conditional breakpoints.
		 */
		readonly condition?: string;
		/**
		 * An optional expression that controls how many hits of the breakpoint are ignored.
		 */
		readonly hitCondition?: string;
	}

	export interface SourceBreakpoint extends Breakpoint {
		/**
		 * Breakpoint type 'source'.
		 */
		readonly type: 'source';
		/**
		 * The source to which this breakpoint is attached.
		 */
		readonly source: Uri;
		/**
		 * The line and character position of the breakpoint.
		 */
		readonly location: Position;
	}

	export interface FunctionBreakpoint extends Breakpoint {
		/**
		 * Breakpoint type 'function'.
		 */
		readonly type: 'function';
		/**
		 * The name of the function to which this breakpoint is attached.
		 */
		readonly functionName: string;
	}
}
