/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import * as glob from 'vs/base/common/glob';
import { isLinux } from 'vs/base/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { startsWithIgnoreCase } from 'vs/base/common/strings';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { isUndefinedOrNull } from 'vs/base/common/types';

export const IFileService = createDecorator<IFileService>('fileService');

export interface IResourceEncodings {
	getWriteEncoding(resource: URI, preferredEncoding?: string): string;
}

export interface IFileService {
	_serviceBrand: any;

	/**
	 * Helper to determine read/write encoding for resources.
	 */
	encoding: IResourceEncodings;

	/**
	 * Allows to listen for file changes. The event will fire for every file within the opened workspace
	 * (if any) as well as all files that have been watched explicitly using the #watchFileChanges() API.
	 */
	onFileChanges: Event<FileChangesEvent>;

	/**
	 * An event that is fired upon successful completion of a certain file operation.
	 */
	onAfterOperation: Event<FileOperationEvent>;

	/**
	 * An event that is fired when a file system provider is added or removed
	 */
	onDidChangeFileSystemProviderRegistrations: Event<IFileSystemProviderRegistrationEvent>;

	/**
	 * Registers a file system provider for a certain scheme.
	 */
	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable;

	/**
	 * Tries to activate a provider with the given scheme.
	 */
	activateProvider(scheme: string): Promise<void>;

	/**
	 * Checks if this file service can handle the given resource.
	 */
	canHandleResource(resource: URI): boolean;

	/**
	 * Resolve the properties of a file identified by the resource.
	 *
	 * If the optional parameter "resolveTo" is specified in options, the stat service is asked
	 * to provide a stat object that should contain the full graph of folders up to all of the
	 * target resources.
	 *
	 * If the optional parameter "resolveSingleChildDescendants" is specified in options,
	 * the stat service is asked to automatically resolve child folders that only
	 * contain a single element.
	 */
	resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;

	/**
	 * Same as resolveFile but supports resolving multiple resources in parallel.
	 * If one of the resolve targets fails to resolve returns a fake IFileStat instead of making the whole call fail.
	 */
	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]>;

	/**
	 * Finds out if a file identified by the resource exists.
	 */
	existsFile(resource: URI): Promise<boolean>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the full value as string.
	 */
	resolveContent(resource: URI, options?: IResolveContentOptions): Promise<IContent>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the value as a readable stream.
	 */
	resolveStreamContent(resource: URI, options?: IResolveContentOptions): Promise<IStreamContent>;

	/**
	 * Updates the content replacing its previous value.
	 */
	updateContent(resource: URI, value: string | ITextSnapshot, options?: IUpdateContentOptions): Promise<IFileStat>;

	/**
	 * Moves the file to a new path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	moveFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStat>;

	/**
	 * Copies the file to a path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	copyFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStat>;

	/**
	 * Creates a new file with the given path. The returned promise
	 * will have the stat model object as a result.
	 *
	 * The optional parameter content can be used as value to fill into the new file.
	 */
	createFile(resource: URI, content?: string, options?: ICreateFileOptions): Promise<IFileStat>;

	/**
	 * Reads a folder's content with the given path. The returned promise
	 * will have the list of children as a result.
	 */
	readFolder(resource: URI): Promise<string[]>;

	/**
	 * Creates a new folder with the given path. The returned promise
	 * will have the stat model object as a result.
	 */
	createFolder(resource: URI): Promise<IFileStat>;

	/**
	 * Deletes the provided file. The optional useTrash parameter allows to
	 * move the file to trash. The optional recursive parameter allows to delete
	 * non-empty folders recursively.
	 */
	del(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void>;

	/**
	 * Allows to start a watcher that reports file change events on the provided resource.
	 */
	watchFileChanges(resource: URI): void;

	/**
	 * Allows to stop a watcher on the provided resource or absolute fs path.
	 */
	unwatchFileChanges(resource: URI): void;

	/**
	 * Frees up any resources occupied by this service.
	 */
	dispose(): void;
}

