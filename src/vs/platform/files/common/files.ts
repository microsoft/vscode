/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import events = require('vs/base/common/events');
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {
	_serviceBrand: any;

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
	resolveFile(resource: URI, options?: IResolveFileOptions): winjs.TPromise<IFileStat>;

	/**
	 *Finds out if a file identified by the resource exists.
	 */
	existsFile(resource: URI): winjs.TPromise<boolean>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the full value as string.
	 */
	resolveContent(resource: URI, options?: IResolveContentOptions): winjs.TPromise<IContent>;

	/**
	 * Resolve the contents of a file identified by the resource.
	 *
	 * The returned object contains properties of the file and the value as a readable stream.
	 */
	resolveStreamContent(resource: URI, options?: IResolveContentOptions): winjs.TPromise<IStreamContent>;

	/**
	 * Returns the contents of all files by the given array of file resources.
	 */
	resolveContents(resources: URI[]): winjs.TPromise<IContent[]>;

	/**
	 * Updates the content replacing its previous value.
	 */
	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): winjs.TPromise<IFileStat>;

	/**
	 * Moves the file to a new path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	moveFile(source: URI, target: URI, overwrite?: boolean): winjs.TPromise<IFileStat>;

	/**
	 * Copies the file to a path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	copyFile(source: URI, target: URI, overwrite?: boolean): winjs.TPromise<IFileStat>;

	/**
	 * Creates a new file with the given path. The returned promise
	 * will have the stat model object as a result.
	 *
	 * The optional parameter content can be used as value to fill into the new file.
	 */
	createFile(resource: URI, content?: string): winjs.TPromise<IFileStat>;

	/**
	 * Creates a new folder with the given path. The returned promise
	 * will have the stat model object as a result.
	 */
	createFolder(resource: URI): winjs.TPromise<IFileStat>;

	/**
	 * Renames the provided file to use the new name. The returned promise
	 * will have the stat model object as a result.
	 */
	rename(resource: URI, newName: string): winjs.TPromise<IFileStat>;

	/**
	 * Deletes the provided file.  The optional useTrash parameter allows to
	 * move the file to trash.
	 */
	del(resource: URI, useTrash?: boolean): winjs.TPromise<void>;

	/**
	 * Imports the file to the parent identified by the resource.
	 */
	importFile(source: URI, targetFolder: URI): winjs.TPromise<IImportResult>;

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
	 * Frees up any resources occupied by this service.
	 */
	dispose(): void;
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
 * Possible events to subscribe to
 */
