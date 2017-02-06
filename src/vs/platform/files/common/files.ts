/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import events = require('vs/base/common/events');
import { isLinux } from 'vs/base/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {
	_serviceBrand: any;

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
	resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat>;

	/**
	 *Finds out if a file identified by the resource exists.
	 */
	existsFile(resource: URI): TPromise<boolean>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the full value as string.
	 */
	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the value as a readable stream.
	 */
	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent>;

	/**
	 * Returns the contents of all files by the given array of file resources.
	 */
	resolveContents(resources: URI[]): TPromise<IContent[]>;

	/**
	 * Updates the content replacing its previous value.
	 */
	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat>;

	/**
	 * Moves the file to a new path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat>;

	/**
	 * Copies the file to a path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat>;

	/**
	 * Creates a new file with the given path. The returned promise
	 * will have the stat model object as a result.
	 *
	 * The optional parameter content can be used as value to fill into the new file.
	 */
	createFile(resource: URI, content?: string): TPromise<IFileStat>;

	/**
	 * Creates a new folder with the given path. The returned promise
	 * will have the stat model object as a result.
	 */
	createFolder(resource: URI): TPromise<IFileStat>;

	/**
	 * Renames the provided file to use the new name. The returned promise
	 * will have the stat model object as a result.
	 */
	rename(resource: URI, newName: string): TPromise<IFileStat>;

	/**
	 * Creates a new empty file if the given path does not exist and otherwise
	 * will set the mtime and atime of the file to the current date.
	 */
	touchFile(resource: URI): TPromise<IFileStat>;

	/**
	 * Deletes the provided file.  The optional useTrash parameter allows to
	 * move the file to trash.
	 */
	del(resource: URI, useTrash?: boolean): TPromise<void>;

	/**
	 * Imports the file to the parent identified by the resource.
	 */
	importFile(source: URI, targetFolder: URI): TPromise<IImportResult>;

	/**
	 * Allows to start a watcher that reports file change events on the provided resource.
	 */
	watchFileChanges(resource: URI): void;

	/**
	 * Allows to stop a watcher on the provided resource or absolute fs path.
	 */
	unwatchFileChanges(resource: URI): void;
	unwatchFileChanges(fsPath: string): void;

	/**
	 * Configures the file service with the provided options.
	 */
	updateOptions(options: any): void;

	/**
	 * Returns the preferred encoding to use for a given resource.
	 */
	getEncoding(resource: URI): string;

	/**
	 * Frees up any resources occupied by this service.
	 */
	dispose(): void;
}

export enum FileOperation {
	CREATE,
	DELETE,
	MOVE,
	COPY,
	IMPORT
}

export class FileOperationEvent {

	constructor(private _resource: URI, private _operation: FileOperation, private _target?: IFileStat) {
	}

	public get resource(): URI {
		return this._resource;
	}

	public get target(): IFileStat {
		return this._target;
	}

	public get operation(): FileOperation {
		return this._operation;
	}
}

/**
 * Possible changes that can occur to a file.
 */
export enum FileChangeType {
	UPDATED = 0,
	ADDED = 1,
	DELETED = 2
}

/**
 * Identifies a single change in a file.
 */
export interface IFileChange {

	/**
	 * The type of change that occured to the file.
	 */
	type: FileChangeType;

	/**
	 * The unified resource identifier of the file that changed.
	 */
	resource: URI;
}

export class FileChangesEvent extends events.Event {
	private _changes: IFileChange[];

	constructor(changes: IFileChange[]) {
		super();

		this._changes = changes;
	}

	public get changes() {
		return this._changes;
	}

	/**
	 * Returns true if this change event contains the provided file with the given change type. In case of
	 * type DELETED, this method will also return true if a folder got deleted that is the parent of the
	 * provided file path.
	 */
	public contains(resource: URI, type: FileChangeType): boolean {
		if (!resource) {
			return false;
		}

		return this._changes.some(change => {
			if (change.type !== type) {
				return false;
			}

			// For deleted also return true when deleted folder is parent of target path
			if (type === FileChangeType.DELETED) {
				return isEqual(resource.fsPath, change.resource.fsPath) || isParent(resource.fsPath, change.resource.fsPath);
			}

			return isEqual(resource.fsPath, change.resource.fsPath);
		});
	}

