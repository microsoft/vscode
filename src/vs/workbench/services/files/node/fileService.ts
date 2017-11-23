/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import paths = require('path');
import fs = require('fs');
import os = require('os');
import crypto = require('crypto');
import assert = require('assert');

import { isParent, FileOperation, FileOperationEvent, IContent, IFileService, IResolveFileOptions, IResolveFileResult, IResolveContentOptions, IFileStat, IStreamContent, FileOperationError, FileOperationResult, IUpdateContentOptions, FileChangeType, IImportResult, FileChangesEvent, ICreateFileOptions, IContentData } from 'vs/platform/files/common/files';
import { MAX_FILE_SIZE } from 'vs/platform/files/node/files';
import { isEqualOrParent } from 'vs/base/common/paths';
import { ResourceMap } from 'vs/base/common/map';
import arrays = require('vs/base/common/arrays');
import baseMime = require('vs/base/common/mime');
import { TPromise } from 'vs/base/common/winjs.base';
import objects = require('vs/base/common/objects');
import extfs = require('vs/base/node/extfs');
import { nfcall, ThrottledDelayer } from 'vs/base/common/async';
import uri from 'vs/base/common/uri';
import nls = require('vs/nls');
import { isWindows, isLinux } from 'vs/base/common/platform';
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import pfs = require('vs/base/node/pfs');
import encoding = require('vs/base/node/encoding');
import { detectMimeAndEncodingFromBuffer, IMimeAndEncoding } from 'vs/base/node/mime';
import flow = require('vs/base/node/flow');
import { FileWatcher as UnixWatcherService } from 'vs/workbench/services/files/node/watcher/unix/watcherService';
import { FileWatcher as WindowsWatcherService } from 'vs/workbench/services/files/node/watcher/win32/watcherService';
import { toFileChangesEvent, normalize, IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';
import Event, { Emitter } from 'vs/base/common/event';
import { FileWatcher as NsfwWatcherService } from 'vs/workbench/services/files/node/watcher/nsfw/watcherService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { getBaseLabel } from 'vs/base/common/labels';

export interface IEncodingOverride {
	resource: uri;
	encoding: string;
}

export interface IFileServiceOptions {
	tmpDir?: string;
	errorLogger?: (msg: string) => void;
	encodingOverride?: IEncodingOverride[];
	watcherIgnoredPatterns?: string[];
	disableWatcher?: boolean;
	verboseLogging?: boolean;
	useExperimentalFileWatcher?: boolean;
}

function etag(stat: fs.Stats): string;
function etag(size: number, mtime: number): string;
function etag(arg1: any, arg2?: any): string {
	let size: number;
	let mtime: number;
	if (typeof arg2 === 'number') {
		size = arg1;
		mtime = arg2;
	} else {
		size = (<fs.Stats>arg1).size;
		mtime = (<fs.Stats>arg1).mtime.getTime();
	}

	return `"${crypto.createHash('sha1').update(String(size) + String(mtime)).digest('hex')}"`;
}

class BufferPool {

	static _64K = new BufferPool(64 * 1024, 5);

	constructor(
		readonly bufferSize: number,
		private readonly _capacity: number,
		private readonly _free: Buffer[] = [],
	) {
		//
	}

	acquire(): Buffer {
		if (this._free.length === 0) {
			return Buffer.allocUnsafe(this.bufferSize);
		} else {
			return this._free.shift();
		}
	}

	release(buf: Buffer): void {
		if (this._free.length <= this._capacity) {
			this._free.push(buf);
		}
	}
}

export class FileService implements IFileService {

	public _serviceBrand: any;

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static readonly FS_REWATCH_DELAY = 300; // delay to rewatch a file that was renamed or deleted (in ms)

	private tmpPath: string;
	private options: IFileServiceOptions;

	private _onFileChanges: Emitter<FileChangesEvent>;
	private _onAfterOperation: Emitter<FileOperationEvent>;

	private toDispose: IDisposable[];

	private activeFileChangesWatchers: ResourceMap<fs.FSWatcher>;
	private fileChangesWatchDelayer: ThrottledDelayer<void>;
	private undeliveredRawFileChangesEvents: IRawFileChange[];

	private activeWorkspaceFileChangeWatcher: IDisposable;

	constructor(
		private contextService: IWorkspaceContextService,
		private textResourceConfigurationService: ITextResourceConfigurationService,
		private configurationService: IConfigurationService,
		private lifecycleService: ILifecycleService,
		options: IFileServiceOptions
	) {
		this.toDispose = [];
		this.options = options || Object.create(null);
		this.tmpPath = this.options.tmpDir || os.tmpdir();

		this._onFileChanges = new Emitter<FileChangesEvent>();
		this.toDispose.push(this._onFileChanges);

		this._onAfterOperation = new Emitter<FileOperationEvent>();
		this.toDispose.push(this._onAfterOperation);

		if (!this.options.errorLogger) {
			this.options.errorLogger = console.error;
		}

		this.activeFileChangesWatchers = new ResourceMap<fs.FSWatcher>();
		this.fileChangesWatchDelayer = new ThrottledDelayer<void>(FileService.FS_EVENT_DELAY);
		this.undeliveredRawFileChangesEvents = [];

		lifecycleService.when(LifecyclePhase.Running).then(() => {
			this.setupFileWatching(); // wait until we are fully running before starting file watchers
		});

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.contextService.onDidChangeWorkbenchState(() => {
			if (this.lifecycleService.phase === LifecyclePhase.Running) {
				this.setupFileWatching();
			}
		}));
	}

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	public updateOptions(options: IFileServiceOptions): void {
		if (options) {
			objects.mixin(this.options, options); // overwrite current options
		}
	}

	private setupFileWatching(): void {

		// dispose old if any
		if (this.activeWorkspaceFileChangeWatcher) {
			this.activeWorkspaceFileChangeWatcher.dispose();
		}

		// Return if not aplicable
		const workbenchState = this.contextService.getWorkbenchState();
		if (workbenchState === WorkbenchState.EMPTY || this.options.disableWatcher) {
			return;
		}

		// new watcher: use it if setting tells us so or we run in multi-root environment
		if (this.options.useExperimentalFileWatcher || workbenchState === WorkbenchState.WORKSPACE) {
			this.activeWorkspaceFileChangeWatcher = toDisposable(this.setupNsfwWorkspaceWatching().startWatching());
		}

		// old watcher
		else {
			if (isWindows) {
				this.activeWorkspaceFileChangeWatcher = toDisposable(this.setupWin32WorkspaceWatching().startWatching());
			} else {
				this.activeWorkspaceFileChangeWatcher = toDisposable(this.setupUnixWorkspaceWatching().startWatching());
			}
		}
	}

	private setupWin32WorkspaceWatching(): WindowsWatcherService {
		return new WindowsWatcherService(this.contextService, this.options.watcherIgnoredPatterns, e => this._onFileChanges.fire(e), this.options.errorLogger, this.options.verboseLogging);
	}

	private setupUnixWorkspaceWatching(): UnixWatcherService {
		return new UnixWatcherService(this.contextService, this.options.watcherIgnoredPatterns, e => this._onFileChanges.fire(e), this.options.errorLogger, this.options.verboseLogging);
	}

	private setupNsfwWorkspaceWatching(): NsfwWatcherService {
		return new NsfwWatcherService(this.contextService, this.configurationService, e => this._onFileChanges.fire(e), this.options.errorLogger, this.options.verboseLogging);
	}

	public resolveFile(resource: uri, options?: IResolveFileOptions): TPromise<IFileStat> {
		return this.resolve(resource, options);
	}

	public resolveFiles(toResolve: { resource: uri, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(resourceAndOptions => this.resolve(resourceAndOptions.resource, resourceAndOptions.options)
			.then(stat => ({ stat, success: true }), error => ({ stat: undefined, success: false }))));
	}

	public existsFile(resource: uri): TPromise<boolean> {
		return this.resolveFile(resource).then(() => true, () => false);
	}

	public resolveContent(resource: uri, options?: IResolveContentOptions): TPromise<IContent> {
		return this.resolveStreamContent(resource, options).then(streamContent => {
			return new TPromise<IContent>((resolve, reject) => {

				const result: IContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					encoding: streamContent.encoding,
					value: ''
				};

				streamContent.value.on('data', chunk => result.value += chunk);
				streamContent.value.on('error', err => reject(err));
				streamContent.value.on('end', _ => resolve(result));

				return result;
			});
		});
	}

	public resolveStreamContent(resource: uri, options?: IResolveContentOptions): TPromise<IStreamContent> {

		// Guard early against attempts to resolve an invalid file path
		if (resource.scheme !== 'file' || !resource.fsPath) {
			return TPromise.wrapError<IStreamContent>(new FileOperationError(
				nls.localize('fileInvalidPath', "Invalid file resource ({0})", resource.toString(true)),
				FileOperationResult.FILE_INVALID_PATH
			));
		}

		const result: IStreamContent = {
			resource: undefined,
			name: undefined,
			mtime: undefined,
			etag: undefined,
			encoding: undefined,
			value: undefined
		};

		const contentResolverToken = new CancellationTokenSource();

		const onStatError = error => {

			// error: stop reading the file the stat and content resolve call
			// usually race, mostly likely the stat call will win and cancel
			// the content call
			contentResolverToken.cancel();

			// forward error
			return TPromise.wrapError(error);
		};

		const statsPromise = this.resolveFile(resource).then(stat => {
			result.resource = stat.resource;
			result.name = stat.name;
			result.mtime = stat.mtime;
			result.etag = stat.etag;

			// Return early if resource is a directory
			if (stat.isDirectory) {
				return onStatError(new FileOperationError(
					nls.localize('fileIsDirectoryError', "File is directory"),
					FileOperationResult.FILE_IS_DIRECTORY
				));
			}

			// Return early if file not modified since
			if (options && options.etag && options.etag === stat.etag) {
				return onStatError(new FileOperationError(
					nls.localize('fileNotModifiedError', "File not modified since"),
					FileOperationResult.FILE_NOT_MODIFIED_SINCE
				));
			}

			// Return early if file is too large to load
			if (typeof stat.size === 'number' && stat.size > MAX_FILE_SIZE) {
				return onStatError(new FileOperationError(
					nls.localize('fileTooLargeError', "File too large to open"),
					FileOperationResult.FILE_TOO_LARGE
				));
			}

			return undefined;
		}, err => {

			// Wrap file not found errors
			if (err.code === 'ENOENT') {
				return onStatError(new FileOperationError(
					nls.localize('fileNotFoundError', "File not found ({0})", resource.toString(true)),
					FileOperationResult.FILE_NOT_FOUND
				));
			}

			return onStatError(err);
		});

		let completePromise: Thenable<any>;

		// await the stat iff we already have an etag so that we compare the
		// etag from the stat before we actually read the file again.
		if (options && options.etag) {
			completePromise = statsPromise.then(() => {
				return this.fillInContents(result, resource, options, contentResolverToken.token); // Waterfall -> only now resolve the contents
			});
		}

		// a fresh load without a previous etag which means we can resolve the file stat
		// and the content at the same time, avoiding the waterfall.
		else {
			completePromise = Promise.all([statsPromise, this.fillInContents(result, resource, options, contentResolverToken.token)]);
		}

		return TPromise.wrap(completePromise).then(() => result);
	}

	private fillInContents(content: IStreamContent, resource: uri, options: IResolveContentOptions, token: CancellationToken): Thenable<any> {
		return this.resolveFileData(resource, options, token).then(data => {
			content.encoding = data.encoding;
			content.value = data.stream;
		});
	}

	//#region data stream


	private resolveFileData(resource: uri, options: IResolveContentOptions, token: CancellationToken): Thenable<IContentData> {

		const chunkBuffer = BufferPool._64K.acquire();

		const result: IContentData = {
			encoding: undefined,
			stream: undefined,
		};

		return new Promise<IContentData>((resolve, reject) => {
			fs.open(this.toAbsolutePath(resource), 'r', (err, fd) => {
				if (err) {
					if (err.code === 'ENOENT') {
						// Wrap file not found errors
						err = new FileOperationError(
							nls.localize('fileNotFoundError', "File not found ({0})", resource.toString(true)),
							FileOperationResult.FILE_NOT_FOUND
						);
					}

					return reject(err);
				}

				let decoder: NodeJS.ReadWriteStream;
				let totalBytesRead = 0;

				const finish = (err?: any) => {

					if (err) {
						if (err.code === 'EISDIR') {
							// Wrap EISDIR errors (fs.open on a directory works, but you cannot read from it)
							err = new FileOperationError(
								nls.localize('fileIsDirectoryError', "File is directory"),
								FileOperationResult.FILE_IS_DIRECTORY
							);
						}
						if (decoder) {
							// If the decoder already started, we have to emit the error through it as
							// event because the promise is already resolved!
							decoder.emit('error', err);
						} else {
							reject(err);
						}
					}
					if (decoder) {
						decoder.end();
					}

					// return the shared buffer
					BufferPool._64K.release(chunkBuffer);

					if (fd) {
						fs.close(fd, err => {
							if (err) {
								this.options.errorLogger(`resolveFileData#close(): ${err.toString()}`);
							}
						});
					}
				};

				const handleChunk = (bytesRead) => {
					if (token.isCancellationRequested) {
						// cancellation -> finish
						finish(new Error('cancelled'));
					} else if (bytesRead === 0) {
						// no more data -> finish
						finish();
					} else if (bytesRead < chunkBuffer.length) {
						// write the sub-part of data we received -> repeat
						decoder.write(chunkBuffer.slice(0, bytesRead), readChunk);
					} else {
						// write all data we received -> repeat
						decoder.write(chunkBuffer, readChunk);
					}
				};

				const readChunk = () => {
					fs.read(fd, chunkBuffer, 0, chunkBuffer.length, null, (err, bytesRead) => {
						totalBytesRead += bytesRead;

						if (totalBytesRead > MAX_FILE_SIZE) {
							// stop when reading too much
							finish(new FileOperationError(
								nls.localize('fileTooLargeError', "File too large to open"),
								FileOperationResult.FILE_TOO_LARGE
							));
						} else if (err) {
							// some error happened
							finish(err);

						} else if (decoder) {
							// pass on to decoder
							handleChunk(bytesRead);

						} else {
							// when receiving the first chunk of data we need to create the
							// decoding stream which is then used to drive the string stream.
							TPromise.as(detectMimeAndEncodingFromBuffer(
								{ buffer: chunkBuffer, bytesRead },
								options && options.autoGuessEncoding || this.configuredAutoGuessEncoding(resource)
							)).then(value => {

								if (options && options.acceptTextOnly && value.mimes.indexOf(baseMime.MIME_BINARY) >= 0) {
									// Return error early if client only accepts text and this is not text
									finish(new FileOperationError(
										nls.localize('fileBinaryError', "File seems to be binary and cannot be opened as text"),
										FileOperationResult.FILE_IS_BINARY
									));

								} else {
									result.encoding = this.getEncoding(resource, this.getPeferredEncoding(resource, options, value));
									result.stream = decoder = encoding.decodeStream(result.encoding);
									resolve(result);
									handleChunk(bytesRead);
								}

							}).then(undefined, err => {
								// failed to get encoding
								finish(err);
							});
						}
					});
				};

				// start reading
				readChunk();
			});
		});
	}

	//#endregion

	public updateContent(resource: uri, value: string, options: IUpdateContentOptions = Object.create(null)): TPromise<IFileStat> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file
		return this.checkFile(absolutePath, options).then(exists => {
			let createParentsPromise: TPromise<boolean>;
			if (exists) {
				createParentsPromise = TPromise.as(null);
			} else {
				createParentsPromise = pfs.mkdirp(paths.dirname(absolutePath));
			}

			// 2.) create parents as needed
			return createParentsPromise.then(() => {
				const encodingToWrite = this.getEncoding(resource, options.encoding);
				let addBomPromise: TPromise<boolean> = TPromise.as(false);

				// UTF_16 BE and LE as well as UTF_8 with BOM always have a BOM
				if (encodingToWrite === encoding.UTF16be || encodingToWrite === encoding.UTF16le || encodingToWrite === encoding.UTF8_with_bom) {
					addBomPromise = TPromise.as(true);
				}

				// Existing UTF-8 file: check for options regarding BOM
				else if (exists && encodingToWrite === encoding.UTF8) {
					if (options.overwriteEncoding) {
						addBomPromise = TPromise.as(false); // if we are to overwrite the encoding, we do not preserve it if found
					} else {
						addBomPromise = encoding.detectEncodingByBOM(absolutePath).then(enc => enc === encoding.UTF8); // otherwise preserve it if found
					}
				}

				// 3.) check to add UTF BOM
				return addBomPromise.then(addBom => {

					// 4.) set contents and resolve
					return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encodingToWrite, { mode: 0o666, flag: 'w' }).then(undefined, error => {
						if (!exists || error.code !== 'EPERM' || !isWindows) {
							return TPromise.wrapError(error);
						}

						// On Windows and if the file exists with an EPERM error, we try a different strategy of saving the file
						// by first truncating the file and then writing with r+ mode. This helps to save hidden files on Windows
						// (see https://github.com/Microsoft/vscode/issues/931)

						// 5.) truncate
						return pfs.truncate(absolutePath, 0).then(() => {

							// 6.) set contents (this time with r+ mode) and resolve again
							return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encodingToWrite, { mode: 0o666, flag: 'r+' });
						});
					});
				});
			});
		});
	}

	private doSetContentsAndResolve(resource: uri, absolutePath: string, value: string, addBOM: boolean, encodingToWrite: string, options: { mode?: number; flag?: string; }): TPromise<IFileStat> {
		let writeFilePromise: TPromise<void>;

		// Write fast if we do UTF 8 without BOM
		if (!addBOM && encodingToWrite === encoding.UTF8) {
			writeFilePromise = pfs.writeFile(absolutePath, value, options);
		}

		// Otherwise use encoding lib
		else {
			const encoded = encoding.encode(value, encodingToWrite, { addBOM });
			writeFilePromise = pfs.writeFile(absolutePath, encoded, options);
		}

		// set contents
		return writeFilePromise.then(() => {

			// resolve
			return this.resolve(resource);
		});
	}

	public createFile(resource: uri, content: string = '', options: ICreateFileOptions = Object.create(null)): TPromise<IFileStat> {
		const absolutePath = this.toAbsolutePath(resource);

		let checkFilePromise: TPromise<boolean>;
		if (options.overwrite) {
			checkFilePromise = TPromise.as(false);
		} else {
			checkFilePromise = pfs.exists(absolutePath);
		}

		// Check file exists
		return checkFilePromise.then(exists => {
			if (exists && !options.overwrite) {
				return TPromise.wrapError<IFileStat>(new FileOperationError(
					nls.localize('fileExists', "File to create already exists ({0})", resource.toString(true)),
					FileOperationResult.FILE_MODIFIED_SINCE
				));
			}

			// Create file
			return this.updateContent(resource, content).then(result => {

				// Events
				this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, result));

				return result;
			});
		});
	}

	public createFolder(resource: uri): TPromise<IFileStat> {

		// 1.) Create folder
		const absolutePath = this.toAbsolutePath(resource);
		return pfs.mkdirp(absolutePath).then(() => {

			// 2.) Resolve
			return this.resolve(resource).then(result => {

				// Events
				this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, result));

				return result;
			});
		});
	}

	public touchFile(resource: uri): TPromise<IFileStat> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file
		return this.checkFile(absolutePath).then(exists => {
			let createPromise: TPromise<IFileStat>;
			if (exists) {
				createPromise = TPromise.as(null);
			} else {
				createPromise = this.createFile(resource);
			}

			// 2.) create file as needed
			return createPromise.then(() => {

				// 3.) update atime and mtime
				return pfs.touch(absolutePath).then(() => {

					// 4.) resolve
					return this.resolve(resource);
				});
			});
		});
	}

	public rename(resource: uri, newName: string): TPromise<IFileStat> {
		const newPath = paths.join(paths.dirname(resource.fsPath), newName);

		return this.moveFile(resource, uri.file(newPath));
	}

	public moveFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.moveOrCopyFile(source, target, false, overwrite);
	}

	public copyFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.moveOrCopyFile(source, target, true, overwrite);
	}

	private moveOrCopyFile(source: uri, target: uri, keepCopy: boolean, overwrite: boolean): TPromise<IFileStat> {
		const sourcePath = this.toAbsolutePath(source);
		const targetPath = this.toAbsolutePath(target);

		// 1.) move / copy
		return this.doMoveOrCopyFile(sourcePath, targetPath, keepCopy, overwrite).then(() => {

			// 2.) resolve
			return this.resolve(target).then(result => {

				// Events
				this._onAfterOperation.fire(new FileOperationEvent(source, keepCopy ? FileOperation.COPY : FileOperation.MOVE, result));

				return result;
			});
		});
	}

	private doMoveOrCopyFile(sourcePath: string, targetPath: string, keepCopy: boolean, overwrite: boolean): TPromise<boolean /* exists */> {

		// 1.) check if target exists
		return pfs.exists(targetPath).then(exists => {
			const isCaseRename = sourcePath.toLowerCase() === targetPath.toLowerCase();
			const isSameFile = sourcePath === targetPath;

			// Return early with conflict if target exists and we are not told to overwrite
			if (exists && !isCaseRename && !overwrite) {
				return TPromise.wrapError<boolean>(new FileOperationError(nls.localize('fileMoveConflict', "Unable to move/copy. File already exists at destination."), FileOperationResult.FILE_MOVE_CONFLICT));
			}

			// 2.) make sure target is deleted before we move/copy unless this is a case rename of the same file
			let deleteTargetPromise = TPromise.wrap<void>(void 0);
			if (exists && !isCaseRename) {
				if (isEqualOrParent(sourcePath, targetPath, !isLinux /* ignorecase */)) {
					return TPromise.wrapError<boolean>(new Error(nls.localize('unableToMoveCopyError', "Unable to move/copy. File would replace folder it is contained in."))); // catch this corner case!
				}

				deleteTargetPromise = this.del(uri.file(targetPath));
			}

			return deleteTargetPromise.then(() => {

				// 3.) make sure parents exists
				return pfs.mkdirp(paths.dirname(targetPath)).then(() => {

					// 4.) copy/move
					if (isSameFile) {
						return TPromise.wrap(null);
					} else if (keepCopy) {
						return nfcall(extfs.copy, sourcePath, targetPath);
					} else {
						return nfcall(extfs.mv, sourcePath, targetPath);
					}
				}).then(() => exists);
			});
		});
	}

	public importFile(source: uri, targetFolder: uri): TPromise<IImportResult> {
		const sourcePath = this.toAbsolutePath(source);
		const targetResource = uri.file(paths.join(targetFolder.fsPath, paths.basename(source.fsPath)));
		const targetPath = this.toAbsolutePath(targetResource);

		// 1.) resolve
		return pfs.stat(sourcePath).then(stat => {
			if (stat.isDirectory()) {
				return TPromise.wrapError<IImportResult>(new Error(nls.localize('foldersCopyError', "Folders cannot be copied into the workspace. Please select individual files to copy them."))); // for now we do not allow to import a folder into a workspace
			}

			// 2.) copy
			return this.doMoveOrCopyFile(sourcePath, targetPath, true, true).then(exists => {

				// 3.) resolve
				return this.resolve(targetResource).then(stat => {

					// Events
					this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.IMPORT, stat));

					return <IImportResult>{ isNew: !exists, stat: stat };
				});
			});
		});
	}

	public del(resource: uri): TPromise<void> {
		const absolutePath = this.toAbsolutePath(resource);

		return pfs.del(absolutePath, this.tmpPath).then(() => {

			// Events
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
		});
	}

	// Helpers

	private toAbsolutePath(arg1: uri | IFileStat): string {
		let resource: uri;
		if (arg1 instanceof uri) {
			resource = <uri>arg1;
		} else {
			resource = (<IFileStat>arg1).resource;
		}

		assert.ok(resource && resource.scheme === 'file', 'Invalid resource: ' + resource);

		return paths.normalize(resource.fsPath);
	}

	private resolve(resource: uri, options: IResolveFileOptions = Object.create(null)): TPromise<IFileStat> {
		return this.toStatResolver(resource)
			.then(model => model.resolve(options));
	}

	private toStatResolver(resource: uri): TPromise<StatResolver> {
		const absolutePath = this.toAbsolutePath(resource);

		return pfs.stat(absolutePath).then(stat => {
			return new StatResolver(resource, stat.isDirectory(), stat.mtime.getTime(), stat.size, this.options.verboseLogging);
		});
	}

	private getPeferredEncoding(resource: uri, options: IResolveContentOptions, detected: IMimeAndEncoding): string {
		let preferredEncoding: string;
		if (options && options.encoding) {
			if (detected.encoding === encoding.UTF8 && options.encoding === encoding.UTF8) {
				preferredEncoding = encoding.UTF8_with_bom; // indicate the file has BOM if we are to resolve with UTF 8
			} else {
				preferredEncoding = options.encoding; // give passed in encoding highest priority
			}
		} else if (detected.encoding) {
			if (detected.encoding === encoding.UTF8) {
				preferredEncoding = encoding.UTF8_with_bom; // if we detected UTF-8, it can only be because of a BOM
			} else {
				preferredEncoding = detected.encoding;
			}
		} else if (this.configuredEncoding(resource) === encoding.UTF8_with_bom) {
			preferredEncoding = encoding.UTF8; // if we did not detect UTF 8 BOM before, this can only be UTF 8 then
		}
		return preferredEncoding;
	}

	public getEncoding(resource: uri, preferredEncoding?: string): string {
		let fileEncoding: string;

		const override = this.getEncodingOverride(resource);
		if (override) {
			fileEncoding = override;
		} else if (preferredEncoding) {
			fileEncoding = preferredEncoding;
		} else {
			fileEncoding = this.configuredEncoding(resource);
		}

		if (!fileEncoding || !encoding.encodingExists(fileEncoding)) {
			fileEncoding = encoding.UTF8; // the default is UTF 8
		}

		return fileEncoding;
	}

	private configuredAutoGuessEncoding(resource: uri): boolean {
		return this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding');
	}

	private configuredEncoding(resource: uri): string {
		return this.textResourceConfigurationService.getValue(resource, 'files.encoding');
	}

	private getEncodingOverride(resource: uri): string {
		if (resource && this.options.encodingOverride && this.options.encodingOverride.length) {
			for (let i = 0; i < this.options.encodingOverride.length; i++) {
				const override = this.options.encodingOverride[i];

				// check if the resource is a child of the resource with override and use
				// the provided encoding in that case
				if (isParent(resource.fsPath, override.resource.fsPath, !isLinux /* ignorecase */)) {
					return override.encoding;
				}
			}
		}

		return null;
	}

	private checkFile(absolutePath: string, options: IUpdateContentOptions = Object.create(null)): TPromise<boolean /* exists */> {
		return pfs.exists(absolutePath).then(exists => {
			if (exists) {
				return pfs.stat(absolutePath).then(stat => {
					if (stat.isDirectory()) {
						return TPromise.wrapError<boolean>(new Error('Expected file is actually a directory'));
					}

					// Dirty write prevention
					if (typeof options.mtime === 'number' && typeof options.etag === 'string' && options.mtime < stat.mtime.getTime()) {

						// Find out if content length has changed
						if (options.etag !== etag(stat.size, options.mtime)) {
							return TPromise.wrapError<boolean>(new FileOperationError(nls.localize('fileModifiedError', "File Modified Since"), FileOperationResult.FILE_MODIFIED_SINCE));
						}
					}

					let mode = stat.mode;
					const readonly = !(mode & 128);

					// Throw if file is readonly and we are not instructed to overwrite
					if (readonly && !options.overwriteReadonly) {
						return TPromise.wrapError<boolean>(new FileOperationError(
							nls.localize('fileReadOnlyError', "File is Read Only"),
							FileOperationResult.FILE_READ_ONLY
						));
					}

					if (readonly) {
						mode = mode | 128;
						return pfs.chmod(absolutePath, mode).then(() => exists);
					}

					return TPromise.as<boolean>(exists);
				});
			}

			return TPromise.as<boolean>(exists);
		});
	}

	public watchFileChanges(resource: uri): void {
		assert.ok(resource && resource.scheme === 'file', `Invalid resource for watching: ${resource}`);

		// Create or get watcher for provided path
		let watcher = this.activeFileChangesWatchers.get(resource);
		if (!watcher) {
			const fsPath = resource.fsPath;
			const fsName = paths.basename(resource.fsPath);

			try {
				watcher = extfs.watch(fsPath, (eventType: string, filename: string) => {
					const renamedOrDeleted = ((filename && filename !== fsName) || eventType === 'rename');

					// The file was either deleted or renamed. Many tools apply changes to files in an
					// atomic way ("Atomic Save") by first renaming the file to a temporary name and then
					// renaming it back to the original name. Our watcher will detect this as a rename
					// and then stops to work on Mac and Linux because the watcher is applied to the
					// inode and not the name. The fix is to detect this case and trying to watch the file
					// again after a certain delay.
					// In addition, we send out a delete event if after a timeout we detect that the file
					// does indeed not exist anymore.
					if (renamedOrDeleted) {

						// Very important to dispose the watcher which now points to a stale inode
						this.unwatchFileChanges(resource);

						// Wait a bit and try to install watcher again, assuming that the file was renamed quickly ("Atomic Save")
						setTimeout(() => {
							this.existsFile(resource).done(exists => {

								// File still exists, so reapply the watcher
								if (exists) {
									this.watchFileChanges(resource);
								}

								// File seems to be really gone, so emit a deleted event
								else {
									this.onRawFileChange({
										type: FileChangeType.DELETED,
										path: fsPath
									});
								}
							});
						}, FileService.FS_REWATCH_DELAY);
					}

					// Handle raw file change
					this.onRawFileChange({
						type: FileChangeType.UPDATED,
						path: fsPath
					});
				});
			} catch (error) {
				return; // the path might not exist anymore, ignore this error and return
			}

			this.activeFileChangesWatchers.set(resource, watcher);

			// Errors
			watcher.on('error', (error: string) => {
				this.options.errorLogger(error);
			});
		}
	}

	private onRawFileChange(event: IRawFileChange): void {

		// add to bucket of undelivered events
		this.undeliveredRawFileChangesEvents.push(event);

		if (this.options.verboseLogging) {
			console.log('%c[node.js Watcher]%c', 'color: green', 'color: black', event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', event.path);
		}

		// handle emit through delayer to accommodate for bulk changes
		this.fileChangesWatchDelayer.trigger(() => {
			const buffer = this.undeliveredRawFileChangesEvents;
			this.undeliveredRawFileChangesEvents = [];

			// Normalize
			const normalizedEvents = normalize(buffer);

			// Logging
			if (this.options.verboseLogging) {
				normalizedEvents.forEach(r => {
					console.log('%c[node.js Watcher]%c >> normalized', 'color: green', 'color: black', r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', r.path);
				});
			}

			// Emit
			this._onFileChanges.fire(toFileChangesEvent(normalizedEvents));

			return TPromise.as(null);
		});
	}

	public unwatchFileChanges(resource: uri): void {
		const watcher = this.activeFileChangesWatchers.get(resource);
		if (watcher) {
			watcher.close();
			this.activeFileChangesWatchers.delete(resource);
		}
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		if (this.activeWorkspaceFileChangeWatcher) {
			this.activeWorkspaceFileChangeWatcher.dispose();
			this.activeWorkspaceFileChangeWatcher = null;
		}

		this.activeFileChangesWatchers.forEach(watcher => watcher.close());
		this.activeFileChangesWatchers.clear();
	}
}

export class StatResolver {
	private resource: uri;
	private isDirectory: boolean;
	private mtime: number;
	private name: string;
	private etag: string;
	private size: number;
	private verboseLogging: boolean;

	constructor(resource: uri, isDirectory: boolean, mtime: number, size: number, verboseLogging: boolean) {
		assert.ok(resource && resource.scheme === 'file', 'Invalid resource: ' + resource);

		this.resource = resource;
		this.isDirectory = isDirectory;
		this.mtime = mtime;
		this.name = getBaseLabel(resource);
		this.etag = etag(size, mtime);
		this.size = size;

		this.verboseLogging = verboseLogging;
	}

	public resolve(options: IResolveFileOptions): TPromise<IFileStat> {

		// General Data
		const fileStat: IFileStat = {
			resource: this.resource,
			isDirectory: this.isDirectory,
			hasChildren: undefined,
			name: this.name,
			etag: this.etag,
			size: this.size,
			mtime: this.mtime
		};

		// File Specific Data
		if (!this.isDirectory) {
			return TPromise.as(fileStat);
		}

		// Directory Specific Data
		else {

			// Convert the paths from options.resolveTo to absolute paths
			let absoluteTargetPaths: string[] = null;
			if (options && options.resolveTo) {
				absoluteTargetPaths = [];
				options.resolveTo.forEach(resource => {
					absoluteTargetPaths.push(resource.fsPath);
				});
			}

			return new TPromise<IFileStat>((c, e) => {

				// Load children
				this.resolveChildren(this.resource.fsPath, absoluteTargetPaths, options && options.resolveSingleChildDescendants, children => {
					children = arrays.coalesce(children); // we don't want those null children (could be permission denied when reading a child)
					fileStat.hasChildren = children && children.length > 0;
					fileStat.children = children || [];

					c(fileStat);
				});
			});
		}
	}

	private resolveChildren(absolutePath: string, absoluteTargetPaths: string[], resolveSingleChildDescendants: boolean, callback: (children: IFileStat[]) => void): void {
		extfs.readdir(absolutePath, (error: Error, files: string[]) => {
			if (error) {
				if (this.verboseLogging) {
					console.error(error);
				}

				return callback(null); // return - we might not have permissions to read the folder
			}

			// for each file in the folder
			flow.parallel(files, (file: string, clb: (error: Error, children: IFileStat) => void) => {
				const fileResource = uri.file(paths.resolve(absolutePath, file));
				let fileStat: fs.Stats;
				const $this = this;

				flow.sequence(
					function onError(error: Error): void {
						if ($this.verboseLogging) {
							console.error(error);
						}

						clb(null, null); // return - we might not have permissions to read the folder or stat the file
					},

					function stat(this: any): void {
						fs.stat(fileResource.fsPath, this);
					},

					function countChildren(this: any, fsstat: fs.Stats): void {
						fileStat = fsstat;

						if (fileStat.isDirectory()) {
							extfs.readdir(fileResource.fsPath, (error, result) => {
								this(null, result ? result.length : 0);
							});
						} else {
							this(null, 0);
						}
					},

					function resolve(childCount: number): void {
						const childStat: IFileStat = {
							resource: fileResource,
							isDirectory: fileStat.isDirectory(),
							hasChildren: childCount > 0,
							name: file,
							mtime: fileStat.mtime.getTime(),
							etag: etag(fileStat),
							size: fileStat.size
						};

						// Return early for files
						if (!fileStat.isDirectory()) {
							return clb(null, childStat);
						}

						// Handle Folder
						let resolveFolderChildren = false;
						if (files.length === 1 && resolveSingleChildDescendants) {
							resolveFolderChildren = true;
						} else if (childCount > 0 && absoluteTargetPaths && absoluteTargetPaths.some(targetPath => isEqualOrParent(targetPath, fileResource.fsPath, !isLinux /* ignorecase */))) {
							resolveFolderChildren = true;
						}

						// Continue resolving children based on condition
						if (resolveFolderChildren) {
							$this.resolveChildren(fileResource.fsPath, absoluteTargetPaths, resolveSingleChildDescendants, children => {
								children = arrays.coalesce(children);  // we don't want those null children
								childStat.hasChildren = children && children.length > 0;
								childStat.children = children || [];

								clb(null, childStat);
							});
						}

						// Otherwise return result
						else {
							clb(null, childStat);
						}
					});
			}, (errors, result) => {
				callback(result);
			});
		});
	}
}