export interface FileOverwriteOptions {
	overwrite: boolean;
}

export interface FileWriteOptions {
	overwrite: boolean;
	create: boolean;
}

export interface FileDeleteOptions {
	recursive: boolean;
}

export enum FileType {
	Unknown = 0,
	File = 1,
	Directory = 2,
	SymbolicLink = 64
}

export interface IStat {
	type: FileType;
	mtime: number;
	ctime: number;
	size: number;
}

export interface IWatchOptions {
	recursive: boolean;
	excludes: string[];
}

export const enum FileSystemProviderCapabilities {
	FileReadWrite = 1 << 1,
	FileOpenReadWriteClose = 1 << 2,
	FileFolderCopy = 1 << 3,

	PathCaseSensitive = 1 << 10,
	Readonly = 1 << 11
}

export interface IFileSystemProvider {

	readonly capabilities: FileSystemProviderCapabilities;
	onDidChangeCapabilities: Event<void>;

	onDidChangeFile: Event<IFileChange[]>;
	watch(resource: URI, opts: IWatchOptions): IDisposable;

	stat(resource: URI): Promise<IStat>;
	mkdir(resource: URI): Promise<void>;
	readdir(resource: URI): Promise<[string, FileType][]>;
	delete(resource: URI, opts: FileDeleteOptions): Promise<void>;

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;
	copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;

	readFile?(resource: URI): Promise<Uint8Array>;
	writeFile?(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void>;

	open?(resource: URI): Promise<number>;
	close?(fd: number): Promise<void>;
	read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
	write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
}

export interface IFileSystemProviderRegistrationEvent {
	added: boolean;
	scheme: string;
	provider?: IFileSystemProvider;
}

export const enum FileOperation {
	CREATE,
	DELETE,
	MOVE,
	COPY
}

export class FileOperationEvent {

	constructor(private _resource: URI, private _operation: FileOperation, private _target?: IFileStat) {
	}

	get resource(): URI {
		return this._resource;
	}

	get target(): IFileStat | undefined {
		return this._target;
	}

	get operation(): FileOperation {
		return this._operation;
	}
}

/**
 * Possible changes that can occur to a file.
 */
export const enum FileChangeType {
	UPDATED = 0,
	ADDED = 1,
	DELETED = 2
}

/**
 * Identifies a single change in a file.
 */
export interface IFileChange {

	/**
	 * The type of change that occurred to the file.
	 */
	type: FileChangeType;

	/**
	 * The unified resource identifier of the file that changed.
	 */
	resource: URI;
}

export class FileChangesEvent {

	private _changes: IFileChange[];

	constructor(changes: IFileChange[]) {
		this._changes = changes;
	}

	get changes() {
		return this._changes;
	}

	/**
	 * Returns true if this change event contains the provided file with the given change type (if provided). In case of
	 * type DELETED, this method will also return true if a folder got deleted that is the parent of the
	 * provided file path.
	 */
	contains(resource: URI, type?: FileChangeType): boolean {
		if (!resource) {
			return false;
		}

		const checkForChangeType = !isUndefinedOrNull(type);

		return this._changes.some(change => {
			if (checkForChangeType && change.type !== type) {
				return false;
			}

			// For deleted also return true when deleted folder is parent of target path
			if (change.type === FileChangeType.DELETED) {
				return isEqualOrParent(resource, change.resource, !isLinux /* ignorecase */);
			}

			return isEqual(resource, change.resource, !isLinux /* ignorecase */);
		});
	}

	/**
	 * Returns the changes that describe added files.
	 */
	getAdded(): IFileChange[] {
		return this.getOfType(FileChangeType.ADDED);
	}

	/**
	 * Returns if this event contains added files.
	 */
	gotAdded(): boolean {
		return this.hasType(FileChangeType.ADDED);
	}

