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

	/**
	 * Options to configure the behavior of the input box UI.
	 */
	export interface InputBoxOptions {

		/**
		 * The value to prefill in the input box.
		 */
		value?: string;

		/**
		 * Selection of the prefilled [`value`](#InputBoxOptions.value). Defined as tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index. When `undefined` the whole
		 * word will be selected, when empty (start equals end) only the cursor will be set,
		 * otherwise the defined range will be selected.
		 */
		valueSelection?: [number, number];

		/**
		 * The text to display underneath the input box.
		 */
		prompt?: string;

		/**
		 * An optional string to show as place holder in the input box to guide the user what to type.
		 */
		placeHolder?: string;

		/**
		 * Set to `true` to show a password prompt that will not show the typed value.
		 */
		password?: boolean;

		/**
		 * Set to `true` to keep the input box open when focus moves to another part of the editor or to another window.
		 */
		ignoreFocusOut?: boolean;

		/**
		 * An optional function that will be called to validate input and to give a hint
		 * to the user.
		 *
		 * @param value The current value of the input box.
		 * @return A human readable string which is presented as diagnostic message.
		 * Return `undefined`, `null`, or the empty string when 'value' is valid.
		 */
		validateInput?(value: string): string | undefined | null | Thenable<string | undefined | null>;

		/**
		 * An optional function that can modify the input box in response to input.
		 */
		handleKeyDown?: (e: KeyboardEvent, value: string) => string;
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
	}

	export interface DecorationProvider {
		onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
		provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
	}

	export namespace window {
		export function registerDecorationProvider(provider: DecorationProvider): Disposable;
	}

	//#endregion
}