export const EventType = {

	/**
	* Send on file changes.
	*/
	FILE_CHANGES: 'files:fileChanges'
};

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

		return this.containsAny([resource], type);
	}

	/**
	 * Returns true if this change event contains any of the provided files with the given change type. In case of
	 * type DELETED, this method will also return true if a folder got deleted that is the parent of any of the
	 * provided file paths.
	 */
	public containsAny(resources: URI[], type: FileChangeType): boolean {
		if (!resources || !resources.length) {
			return false;
		}

		return this._changes.some((change) => {
			if (change.type !== type) {
				return false;
			}

			// For deleted also return true when deleted folder is parent of target path
			if (type === FileChangeType.DELETED) {
				return resources.some((a: URI) => {
					if (!a) {
						return false;
					}

					return paths.isEqualOrParent(a.fsPath, change.resource.fsPath);
				});
			}

			return resources.some((a: URI) => {
				if (!a) {
					return false;
				}

				return a.fsPath === change.resource.fsPath;
			});
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
		return this._changes.filter((change) => change.type === type);
	}

	private hasType(type: FileChangeType): boolean {
		return this._changes.some((change) => {
			return change.type === type;
		});
	}
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
	 * The mime type string. Applicate for files
	 * only.
	 */
	mime: string;
}

/**
 * A file resource with meta information.
 */
export interface IFileStat extends IBaseStat {

	/**
	 * The resource is a directory. Iff {{true}}
	 * {{mime}} and {{encoding}} have no meaning.
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
	FILE_TOO_LARGE
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const AutoSaveConfiguration = {
	OFF: 'off',
	AFTER_DELAY: 'afterDelay',
	ON_FOCUS_CHANGE: 'onFocusChange'
};

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
	windows1251: {
		labelLong: 'Cyrillic (Windows 1251)',
		labelShort: 'Windows 1251',
		order: 18
	},
	cp866: {
		labelLong: 'Cyrillic (CP 866)',
		labelShort: 'CP 866',
		order: 19
	},
	iso88595: {
		labelLong: 'Cyrillic (ISO 8859-5)',
		labelShort: 'ISO 8859-5',
		order: 20
	},
	koi8r: {
		labelLong: 'Cyrillic (KOI8-R)',
		labelShort: 'KOI8-R',
		order: 21
	},
	koi8u: {
		labelLong: 'Cyrillic (KOI8-U)',
		labelShort: 'KOI8-U',
		order: 22
	},
	iso885913: {
		labelLong: 'Estonian (ISO 8859-13)',
		labelShort: 'ISO 8859-13',
		order: 23
	},
	windows1253: {
		labelLong: 'Greek (Windows 1253)',
		labelShort: 'Windows 1253',
		order: 24
	},
	iso88597: {
		labelLong: 'Greek (ISO 8859-7)',
		labelShort: 'ISO 8859-7',
		order: 25
	},
	windows1255: {
		labelLong: 'Hebrew (Windows 1255)',
		labelShort: 'Windows 1255',
		order: 26
	},
	iso88598: {
		labelLong: 'Hebrew (ISO 8859-8)',
		labelShort: 'ISO 8859-8',
		order: 27
	},
	iso885910: {
		labelLong: 'Nordic (ISO 8859-10)',
		labelShort: 'ISO 8859-10',
		order: 28
	},
	iso885916: {
		labelLong: 'Romanian (ISO 8859-16)',
		labelShort: 'ISO 8859-16',
		order: 29
	},
	windows1254: {
		labelLong: 'Turkish (Windows 1254)',
		labelShort: 'Windows 1254',
		order: 30
	},
	iso88599: {
		labelLong: 'Turkish (ISO 8859-9)',
		labelShort: 'ISO 8859-9',
		order: 31
	},
	windows1258: {
		labelLong: 'Vietnamese (Windows 1258)',
		labelShort: 'Windows 1258',
		order: 32
	},
	gbk: {
		labelLong: 'Chinese (GBK)',
		labelShort: 'GBK',
		order: 33
	},
	gb18030: {
		labelLong: 'Chinese (GB18030)',
		labelShort: 'GB18030',
		order: 34
	},
	cp950: {
		labelLong: 'Traditional Chinese (Big5)',
		labelShort: 'Big5',
		order: 35
	},
	big5hkscs: {
		labelLong: 'Traditional Chinese (Big5-HKSCS)',
		labelShort: 'Big5-HKSCS',
		order: 36
	},
	shiftjis: {
		labelLong: 'Japanese (Shift JIS)',
		labelShort: 'Shift JIS',
		order: 37
	},
	eucjp: {
		labelLong: 'Japanese (EUC-JP)',
		labelShort: 'EUC-JP',
		order: 38
	},
	euckr: {
		labelLong: 'Korean (EUC-KR)',
		labelShort: 'EUC-KR',
		order: 39
	},
	windows874: {
		labelLong: 'Thai (Windows 874)',
		labelShort: 'Windows 874',
		order: 40
	}
	, iso885911: {
		labelLong: 'Latin/Thai (ISO 8859-11)',
		labelShort: 'ISO 8859-11',
		order: 41
	},
	'koi8-ru': {
		labelLong: 'Cyrillic (KOI8-RU)',
		labelShort: 'KOI8-RU',
		order: 42
	},
	'koi8-t': {
		labelLong: 'Tajik (KOI8-T)',
		labelShort: 'KOI8-T',
		order: 43
	},
	GB2312: {
		labelLong: 'Simplified Chinese (GB 2312)',
		labelShort: 'GB 2312',
		order: 44
	}
};