	/**
	 * Returns the changes that describe deleted files.
	 */
	getDeleted(): IFileChange[] {
		return this.getOfType(FileChangeType.DELETED);
	}

	/**
	 * Returns if this event contains deleted files.
	 */
	gotDeleted(): boolean {
		return this.hasType(FileChangeType.DELETED);
	}

	/**
	 * Returns the changes that describe updated files.
	 */
	getUpdated(): IFileChange[] {
		return this.getOfType(FileChangeType.UPDATED);
	}

	/**
	 * Returns if this event contains updated files.
	 */
	gotUpdated(): boolean {
		return this.hasType(FileChangeType.UPDATED);
	}

	private getOfType(type: FileChangeType): IFileChange[] {
		return this._changes.filter(change => change.type === type);
	}

	private hasType(type: FileChangeType): boolean {
		return this._changes.some(change => {
			return change.type === type;
		});
	}
}

export function isParent(path: string, candidate: string, ignoreCase?: boolean): boolean {
	if (!path || !candidate || path === candidate) {
		return false;
	}

	if (candidate.length > path.length) {
		return false;
	}

	if (candidate.charAt(candidate.length - 1) !== paths.nativeSep) {
		candidate += paths.nativeSep;
	}

	if (ignoreCase) {
		return startsWithIgnoreCase(path, candidate);
	}

	return path.indexOf(candidate) === 0;
}

export interface IBaseStat {

	/**
	 * The unified resource identifier of this file or folder.
	 */
	resource: URI;

	/**
	 * The name which is the last segement
	 * of the {{path}}.
	 */
	name: string;

	/**
	 * The last modifictaion date represented
	 * as millis from unix epoch.
	 */
	mtime: number;

	/**
	 * A unique identifier thet represents the
	 * current state of the file or directory.
	 */
	etag: string;

	/**
	 * The resource is readonly.
	 */
	isReadonly?: boolean;
}

/**
 * A file resource with meta information.
 */
export interface IFileStat extends IBaseStat {

	/**
	 * The resource is a directory. if {{true}}
	 * {{encoding}} has no meaning.
	 */
	isDirectory: boolean;

	/**
	 * The resource is a symbolic link.
	 */
	isSymbolicLink?: boolean;

	/**
	 * The children of the file stat or undefined if none.
	 */
	children?: IFileStat[];

	/**
	 * The size of the file if known.
	 */
	size?: number;
}

export interface IResolveFileResult {
	stat: IFileStat;
	success: boolean;
}

/**
 * Content and meta information of a file.
 */
export interface IContent extends IBaseStat {

	/**
	 * The content of a text file.
	 */
	value: string;

	/**
	 * The encoding of the content if known.
	 */
	encoding: string;
}

// this should eventually replace IContent such
// that we have a clear separation between content
// and metadata (TODO@Joh, TODO@Ben)
export interface IContentData {
	encoding: string;
	stream: IStringStream;
}

/**
 * A Stream emitting strings.
 */
export interface IStringStream {
	on(event: 'data', callback: (chunk: string) => void): void;
	on(event: 'error', callback: (err: any) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: string, callback: any): void;
}

/**
 * Text snapshot that works like an iterator.
 * Will try to return chunks of roughly ~64KB size.
 * Will return null when finished.
 */
export interface ITextSnapshot {
	read(): string | null;
}

export class StringSnapshot implements ITextSnapshot {
	private _value: string | null;
	constructor(value: string) {
		this._value = value;
	}
	read(): string | null {
		let ret = this._value;
		this._value = null;
		return ret;
	}
}
/**
 * Helper method to convert a snapshot into its full string form.
 */
export function snapshotToString(snapshot: ITextSnapshot): string {
	const chunks: string[] = [];
	let chunk: string | null;
	while (typeof (chunk = snapshot.read()) === 'string') {
		chunks.push(chunk);
	}

	return chunks.join('');
}

/**
 * Streamable content and meta information of a file.
 */
export interface IStreamContent extends IBaseStat {