	/**
	 * Returns the changes that describe added files.
	 */
	public getAdded(): IFileChange[] {
		return this.getOfType(FileChangeType.ADDED);
	}

	/**
	 * Returns if this event contains added files.
	 */
	public gotAdded(): boolean {
		return this.hasType(FileChangeType.ADDED);
	}

	/**
	 * Returns the changes that describe deleted files.
	 */
	public getDeleted(): IFileChange[] {
		return this.getOfType(FileChangeType.DELETED);
	}

	/**
	 * Returns if this event contains deleted files.
	 */
	public gotDeleted(): boolean {
		return this.hasType(FileChangeType.DELETED);
	}

	/**
	 * Returns the changes that describe updated files.
	 */
	public getUpdated(): IFileChange[] {
		return this.getOfType(FileChangeType.UPDATED);
	}

	/**
	 * Returns if this event contains updated files.
	 */
	public gotUpdated(): boolean {
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

export function isEqual(path1: string, path2: string) {
	const identityEquals = (path1 === path2);
	if (isLinux || identityEquals) {
		return identityEquals;
	}

	return path1.toLowerCase() === path2.toLowerCase();
}

export function isParent(path: string, candidate: string): boolean {
	if (!isLinux) {
		path = path.toLowerCase();
		candidate = candidate.toLowerCase();
	}

	return path.indexOf(candidate + paths.nativeSep) === 0;
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
}

/**
 * A file resource with meta information.
 */
export interface IFileStat extends IBaseStat {

	/**
	 * The resource is a directory. Iff {{true}}
	 * {{encoding}} has no meaning.
	 */
	isDirectory: boolean;

	/**
	 * Return {{true}} when this is a directory
	 * that is not empty.
	 */
	hasChildren: boolean;

	/**
	 * The children of the file stat or undefined if none.
	 */
	children?: IFileStat[];

	/**
	 * The size of the file if known.
	 */
	size?: number;
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
	 * The optional etag parameter allows to return a 304 (Not Modified) if the etag matches
	 * with the remote resource. It is the task of the caller to makes sure to handle this
	 * error case from the promise.
	 */
	etag?: string;

	/**
	 * The optional encoding parameter allows to specify the desired encoding when resolving
	 * the contents of the file.
	 */
	encoding?: string;
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
	 * The last known modification time of the file. This can be used to prevent dirty writes.
	 */
	mtime?: number;

	/**
	 * The etag of the file. This can be used to prevent dirty writes.
	 */
	etag?: string;
}

export interface IResolveFileOptions {
	resolveTo?: URI[];
	resolveSingleChildDescendants?: boolean;
}

export interface IImportResult {
	stat: IFileStat;
	isNew: boolean;
}

export interface IFileOperationResult {
	message: string;
	fileOperationResult: FileOperationResult;
}

export enum FileOperationResult {
	FILE_IS_BINARY,
	FILE_IS_DIRECTORY,
	FILE_NOT_FOUND,
	FILE_NOT_MODIFIED_SINCE,
	FILE_MODIFIED_SINCE,
	FILE_MOVE_CONFLICT,
	FILE_READ_ONLY,
	FILE_TOO_LARGE,
	FILE_INVALID_PATH
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

export interface IFilesConfiguration {
	files: {
		associations: { [filepattern: string]: string };
		exclude: glob.IExpression;
		watcherExclude: { [filepattern: string]: boolean };
		encoding: string;
		trimTrailingWhitespace: boolean;
		autoSave: string;
		autoSaveDelay: number;
		eol: string;
		hotExit: string;
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
		labelLong: 'Chinese (GBK)',
		labelShort: 'GBK',
		order: 34
	},
	gb18030: {
		labelLong: 'Chinese (GB18030)',
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
	'koi8-ru': {
		labelLong: 'Cyrillic (KOI8-RU)',
		labelShort: 'KOI8-RU',
		order: 43
	},
	'koi8-t': {
		labelLong: 'Tajik (KOI8-T)',
		labelShort: 'KOI8-T',
		order: 44
	},
	GB2312: {
		labelLong: 'Simplified Chinese (GB 2312)',
		labelShort: 'GB 2312',
		order: 45
	}
};
