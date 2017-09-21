/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export interface OpenDialogOptions {
		/**
		 * The resource the dialog shows when opened.
		 */
		defaultUri?: Uri;

		/**
		 * A human-readable string for the open button.
		 */
		openLabel?: string;

		/**
		 * Only allow to select files. *Note* that not all operating systems support
		 * to select files and folders in one dialog instance.
		 */
		openFiles?: boolean;

		/**
		 * Only allow to select folders. *Note* that not all operating systems support
		 * to select files and folders in one dialog instance.
		 */
		openFolders?: boolean;

		/**
		 * Allow to select many files or folders.
		 */
		openMany?: boolean;

		/**
		 * A set of file filters that are shown in the dialog, e.g.
		 * ```ts
		 * {
		 * 	['Images']: ['*.png', '*.jpg']
		 * 	['TypeScript']: ['*.ts', '*.tsx']
		 * }
		 * ```
		 */
		filters: { [name: string]: string[] };
	}

	/**
	 * Options to configure the behaviour of a file save dialog
	 */
	export interface SaveDialogOptions {
		/**
		 * The resource the dialog shows when opened.
		 */
		defaultUri?: Uri;

		/**
		 * A human-readable string for the save button.
		 */
		saveLabel?: string;

		/**
		 * A set of file filters that are shown in the dialog, e.g.
		 * ```ts
		 * {
		 * 	['Images']: ['*.png', '*.jpg']
		 * 	['TypeScript']: ['*.ts', '*.tsx']
		 * }
		 * ```
		 */
		filters: { [name: string]: string[] };
	}

	export namespace window {

		/**
		 * Shows a file open dialog to the user.
		 *
		 * @param options Options that control the dialog.
		 * @returns A promise that resolves to the selected resources or `undefined`.
		 */
		export function showOpenDialog(options: OpenDialogOptions): Thenable<Uri[] | undefined>;

		/**
		 * Shows a file save dialog to the user.
		 *
		 * @param options Options that control the dialog.
		 * @returns A promise that resolves to the selected resource or `undefined`.
		 */
		export function showSaveDialog(options: SaveDialogOptions): Thenable<Uri | undefined>;

		/**
		 * Shows a selection list of [workspace folders](#workspace.workspaceFolders) to pick from.
		 * Returns `undefined` if no folder is open.
		 *
		 * @param options Configures the behavior of the workspace folder list.
		 * @return A promise that resolves to the workspace folder or `undefined`.
		 */
		export function showWorkspaceFolderPick(options?: WorkspaceFolderPickOptions): Thenable<WorkspaceFolder | undefined>;
	}

	/**
	 * Options to configure the behaviour of the [workspace folder](#WorkspaceFolder) pick UI.
	 */
	export interface WorkspaceFolderPickOptions {

		/**
		 * An optional string to show as place holder in the input box to guide the user what to pick on.
		 */
		placeHolder?: string;

		/**
		 * Set to `true` to keep the picker open when focus moves to another part of the editor or to another window.
		 */
		ignoreFocusOut?: boolean;
	}

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
		resource: Uri;
		mtime: number;
		size: number;
		type: FileType;
	}

	// todo@joh discover files etc
	export interface FileSystemProvider {

		onDidChange?: Event<FileChange[]>;

		root: Uri;

		// more...
		//
		utimes(resource: Uri, mtime: number): Thenable<FileStat>;
		stat(resource: Uri): Thenable<FileStat>;
		read(resource: Uri, progress: Progress<Uint8Array>): Thenable<void>;
		write(resource: Uri, content: Uint8Array): Thenable<void>;
		unlink(resource: Uri): Thenable<void>;
		rename(resource: Uri, target: Uri): Thenable<void>;
		mkdir(resource: Uri): Thenable<void>;
		readdir(resource: Uri): Thenable<FileStat[]>;
		rmdir(resource: Uri): Thenable<void>;
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

	/**
	 * Represents a color in RGBA space.
	 */
	export class Color {

		/**
		 * The red component of this color in the range [0-1].
		 */
		readonly red: number;

		/**
		 * The green component of this color in the range [0-1].
		 */
		readonly green: number;

		/**
		 * The blue component of this color in the range [0-1].
		 */
		readonly blue: number;

		/**
		 * The alpha component of this color in the range [0-1].
		 */
		readonly alpha: number;

		constructor(red: number, green: number, blue: number, alpha: number);
	}

	/**
	 * Represents a color range from a document.
	 */
	export class ColorInformation {

		/**
		 * The range in the document where this color appers.
		 */
		range: Range;

		/**
		 * The actual color value for this color range.
		 */
		color: Color;

		/**
		 * Creates a new color range.
		 *
		 * @param range The range the color appears in. Must not be empty.
		 * @param color The value of the color.
		 * @param format The format in which this color is currently formatted.
		 */
		constructor(range: Range, color: Color);
	}

	export class ColorPresentation {
		/**
		 * The label of this color presentation. It will be shown on the color
		 * picker header. By default this is also the text that is inserted when selecting
		 * this color presentation.
		 */
		label: string;
		/**
		 * An [edit](#TextEdit) which is applied to a document when selecting
		 * this presentation for the color.  When `falsy` the [label](#ColorPresentation.label)
		 * is used.
		 */
		textEdit?: TextEdit;
		/**
		 * An optional array of additional [text edits](#TextEdit) that are applied when
		 * selecting this color presentation. Edits must not overlap with the main [edit](#ColorPresentation.textEdit) nor with themselves.
		 */
		additionalTextEdits?: TextEdit[];
	}

	/**
	 * The document color provider defines the contract between extensions and feature of
	 * picking and modifying colors in the editor.
	 */
	export interface DocumentColorProvider {
		/**
		 * Provide colors for the given document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of [color informations](#ColorInformation) or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentColors(document: TextDocument, token: CancellationToken): ProviderResult<ColorInformation[]>;
		/**
		 * Provide representations for a color.
		 */
		provideColorPresentations(document: TextDocument, colorInfo: ColorInformation, token: CancellationToken): ProviderResult<ColorPresentation[]>;
	}

	export namespace languages {
		export function registerColorProvider(selector: DocumentSelector, provider: DocumentColorProvider): Disposable;
	}
}