	/**
	 * The streamable content of a text file.
	 */
	value: IStringStream;

	/**
	 * The encoding of the content if known.
	 */
	encoding: string;
}

export interface IResolveContentOptions {

	/**
	 * The optional acceptTextOnly parameter allows to fail this request early if the file
	 * contents are not textual.
	 */
	acceptTextOnly?: boolean;

	/**
	 * The optional etag parameter allows to return early from resolving the resource if
	 * the contents on disk match the etag. This prevents accumulated reading of resources
	 * that have been read already with the same etag.
	 * It is the task of the caller to makes sure to handle this error case from the promise.
	 */
	etag?: string;

	/**
	 * The optional encoding parameter allows to specify the desired encoding when resolving
	 * the contents of the file.
	 */
	encoding?: string;

	/**
	 * The optional guessEncoding parameter allows to guess encoding from content of the file.
	 */
	autoGuessEncoding?: boolean;

	/**
	 * Is an integer specifying where to begin reading from in the file. If position is null,
	 * data will be read from the current file position.
	 */
	position?: number;
}

export interface IUpdateContentOptions {

	/**
	 * The encoding to use when updating a file.
	 */
	encoding?: string;

	/**
	 * If set to true, will enforce the selected encoding and not perform any detection using BOMs.
	 */
	overwriteEncoding?: boolean;

	/**
	 * Whether to overwrite a file even if it is readonly.
	 */
	overwriteReadonly?: boolean;

	/**
	 * Wether to write to the file as elevated (admin) user. When setting this option a prompt will
	 * ask the user to authenticate as super user.
	 */
	writeElevated?: boolean;

	/**
	 * The last known modification time of the file. This can be used to prevent dirty writes.
	 */
	mtime?: number;

	/**
	 * The etag of the file. This can be used to prevent dirty writes.
	 */
	etag?: string;

	/**
	 * Run mkdirp before saving.
	 */
	mkdirp?: boolean;
}

export interface IResolveFileOptions {
	resolveTo?: URI[];
	resolveSingleChildDescendants?: boolean;
}

export interface ICreateFileOptions {

	/**
	 * Overwrite the file to create if it already exists on disk. Otherwise
	 * an error will be thrown (FILE_MODIFIED_SINCE).
	 */
	overwrite?: boolean;
}

export class FileOperationError extends Error {
	constructor(message: string, public fileOperationResult: FileOperationResult, public options?: IResolveContentOptions & IUpdateContentOptions & ICreateFileOptions) {
		super(message);
	}

	static isFileOperationError(obj: any): obj is FileOperationError {
		return obj instanceof Error && !isUndefinedOrNull((obj as FileOperationError).fileOperationResult);
	}
}

export const enum FileOperationResult {
	FILE_IS_BINARY,
	FILE_IS_DIRECTORY,
	FILE_NOT_FOUND,
	FILE_NOT_MODIFIED_SINCE,
	FILE_MODIFIED_SINCE,
	FILE_MOVE_CONFLICT,
	FILE_READ_ONLY,
	FILE_PERMISSION_DENIED,
	FILE_TOO_LARGE,
	FILE_INVALID_PATH,
	FILE_EXCEED_MEMORY_LIMIT
}

export const AutoSaveConfiguration = {
	OFF: 'off',
	AFTER_DELAY: 'afterDelay',
	ON_FOCUS_CHANGE: 'onFocusChange',
	ON_WINDOW_CHANGE: 'onWindowChange'
};

export const HotExitConfiguration = {
	OFF: 'off',
	ON_EXIT: 'onExit',
	ON_EXIT_AND_WINDOW_CLOSE: 'onExitAndWindowClose'
};

export const CONTENT_CHANGE_EVENT_BUFFER_DELAY = 1000;

export const FILES_ASSOCIATIONS_CONFIG = 'files.associations';
export const FILES_EXCLUDE_CONFIG = 'files.exclude';

export interface IFilesConfiguration {
	files: {
		associations: { [filepattern: string]: string };
		exclude: glob.IExpression;
		watcherExclude: { [filepattern: string]: boolean };
		encoding: string;
		autoGuessEncoding: boolean;
		defaultLanguage: string;
		trimTrailingWhitespace: boolean;
		autoSave: string;
		autoSaveDelay: number;
		eol: string;
		hotExit: string;
		useExperimentalFileWatcher: boolean;
	};
}

export const SUPPORTED_ENCODINGS: { [encoding: string]: { labelLong: string; labelShort: string; order: number; encodeOnly?: boolean; alias?: string } } = {
	utf8: {
		labelLong: 'UTF-8',
		labelShort: 'UTF-8',
		order: 1,
		alias: 'utf8bom'
	},
	utf8bom: {
		labelLong: 'UTF-8 with BOM',
		labelShort: 'UTF-8 with BOM',
		encodeOnly: true,
		order: 2,
		alias: 'utf8'
	},
	utf16le: {
		labelLong: 'UTF-16 LE',
		labelShort: 'UTF-16 LE',
		order: 3
	},
	utf16be: {
		labelLong: 'UTF-16 BE',
		labelShort: 'UTF-16 BE',
		order: 4
	},
	windows1252: {
		labelLong: 'Western (Windows 1252)',
		labelShort: 'Windows 1252',
		order: 5
	},
	iso88591: {
		labelLong: 'Western (ISO 8859-1)',
		labelShort: 'ISO 8859-1',
		order: 6
	},
	iso88593: {
		labelLong: 'Western (ISO 8859-3)',
		labelShort: 'ISO 8859-3',
		order: 7
	},
	iso885915: {
		labelLong: 'Western (ISO 8859-15)',
		labelShort: 'ISO 8859-15',
		order: 8
	},
	macroman: {
		labelLong: 'Western (Mac Roman)',
		labelShort: 'Mac Roman',
		order: 9
	},
	cp437: {
		labelLong: 'DOS (CP 437)',
		labelShort: 'CP437',
		order: 10
	},
	windows1256: {
		labelLong: 'Arabic (Windows 1256)',
		labelShort: 'Windows 1256',
		order: 11
	},
	iso88596: {
		labelLong: 'Arabic (ISO 8859-6)',
		labelShort: 'ISO 8859-6',
		order: 12
	},
	windows1257: {
		labelLong: 'Baltic (Windows 1257)',
		labelShort: 'Windows 1257',
		order: 13
	},
	iso88594: {
		labelLong: 'Baltic (ISO 8859-4)',
		labelShort: 'ISO 8859-4',
		order: 14
	},
	iso885914: {
		labelLong: 'Celtic (ISO 8859-14)',
		labelShort: 'ISO 8859-14',
		order: 15
	},
	windows1250: {
		labelLong: 'Central European (Windows 1250)',
		labelShort: 'Windows 1250',
		order: 16
	},
	iso88592: {
		labelLong: 'Central European (ISO 8859-2)',
		labelShort: 'ISO 8859-2',
		order: 17
	},
	cp852: {
		labelLong: 'Central European (CP 852)',
		labelShort: 'CP 852',
		order: 18
	},
	windows1251: {
		labelLong: 'Cyrillic (Windows 1251)',
		labelShort: 'Windows 1251',
		order: 19
	},
	cp866: {
		labelLong: 'Cyrillic (CP 866)',
		labelShort: 'CP 866',
		order: 20
	},
	iso88595: {
		labelLong: 'Cyrillic (ISO 8859-5)',
		labelShort: 'ISO 8859-5',
		order: 21
	},
	koi8r: {
		labelLong: 'Cyrillic (KOI8-R)',
		labelShort: 'KOI8-R',
		order: 22
	},
	koi8u: {
		labelLong: 'Cyrillic (KOI8-U)',
		labelShort: 'KOI8-U',
		order: 23
	},
	iso885913: {
		labelLong: 'Estonian (ISO 8859-13)',
		labelShort: 'ISO 8859-13',
		order: 24
	},
	windows1253: {
		labelLong: 'Greek (Windows 1253)',
		labelShort: 'Windows 1253',
		order: 25
	},
	iso88597: {
		labelLong: 'Greek (ISO 8859-7)',
		labelShort: 'ISO 8859-7',
		order: 26
	},
	windows1255: {
		labelLong: 'Hebrew (Windows 1255)',
		labelShort: 'Windows 1255',
		order: 27
	},
	iso88598: {
		labelLong: 'Hebrew (ISO 8859-8)',
		labelShort: 'ISO 8859-8',
		order: 28
	},
	iso885910: {
		labelLong: 'Nordic (ISO 8859-10)',
		labelShort: 'ISO 8859-10',
		order: 29
	},
	iso885916: {
		labelLong: 'Romanian (ISO 8859-16)',
		labelShort: 'ISO 8859-16',
		order: 30
	},
	windows1254: {
		labelLong: 'Turkish (Windows 1254)',
		labelShort: 'Windows 1254',
		order: 31
	},
	iso88599: {
		labelLong: 'Turkish (ISO 8859-9)',
		labelShort: 'ISO 8859-9',
		order: 32
	},
	windows1258: {
		labelLong: 'Vietnamese (Windows 1258)',
		labelShort: 'Windows 1258',
		order: 33
	},
	gbk: {
		labelLong: 'Simplified Chinese (GBK)',
		labelShort: 'GBK',
		order: 34
	},
	gb18030: {
		labelLong: 'Simplified Chinese (GB18030)',
		labelShort: 'GB18030',
		order: 35
	},
	cp950: {
		labelLong: 'Traditional Chinese (Big5)',
		labelShort: 'Big5',
		order: 36
	},
	big5hkscs: {
		labelLong: 'Traditional Chinese (Big5-HKSCS)',
		labelShort: 'Big5-HKSCS',
		order: 37
	},
	shiftjis: {
		labelLong: 'Japanese (Shift JIS)',
		labelShort: 'Shift JIS',
		order: 38
	},
	eucjp: {
		labelLong: 'Japanese (EUC-JP)',
		labelShort: 'EUC-JP',
		order: 39
	},
	euckr: {
		labelLong: 'Korean (EUC-KR)',
		labelShort: 'EUC-KR',
		order: 40
	},
	windows874: {
		labelLong: 'Thai (Windows 874)',
		labelShort: 'Windows 874',
		order: 41
	},
	iso885911: {
		labelLong: 'Latin/Thai (ISO 8859-11)',
		labelShort: 'ISO 8859-11',
		order: 42
	},
	koi8ru: {
		labelLong: 'Cyrillic (KOI8-RU)',
		labelShort: 'KOI8-RU',
		order: 43
	},
	koi8t: {
		labelLong: 'Tajik (KOI8-T)',
		labelShort: 'KOI8-T',
		order: 44
	},
	gb2312: {
		labelLong: 'Simplified Chinese (GB 2312)',
		labelShort: 'GB 2312',
		order: 45
	},
	cp865: {
		labelLong: 'Nordic DOS (CP 865)',
		labelShort: 'CP 865',
		order: 46
	},
	cp850: {
		labelLong: 'Western European DOS (CP 850)',
		labelShort: 'CP 850',
		order: 47
	}
};

export enum FileKind {
	FILE,
	FOLDER,
	ROOT_FOLDER
}

export const MIN_MAX_MEMORY_SIZE_MB = 2048;
export const FALLBACK_MAX_MEMORY_SIZE_MB = 4096;
