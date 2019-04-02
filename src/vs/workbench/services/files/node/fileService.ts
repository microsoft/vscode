/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as assert from 'assert';
import { isParent, FileOperation, FileOperationEvent, IContent, IResolveFileOptions, IResolveFileResult, IResolveContentOptions, IFileStat, IStreamContent, FileOperationError, FileOperationResult, IUpdateContentOptions, FileChangeType, FileChangesEvent, ICreateFileOptions, IContentData, ITextSnapshot, IFilesConfiguration, IFileSystemProviderRegistrationEvent, IFileSystemProvider, ILegacyFileService, IFileStatWithMetadata, IFileService, IResolveMetadataFileOptions, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { MAX_FILE_SIZE, MAX_HEAP_SIZE } from 'vs/platform/files/node/fileConstants';
import { isEqualOrParent } from 'vs/base/common/extpath';
import { ResourceMap } from 'vs/base/common/map';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import { ThrottledDelayer, timeout } from 'vs/base/common/async';
import { URI as uri } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import * as pfs from 'vs/base/node/pfs';
import { detectEncodingFromBuffer, decodeStream, detectEncodingByBOM, UTF8 } from 'vs/base/node/encoding';
import { FileWatcher as UnixWatcherService } from 'vs/workbench/services/files/node/watcher/unix/watcherService';
import { FileWatcher as WindowsWatcherService } from 'vs/workbench/services/files/node/watcher/win32/watcherService';
import { toFileChangesEvent, normalize, IRawFileChange } from 'vs/workbench/services/files/node/watcher/common';
import { Event, Emitter } from 'vs/base/common/event';
import { FileWatcher as NsfwWatcherService } from 'vs/workbench/services/files/node/watcher/nsfw/watcherService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { getBaseLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { onUnexpectedError } from 'vs/base/common/errors';
import product from 'vs/platform/product/node/product';
import { IEncodingOverride, ResourceEncodings } from 'vs/workbench/services/files/node/encoding';
import { createReadableOfSnapshot } from 'vs/workbench/services/files/node/streams';
import { withUndefinedAsNull } from 'vs/base/common/types';
import { normalizeNFC } from 'vs/base/common/normalization';

export interface IFileServiceTestOptions {
	disableWatcher?: boolean;
	encodingOverride?: IEncodingOverride[];
}

interface IStatAndLink {
	stat: fs.Stats;
	isSymbolicLink: boolean;
}

function statLink(path: string, callback: (error: Error | null, statAndIsLink: IStatAndLink | null) => void): void {
	fs.lstat(path, (error, lstat) => {
		if (error || lstat.isSymbolicLink()) {
			fs.stat(path, (error, stat) => {
				if (error) {
					return callback(error, null);
				}

				callback(null, { stat, isSymbolicLink: lstat && lstat.isSymbolicLink() });
			});
		} else {
			callback(null, { stat: lstat, isSymbolicLink: false });
		}
	});
}

function readdir(path: string, callback: (error: Error | null, files: string[]) => void): void {
	// Mac: uses NFD unicode form on disk, but we want NFC
	// See also https://github.com/nodejs/node/issues/2165
	if (isMacintosh) {
		return fs.readdir(path, (error, children) => {
			if (error) {
				return callback(error, []);
			}

			return callback(null, children.map(c => normalizeNFC(c)));
		});
	}

	return fs.readdir(path, callback);
}

export class FileService extends Disposable implements ILegacyFileService, IFileService {

	_serviceBrand: any;

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static readonly FS_REWATCH_DELAY = 300; // delay to rewatch a file that was renamed or deleted (in ms)

	private static readonly NET_VERSION_ERROR = 'System.MissingMethodException';
	private static readonly NET_VERSION_ERROR_IGNORE_KEY = 'ignoreNetVersionError';

	private static readonly ENOSPC_ERROR = 'ENOSPC';
	private static readonly ENOSPC_ERROR_IGNORE_KEY = 'ignoreEnospcError';

	protected readonly _onFileChanges: Emitter<FileChangesEvent> = this._register(new Emitter<FileChangesEvent>());
	get onFileChanges(): Event<FileChangesEvent> { return this._onFileChanges.event; }

	protected readonly _onAfterOperation: Emitter<FileOperationEvent> = this._register(new Emitter<FileOperationEvent>());
	get onAfterOperation(): Event<FileOperationEvent> { return this._onAfterOperation.event; }

	protected readonly _onDidChangeFileSystemProviderRegistrations = this._register(new Emitter<IFileSystemProviderRegistrationEvent>());
	get onDidChangeFileSystemProviderRegistrations(): Event<IFileSystemProviderRegistrationEvent> { return this._onDidChangeFileSystemProviderRegistrations.event; }

	readonly onWillActivateFileSystemProvider = Event.None;

	private activeWorkspaceFileChangeWatcher: IDisposable | null;
	private activeFileChangesWatchers: ResourceMap<{ unwatch: Function, count: number }>;
	private fileChangesWatchDelayer: ThrottledDelayer<void>;
	private undeliveredRawFileChangesEvents: IRawFileChange[];

	private _encoding: ResourceEncodings;

	constructor(
		private contextService: IWorkspaceContextService,
		private environmentService: IEnvironmentService,
		private textResourceConfigurationService: ITextResourceConfigurationService,
		private configurationService: IConfigurationService,
		private lifecycleService: ILifecycleService,
		private storageService: IStorageService,
		private notificationService: INotificationService,
		private options: IFileServiceTestOptions = Object.create(null)
	) {
		super();

		this.activeFileChangesWatchers = new ResourceMap<{ unwatch: Function, count: number }>();
		this.fileChangesWatchDelayer = new ThrottledDelayer<void>(FileService.FS_EVENT_DELAY);
		this.undeliveredRawFileChangesEvents = [];

		this._encoding = new ResourceEncodings(textResourceConfigurationService, environmentService, contextService, this.options.encodingOverride);

		this.registerListeners();
	}

	get encoding(): ResourceEncodings {
		return this._encoding;
	}

	private registerListeners(): void {

		// Wait until we are fully running before starting file watchers
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			this.setupFileWatching();
		});

		// Workbench State Change
		this._register(this.contextService.onDidChangeWorkbenchState(() => {
			if (this.lifecycleService.phase >= LifecyclePhase.Restored) {
				this.setupFileWatching();
			}
		}));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private handleError(error: string | Error): void {
		const msg = error ? error.toString() : undefined;
		if (!msg) {
			return;
		}

		// Forward to unexpected error handler
		onUnexpectedError(msg);

		// Detect if we run < .NET Framework 4.5 (TODO@ben remove with new watcher impl)
		if (msg.indexOf(FileService.NET_VERSION_ERROR) >= 0 && !this.storageService.getBoolean(FileService.NET_VERSION_ERROR_IGNORE_KEY, StorageScope.WORKSPACE)) {
			this.notificationService.prompt(
				Severity.Warning,
				nls.localize('netVersionError', "The Microsoft .NET Framework 4.5 is required. Please follow the link to install it."),
				[{
					label: nls.localize('installNet', "Download .NET Framework 4.5"),
					run: () => window.open('https://go.microsoft.com/fwlink/?LinkId=786533')
				},
				{
					label: nls.localize('neverShowAgain', "Don't Show Again"),
					isSecondary: true,
					run: () => this.storageService.store(FileService.NET_VERSION_ERROR_IGNORE_KEY, true, StorageScope.WORKSPACE)
				}],
				{ sticky: true }
			);
		}

		// Detect if we run into ENOSPC issues
		if (msg.indexOf(FileService.ENOSPC_ERROR) >= 0 && !this.storageService.getBoolean(FileService.ENOSPC_ERROR_IGNORE_KEY, StorageScope.WORKSPACE)) {
			this.notificationService.prompt(
				Severity.Warning,
				nls.localize('enospcError', "{0} is unable to watch for file changes in this large workspace. Please follow the instructions link to resolve this issue.", product.nameLong),
				[{
					label: nls.localize('learnMore', "Instructions"),
					run: () => window.open('https://go.microsoft.com/fwlink/?linkid=867693')
				},
				{
					label: nls.localize('neverShowAgain', "Don't Show Again"),
					isSecondary: true,
					run: () => this.storageService.store(FileService.ENOSPC_ERROR_IGNORE_KEY, true, StorageScope.WORKSPACE)
				}],
				{ sticky: true }
			);
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
		const configuration = this.configurationService.getValue<IFilesConfiguration>();
		if ((configuration.files && configuration.files.useExperimentalFileWatcher) || workbenchState === WorkbenchState.WORKSPACE) {
			const multiRootWatcher = new NsfwWatcherService(this.contextService, this.configurationService, e => this._onFileChanges.fire(e), err => this.handleError(err), this.environmentService.verbose);
			this.activeWorkspaceFileChangeWatcher = toDisposable(multiRootWatcher.startWatching());
		}

		// legacy watcher
		else {
			let watcherIgnoredPatterns: string[] = [];
			if (configuration.files && configuration.files.watcherExclude) {
				watcherIgnoredPatterns = Object.keys(configuration.files.watcherExclude).filter(k => !!configuration.files.watcherExclude[k]);
			}

			if (isWindows) {
				const legacyWindowsWatcher = new WindowsWatcherService(this.contextService, watcherIgnoredPatterns, e => this._onFileChanges.fire(e), err => this.handleError(err), this.environmentService.verbose);
				this.activeWorkspaceFileChangeWatcher = toDisposable(legacyWindowsWatcher.startWatching());
			} else {
				const legacyUnixWatcher = new UnixWatcherService(this.contextService, this.configurationService, e => this._onFileChanges.fire(e), err => this.handleError(err), this.environmentService.verbose);
				this.activeWorkspaceFileChangeWatcher = toDisposable(legacyUnixWatcher.startWatching());
			}
		}
	}

	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
		return Disposable.None;
	}

	activateProvider(scheme: string): Promise<void> {
		return Promise.reject(new Error('not implemented'));
	}

	canHandleResource(resource: uri): boolean {
		return resource.scheme === Schemas.file;
	}

	hasCapability(resource: uri, capability: FileSystemProviderCapabilities): boolean {
		return false;
	}

	resolveContent(resource: uri, options?: IResolveContentOptions): Promise<IContent> {
		return this.resolveStreamContent(resource, options).then(streamContent => {
			return new Promise<IContent>((resolve, reject) => {

				const result: IContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					encoding: streamContent.encoding,
					isReadonly: streamContent.isReadonly,
					size: streamContent.size,
					value: ''
				};

				streamContent.value.on('data', chunk => result.value += chunk);
				streamContent.value.on('error', err => reject(err));
				streamContent.value.on('end', () => resolve(result));

				return result;
			});
		});
	}

	resolveStreamContent(resource: uri, options?: IResolveContentOptions): Promise<IStreamContent> {

		// Guard early against attempts to resolve an invalid file path
		if (resource.scheme !== Schemas.file || !resource.fsPath) {
			return Promise.reject(new FileOperationError(
				nls.localize('fileInvalidPath', "Invalid file resource ({0})", resource.toString(true)),
				FileOperationResult.FILE_INVALID_PATH,
				options
			));
		}

		const result: Partial<IStreamContent> = {
			resource: undefined,
			name: undefined,
			mtime: undefined,
			etag: undefined,
			encoding: undefined,
			isReadonly: false,
			value: undefined
		};

		const contentResolverTokenSource = new CancellationTokenSource();

		const onStatError = (error: Error) => {

			// error: stop reading the file the stat and content resolve call
			// usually race, mostly likely the stat call will win and cancel
			// the content call
			contentResolverTokenSource.cancel();

			// forward error
			return Promise.reject(error);
		};

		const statsPromise = this.resolve(resource).then(stat => {
			result.resource = stat.resource;
			result.name = stat.name;
			result.mtime = stat.mtime;
			result.etag = stat.etag;
			result.size = stat.size;

			// Return early if resource is a directory
			if (stat.isDirectory) {
				return onStatError(new FileOperationError(
					nls.localize('fileIsDirectoryError', "File is directory"),
					FileOperationResult.FILE_IS_DIRECTORY,
					options
				));
			}

			// Return early if file not modified since
			if (options && options.etag && options.etag === stat.etag) {
				return onStatError(new FileOperationError(
					nls.localize('fileNotModifiedError', "File not modified since"),
					FileOperationResult.FILE_NOT_MODIFIED_SINCE,
					options
				));
			}

			// Return early if file is too large to load
			if (typeof stat.size === 'number') {
				if (stat.size > Math.max(typeof this.environmentService.args['max-memory'] === 'string' ? parseInt(this.environmentService.args['max-memory']) * 1024 * 1024 || 0 : 0, MAX_HEAP_SIZE)) {
					return onStatError(new FileOperationError(
						nls.localize('fileTooLargeForHeapError', "To open a file of this size, you need to restart VS Code and allow it to use more memory"),
						FileOperationResult.FILE_EXCEED_MEMORY_LIMIT
					));
				}

				if (stat.size > MAX_FILE_SIZE) {
					return onStatError(new FileOperationError(
						nls.localize('fileTooLargeError', "File too large to open"),
						FileOperationResult.FILE_TOO_LARGE
					));
				}
			}

			return undefined;
		}, err => {

			// Wrap file not found errors
			if (err.code === 'ENOENT') {
				return onStatError(new FileOperationError(
					nls.localize('fileNotFoundError', "File not found ({0})", resource.toString(true)),
					FileOperationResult.FILE_NOT_FOUND,
					options
				));
			}

			return onStatError(err);
		});

		let completePromise: Promise<void>;

		// await the stat iff we already have an etag so that we compare the
		// etag from the stat before we actually read the file again.
		if (options && options.etag) {
			completePromise = statsPromise.then(() => {
				return this.fillInContents(result, resource, options, contentResolverTokenSource.token); // Waterfall -> only now resolve the contents
			});
		}

		// a fresh load without a previous etag which means we can resolve the file stat
		// and the content at the same time, avoiding the waterfall.
		else {
			let statsError: Error;
			let contentsError: Error;

			completePromise = Promise.all([
				statsPromise.then(() => undefined, error => statsError = error),
				this.fillInContents(result, resource, options, contentResolverTokenSource.token).then(() => undefined, error => contentsError = error)
			]).then(() => {
				// Since each file operation can return a FileOperationError
				// we want to prefer that one if possible. Otherwise we just
				// return with the first error we get.
				if (FileOperationError.isFileOperationError(statsError)) {
					return Promise.reject(statsError);
				}

				if (FileOperationError.isFileOperationError(contentsError)) {
					return Promise.reject(contentsError);
				}

				if (statsError || contentsError) {
					return Promise.reject(statsError || contentsError);
				}

				return undefined;
			});
		}

		return completePromise.then(() => {
			contentResolverTokenSource.dispose();

			return result;
		}, error => {
			contentResolverTokenSource.dispose();

			return Promise.reject(error);
		});
	}

	private fillInContents(content: Partial<IStreamContent>, resource: uri, options: IResolveContentOptions | undefined, token: CancellationToken): Promise<void> {
		return this.resolveFileData(resource, options, token).then(data => {
			content.encoding = data.encoding;
			content.value = data.stream;
		});
	}

	private resolveFileData(resource: uri, options: IResolveContentOptions | undefined, token: CancellationToken): Promise<IContentData> {
		const chunkBuffer = Buffer.allocUnsafe(64 * 1024);

		const result: Partial<IContentData> = {
			encoding: undefined,
			stream: undefined
		};

		return new Promise<IContentData>((resolve, reject) => {
			fs.open(this.toAbsolutePath(resource), 'r', (err, fd) => {
				if (err) {
					if (err.code === 'ENOENT') {
						// Wrap file not found errors
						err = new FileOperationError(
							nls.localize('fileNotFoundError', "File not found ({0})", resource.toString(true)),
							FileOperationResult.FILE_NOT_FOUND,
							options
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
								FileOperationResult.FILE_IS_DIRECTORY,
								options
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

					if (fd) {
						fs.close(fd, err => {
							if (err) {
								this.handleError(`resolveFileData#close(): ${err.toString()}`);
							}
						});
					}
				};

				const handleChunk = (bytesRead: number) => {
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

				let currentPosition: number | null = withUndefinedAsNull(options && options.position);

				const readChunk = () => {
					fs.read(fd, chunkBuffer, 0, chunkBuffer.length, currentPosition, (err, bytesRead) => {
						totalBytesRead += bytesRead;

						if (typeof currentPosition === 'number') {
							// if we received a position argument as option we need to ensure that
							// we advance the position by the number of bytesread
							currentPosition += bytesRead;
						}

						if (totalBytesRead > Math.max(typeof this.environmentService.args['max-memory'] === 'number' ? parseInt(this.environmentService.args['max-memory']) * 1024 * 1024 || 0 : 0, MAX_HEAP_SIZE)) {
							finish(new FileOperationError(
								nls.localize('fileTooLargeForHeapError', "To open a file of this size, you need to restart VS Code and allow it to use more memory"),
								FileOperationResult.FILE_EXCEED_MEMORY_LIMIT
							));
						}

						if (totalBytesRead > MAX_FILE_SIZE) {
							// stop when reading too much
							finish(new FileOperationError(
								nls.localize('fileTooLargeError', "File too large to open"),
								FileOperationResult.FILE_TOO_LARGE,
								options
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
							Promise.resolve(detectEncodingFromBuffer(
								{ buffer: chunkBuffer, bytesRead },
								(options && options.autoGuessEncoding) || this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding')
							)).then(detected => {
								if (options && options.acceptTextOnly && detected.seemsBinary) {
									// Return error early if client only accepts text and this is not text
									finish(new FileOperationError(
										nls.localize('fileBinaryError', "File seems to be binary and cannot be opened as text"),
										FileOperationResult.FILE_IS_BINARY,
										options
									));

								} else {
									result.encoding = this._encoding.getReadEncoding(resource, options, detected);
									result.stream = decoder = decodeStream(result.encoding);
									resolve(result as IContentData);
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

	updateContent(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): Promise<IFileStatWithMetadata> {
		if (options.writeElevated) {
			return this.doUpdateContentElevated(resource, value, options);
		}

		return this.doUpdateContent(resource, value, options);
	}

	private doUpdateContent(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): Promise<IFileStatWithMetadata> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file for writing
		return this.checkFileBeforeWriting(absolutePath, options).then(exists => {
			let createParentsPromise: Promise<any>;
			if (exists) {
				createParentsPromise = Promise.resolve();
			} else {
				createParentsPromise = pfs.mkdirp(paths.dirname(absolutePath));
			}

			// 2.) create parents as needed
			return createParentsPromise.then(() => {
				const { encoding, hasBOM } = this._encoding.getWriteEncoding(resource, options.encoding);
				let addBomPromise: Promise<boolean> = Promise.resolve(false);

				// Some encodings come with a BOM automatically
				if (hasBOM) {
					addBomPromise = Promise.resolve(hasBOM);
				}

				// Existing UTF-8 file: check for options regarding BOM
				else if (exists && encoding === UTF8) {
					if (options.overwriteEncoding) {
						addBomPromise = Promise.resolve(false); // if we are to overwrite the encoding, we do not preserve it if found
					} else {
						addBomPromise = detectEncodingByBOM(absolutePath).then(enc => enc === UTF8); // otherwise preserve it if found
					}
				}

				// 3.) check to add UTF BOM
				return addBomPromise.then(addBom => {

					// 4.) set contents and resolve
					if (!exists || !isWindows) {
						return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encoding);
					}

					// On Windows and if the file exists, we use a different strategy of saving the file
					// by first truncating the file and then writing with r+ mode. This helps to save hidden files on Windows
					// (see https://github.com/Microsoft/vscode/issues/931) and prevent removing alternate data streams
					// (see https://github.com/Microsoft/vscode/issues/6363)
					else {

						// 4.) truncate
						return pfs.truncate(absolutePath, 0).then(() => {

							// 5.) set contents (with r+ mode) and resolve
							return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encoding, { flag: 'r+' }).then(undefined, error => {
								if (this.environmentService.verbose) {
									console.error(`Truncate succeeded, but save failed (${error}), retrying after 100ms`);
								}

								// We heard from one user that fs.truncate() succeeds, but the save fails (https://github.com/Microsoft/vscode/issues/61310)
								// In that case, the file is now entirely empty and the contents are gone. This can happen if an external file watcher is
								// installed that reacts on the truncate and keeps the file busy right after. Our workaround is to retry to save after a
								// short timeout, assuming that the file is free to write then.
								return timeout(100).then(() => this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encoding, { flag: 'r+' }));
							});
						}, error => {
							if (this.environmentService.verbose) {
								console.error(`Truncate failed (${error}), falling back to normal save`);
							}

							// we heard from users that fs.truncate() fails (https://github.com/Microsoft/vscode/issues/59561)
							// in that case we simply save the file without truncating first (same as macOS and Linux)
							return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encoding);
						});
					}
				});
			});
		}).then(undefined, error => {
			if (error.code === 'EACCES' || error.code === 'EPERM') {
				return Promise.reject(new FileOperationError(
					nls.localize('filePermission', "Permission denied writing to file ({0})", resource.toString(true)),
					FileOperationResult.FILE_PERMISSION_DENIED,
					options
				));
			}

			return Promise.reject(error);
		});
	}

	private doSetContentsAndResolve(resource: uri, absolutePath: string, value: string | ITextSnapshot, addBOM: boolean, encodingToWrite: string, options?: { mode?: number; flag?: string; }): Promise<IFileStat> {

		// Configure encoding related options as needed
		const writeFileOptions: pfs.IWriteFileOptions = options ? options : Object.create(null);
		if (addBOM || encodingToWrite !== UTF8) {
			writeFileOptions.encoding = {
				charset: encodingToWrite,
				addBOM
			};
		}

		let writeFilePromise: Promise<void>;
		if (typeof value === 'string') {
			writeFilePromise = pfs.writeFile(absolutePath, value, writeFileOptions);
		} else {
			writeFilePromise = pfs.writeFile(absolutePath, createReadableOfSnapshot(value), writeFileOptions);
		}

		// set contents
		return writeFilePromise.then(() => {

			// resolve
			return this.resolve(resource);
		});
	}

	private doUpdateContentElevated(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): Promise<IFileStatWithMetadata> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file for writing
		return this.checkFileBeforeWriting(absolutePath, options, options.overwriteReadonly /* ignore readonly if we overwrite readonly, this is handled via sudo later */).then(exists => {
			const writeOptions: IUpdateContentOptions = objects.assign(Object.create(null), options);
			writeOptions.writeElevated = false;
			writeOptions.encoding = this._encoding.getWriteEncoding(resource, options.encoding).encoding;

			// 2.) write to a temporary file to be able to copy over later
			const tmpPath = paths.join(os.tmpdir(), `code-elevated-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6)}`);
			return this.updateContent(uri.file(tmpPath), value, writeOptions).then(() => {

				// 3.) invoke our CLI as super user
				return import('sudo-prompt').then(sudoPrompt => {
					return new Promise<void>((resolve, reject) => {
						const promptOptions = {
							name: this.environmentService.appNameLong.replace('-', ''),
							icns: (isMacintosh && this.environmentService.isBuilt) ? paths.join(paths.dirname(this.environmentService.appRoot), `${product.nameShort}.icns`) : undefined
						};

						const sudoCommand: string[] = [`"${this.environmentService.cliPath}"`];
						if (options.overwriteReadonly) {
							sudoCommand.push('--file-chmod');
						}
						sudoCommand.push('--file-write', `"${tmpPath}"`, `"${absolutePath}"`);

						sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error: string, stdout: string, stderr: string) => {
							if (error || stderr) {
								reject(error || stderr);
							} else {
								resolve(undefined);
							}
						});
					});
				}).then(() => {

					// 3.) delete temp file
					return pfs.rimraf(tmpPath, pfs.RimRafMode.MOVE).then(() => {

						// 4.) resolve again
						return this.resolve(resource);
					});
				});
			});
		}).then(undefined, error => {
			if (this.environmentService.verbose) {
				this.handleError(`Unable to write to file '${resource.toString(true)}' as elevated user (${error})`);
			}

			if (!FileOperationError.isFileOperationError(error)) {
				error = new FileOperationError(
					nls.localize('filePermission', "Permission denied writing to file ({0})", resource.toString(true)),
					FileOperationResult.FILE_PERMISSION_DENIED,
					options
				);
			}

			return Promise.reject(error);
		});
	}

	createFile(resource: uri, content: string = '', options: ICreateFileOptions = Object.create(null)): Promise<IFileStatWithMetadata> {
		const absolutePath = this.toAbsolutePath(resource);

		let checkFilePromise: Promise<boolean>;
		if (options.overwrite) {
			checkFilePromise = Promise.resolve(false);
		} else {
			checkFilePromise = pfs.exists(absolutePath);
		}

		// Check file exists
		return checkFilePromise.then(exists => {
			if (exists && !options.overwrite) {
				return Promise.reject(new FileOperationError(
					nls.localize('fileExists', "File to create already exists ({0})", resource.toString(true)),
					FileOperationResult.FILE_MODIFIED_SINCE,
					options
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

	private checkFileBeforeWriting(absolutePath: string, options: IUpdateContentOptions = Object.create(null), ignoreReadonly?: boolean): Promise<boolean /* exists */> {
		return pfs.exists(absolutePath).then(exists => {
			if (exists) {
				return pfs.stat(absolutePath).then(stat => {
					if (stat.isDirectory()) {
						return Promise.reject(new Error('Expected file is actually a directory'));
					}

					// Dirty write prevention: if the file on disk has been changed and does not match our expected
					// mtime and etag, we bail out to prevent dirty writing.
					//
					// First, we check for a mtime that is in the future before we do more checks. The assumption is
					// that only the mtime is an indicator for a file that has changd on disk.
					//
					// Second, if the mtime has advanced, we compare the size of the file on disk with our previous
					// one using the etag() function. Relying only on the mtime check has prooven to produce false
					// positives due to file system weirdness (especially around remote file systems). As such, the
					// check for size is a weaker check because it can return a false negative if the file has changed
					// but to the same length. This is a compromise we take to avoid having to produce checksums of
					// the file content for comparison which would be much slower to compute.
					if (typeof options.mtime === 'number' && typeof options.etag === 'string' && options.mtime < stat.mtime.getTime() && options.etag !== etag(stat.size, options.mtime)) {
						return Promise.reject(new FileOperationError(nls.localize('fileModifiedError', "File Modified Since"), FileOperationResult.FILE_MODIFIED_SINCE, options));
					}

					// Throw if file is readonly and we are not instructed to overwrite
					if (!ignoreReadonly && !(stat.mode & 128) /* readonly */) {
						if (!options.overwriteReadonly) {
							return this.readOnlyError<boolean>(options);
						}

						// Try to change mode to writeable
						let mode = stat.mode;
						mode = mode | 128;
						return pfs.chmod(absolutePath, mode).then(() => {

							// Make sure to check the mode again, it could have failed
							return pfs.stat(absolutePath).then(stat => {
								if (!(stat.mode & 128) /* readonly */) {
									return this.readOnlyError<boolean>(options);
								}

								return exists;
							});
						});
					}

					return exists;
				});
			}

			return exists;
		});
	}

	private readOnlyError<T>(options: IUpdateContentOptions): Promise<T> {
		return Promise.reject(new FileOperationError(
			nls.localize('fileReadOnlyError', "File is Read Only"),
			FileOperationResult.FILE_READ_ONLY,
			options
		));
	}

	move(source: uri, target: uri, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopyFile(source, target, false, !!overwrite);
	}

	copy(source: uri, target: uri, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.moveOrCopyFile(source, target, true, !!overwrite);
	}

	private moveOrCopyFile(source: uri, target: uri, keepCopy: boolean, overwrite: boolean): Promise<IFileStatWithMetadata> {
		const sourcePath = this.toAbsolutePath(source);
		const targetPath = this.toAbsolutePath(target);

		// 1.) move / copy
		return this.doMoveOrCopyFile(sourcePath, targetPath, keepCopy, overwrite).then(() => {

			// 2.) resolve
			return this.doResolve(target, { resolveMetadata: true }).then(result => {

				// Events (unless it was a no-op because paths are identical)
				if (sourcePath !== targetPath) {
					this._onAfterOperation.fire(new FileOperationEvent(source, keepCopy ? FileOperation.COPY : FileOperation.MOVE, result));
				}

				return result;
			});
		});
	}

	private doMoveOrCopyFile(sourcePath: string, targetPath: string, keepCopy: boolean, overwrite: boolean): Promise<void> {

		// 1.) validate operation
		if (isParent(targetPath, sourcePath, !isLinux)) {
			return Promise.reject(new Error('Unable to move/copy when source path is parent of target path'));
		} else if (sourcePath === targetPath) {
			return Promise.resolve(); // no-op but not an error
		}

		// 2.) check if target exists
		return pfs.exists(targetPath).then(exists => {
			const isCaseRename = sourcePath.toLowerCase() === targetPath.toLowerCase();

			// Return early with conflict if target exists and we are not told to overwrite
			if (exists && !isCaseRename && !overwrite) {
				return Promise.reject(new FileOperationError(nls.localize('fileMoveConflict', "Unable to move/copy. File already exists at destination."), FileOperationResult.FILE_MOVE_CONFLICT));
			}

			// 3.) make sure target is deleted before we move/copy unless this is a case rename of the same file
			let deleteTargetPromise: Promise<void> = Promise.resolve();
			if (exists && !isCaseRename) {
				if (isEqualOrParent(sourcePath, targetPath, !isLinux /* ignorecase */)) {
					return Promise.reject(new Error(nls.localize('unableToMoveCopyError', "Unable to move/copy. File would replace folder it is contained in."))); // catch this corner case!
				}

				deleteTargetPromise = this.del(uri.file(targetPath), { recursive: true });
			}

			return deleteTargetPromise.then(() => {

				// 4.) make sure parents exists
				return pfs.mkdirp(paths.dirname(targetPath)).then(() => {

					// 4.) copy/move
					if (keepCopy) {
						return pfs.copy(sourcePath, targetPath);
					} else {
						return pfs.move(sourcePath, targetPath);
					}
				});
			});
		});
	}

	del(resource: uri, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {
		if (options && options.useTrash) {
			return this.doMoveItemToTrash(resource);
		}

		return this.doDelete(resource, !!(options && options.recursive));
	}

	private doMoveItemToTrash(resource: uri): Promise<void> {
		const absolutePath = resource.fsPath;

		const shell = (require('electron') as any as Electron.RendererInterface).shell; // workaround for being able to run tests out of VSCode debugger
		const result = shell.moveItemToTrash(absolutePath);
		if (!result) {
			return Promise.reject(new Error(isWindows ? nls.localize('binFailed', "Failed to move '{0}' to the recycle bin", paths.basename(absolutePath)) : nls.localize('trashFailed', "Failed to move '{0}' to the trash", paths.basename(absolutePath))));
		}

		this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));

		return Promise.resolve();
	}

	private doDelete(resource: uri, recursive: boolean): Promise<void> {
		const absolutePath = this.toAbsolutePath(resource);

		let assertNonRecursiveDelete: Promise<void>;
		if (!recursive) {
			assertNonRecursiveDelete = pfs.stat(absolutePath).then(stat => {
				if (!stat.isDirectory()) {
					return undefined;
				}

				return pfs.readdir(absolutePath).then(children => {
					if (children.length === 0) {
						return undefined;
					}

					return Promise.reject(new Error(nls.localize('deleteFailed', "Failed to delete non-empty folder '{0}'.", paths.basename(absolutePath))));
				});
			}, error => Promise.resolve() /* ignore errors */);
		} else {
			assertNonRecursiveDelete = Promise.resolve();
		}

		return assertNonRecursiveDelete.then(() => {
			return pfs.rimraf(absolutePath, pfs.RimRafMode.MOVE).then(() => {

				// Events
				this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
			});
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

		assert.ok(resource && resource.scheme === Schemas.file, `Invalid resource: ${resource}`);

		return paths.normalize(resource.fsPath);
	}

	private doResolve(resource: uri, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	private doResolve(resource: uri, options?: IResolveFileOptions): Promise<IFileStat>;
	private doResolve(resource: uri, options: IResolveFileOptions = Object.create(null)): Promise<IFileStat> {
		return this.toStatResolver(resource).then(model => model.resolve(options));
	}

	private toStatResolver(resource: uri): Promise<StatResolver> {
		const absolutePath = this.toAbsolutePath(resource);

		return pfs.statLink(absolutePath).then(({ isSymbolicLink, stat }) => {
			return new StatResolver(resource, isSymbolicLink, stat.isDirectory(), stat.mtime.getTime(), stat.size, this.environmentService.verbose ? err => this.handleError(err) : undefined);
		});
	}

	watch(resource: uri): void {
		assert.ok(resource && resource.scheme === Schemas.file, `Invalid resource for watching: ${resource}`);

		// Check for existing watcher first
		const entry = this.activeFileChangesWatchers.get(resource);
		if (entry) {
			entry.count += 1;

			return;
		}

		// Create or get watcher for provided path
		const fsPath = resource.fsPath;
		const fsName = paths.basename(resource.fsPath);

		const watcherDisposable = pfs.watch(fsPath, (eventType: string, filename: string) => {
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
				watcherDisposable.dispose();
				this.activeFileChangesWatchers.delete(resource);

				// Wait a bit and try to install watcher again, assuming that the file was renamed quickly ("Atomic Save")
				setTimeout(() => {
					this.exists(resource).then(exists => {

						// File still exists, so reapply the watcher
						if (exists) {
							this.watch(resource);
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
		}, (error: string) => this.handleError(error));

		// Remember in map
		this.activeFileChangesWatchers.set(resource, {
			count: 1,
			unwatch: () => watcherDisposable.dispose()
		});
	}

	private onRawFileChange(event: IRawFileChange): void {

		// add to bucket of undelivered events
		this.undeliveredRawFileChangesEvents.push(event);

		if (this.environmentService.verbose) {
			console.log('%c[File Watcher (node.js)]%c', 'color: blue', 'color: black', `${event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${event.path}`);
		}

		// handle emit through delayer to accommodate for bulk changes
		this.fileChangesWatchDelayer.trigger(() => {
			const buffer = this.undeliveredRawFileChangesEvents;
			this.undeliveredRawFileChangesEvents = [];

			// Normalize
			const normalizedEvents = normalize(buffer);

			// Logging
			if (this.environmentService.verbose) {
				normalizedEvents.forEach(r => {
					console.log('%c[File Watcher (node.js)]%c >> normalized', 'color: blue', 'color: black', `${r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]'} ${r.path}`);
				});
			}

			// Emit
			this._onFileChanges.fire(toFileChangesEvent(normalizedEvents));

			return Promise.resolve();
		});
	}

	unwatch(resource: uri): void {
		const watcher = this.activeFileChangesWatchers.get(resource);
		if (watcher && --watcher.count === 0) {
			watcher.unwatch();
			this.activeFileChangesWatchers.delete(resource);
		}
	}

	dispose(): void {
		super.dispose();

		if (this.activeWorkspaceFileChangeWatcher) {
			this.activeWorkspaceFileChangeWatcher.dispose();
			this.activeWorkspaceFileChangeWatcher = null;
		}

		this.activeFileChangesWatchers.forEach(watcher => watcher.unwatch());
		this.activeFileChangesWatchers.clear();
	}








	// Tests only

	resolve(resource: uri, options?: IResolveFileOptions): Promise<IFileStat>;
	resolve(resource: uri, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: uri, options?: IResolveFileOptions): Promise<IFileStat> {
		return this.doResolve(resource, options);
	}

	resolveAll(toResolve: { resource: uri, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]> {
		return Promise.all(toResolve.map(resourceAndOptions => this.doResolve(resourceAndOptions.resource, resourceAndOptions.options)
			.then(stat => ({ stat, success: true }), error => ({ stat: undefined, success: false }))));
	}

	createFolder(resource: uri): Promise<IFileStatWithMetadata> {

		// 1.) Create folder
		const absolutePath = this.toAbsolutePath(resource);
		return pfs.mkdirp(absolutePath).then(() => {

			// 2.) Resolve
			return this.doResolve(resource, { resolveMetadata: true }).then(result => {

				// Events
				this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, result));

				return result;
			});
		});
	}

	exists(resource: uri): Promise<boolean> {
		return this.resolve(resource).then(() => true, () => false);
	}
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

/**
 * Executes the given function (fn) over the given array of items (list) in parallel and returns the resulting errors and results as
 * array to the callback (callback). The resulting errors and results are evaluated by calling the provided callback function.
 */
function parallel<T, E>(list: T[], fn: (item: T, callback: (err: Error | null, result: E | null) => void) => void, callback: (err: Array<Error | null> | null, result: E[]) => void): void {
	const results = new Array(list.length);
	const errors = new Array<Error | null>(list.length);
	let didErrorOccur = false;
	let doneCount = 0;

	if (list.length === 0) {
		return callback(null, []);
	}

	list.forEach((item, index) => {
		fn(item, (error, result) => {
			if (error) {
				didErrorOccur = true;
				results[index] = null;
				errors[index] = error;
			} else {
				results[index] = result;
				errors[index] = null;
			}

			if (++doneCount === list.length) {
				return callback(didErrorOccur ? errors : null, results);
			}
		});
	});
}

/**
 * Executes the given function (fn) over the given array of items (param) in sequential order and returns the first occurred error or the result as
 * array to the callback (callback). The resulting errors and results are evaluated by calling the provided callback function. The first param can
 * either be a function that returns an array of results to loop in async fashion or be an array of items already.
 */
function loop<T, E>(param: (callback: (error: Error, result: T[]) => void) => void, fn: (item: T, callback: (error: Error | null, result: E | null) => void, index: number, total: number) => void, callback: (error: Error | null, result: E[] | null) => void): void;
function loop<T, E>(param: T[], fn: (item: T, callback: (error: Error | null, result: E | null) => void, index: number, total: number) => void, callback: (error: Error | null, result: E[] | null) => void): void;
function loop<E>(param: any, fn: (item: any, callback: (error: Error | null, result: E | null) => void, index: number, total: number) => void, callback: (error: Error | null, result: E[] | null) => void): void {

	// Assert
	assert.ok(param, 'Missing first parameter');
	assert.ok(typeof (fn) === 'function', 'Second parameter must be a function that is called for each element');
	assert.ok(typeof (callback) === 'function', 'Third parameter must be a function that is called on error and success');

	// Param is function, execute to retrieve array
	if (typeof (param) === 'function') {
		try {
			param((error: Error, result: E[]) => {
				if (error) {
					callback(error, null);
				} else {
					loop(result, fn, callback);
				}
			});
		} catch (error) {
			callback(error, null);
		}
	}

	// Expect the param to be an array and loop over it
	else {
		const results: E[] = [];

		const looper: (i: number) => void = function (i: number): void {

			// Still work to do
			if (i < param.length) {

				// Execute function on array element
				try {
					fn(param[i], (error: any, result: E) => {

						// A method might only send a boolean value as return value (e.g. fs.exists), support this case gracefully
						if (error === true || error === false) {
							result = error;
							error = null;
						}

						// Quit looping on error
						if (error) {
							callback(error, null);
						}

						// Otherwise push result on stack and continue looping
						else {
							if (result) { //Could be that provided function is not returning a result
								results.push(result);
							}

							process.nextTick(() => {
								looper(i + 1);
							});
						}
					}, i, param.length);
				} catch (error) {
					callback(error, null);
				}
			}

			// Done looping, pass back results too callback function
			else {
				callback(null, results);
			}
		};

		// Start looping with first element in array
		looper(0);
	}
}

function Sequence(sequences: { (...param: any[]): void; }[]): void {

	// Assert
	assert.ok(sequences.length > 1, 'Need at least one error handler and one function to process sequence');
	sequences.forEach((sequence) => {
		assert.ok(typeof (sequence) === 'function');
	});

	// Execute in Loop
	const errorHandler = sequences.splice(0, 1)[0]; //Remove error handler
	let sequenceResult: any = null;

	loop(sequences, (sequence, clb) => {
		const sequenceFunction = function (error: any, result: any): void {

			// A method might only send a boolean value as return value (e.g. fs.exists), support this case gracefully
			if (error === true || error === false) {
				result = error;
				error = null;
			}

			// Handle Error and Result
			if (error) {
				clb(error, null);
			} else {
				sequenceResult = result; //Remember result of sequence
				clb(null, null); //Don't pass on result to Looper as we are not aggregating it
			}
		};

		// We call the sequence function setting "this" to be the callback we define here
		// and we pass in the "sequenceResult" as first argument. Doing all this avoids having
		// to pass in a callback to the sequence because the callback is already "this".
		try {
			sequence.call(sequenceFunction, sequenceResult);
		} catch (error) {
			clb(error, null);
		}
	}, (error, result) => {
		if (error) {
			errorHandler(error);
		}
	});
}

/**
 * Takes a variable list of functions to execute in sequence. The first function must be the error handler and the
 * following functions can do arbitrary work. "this" must be used as callback value for async functions to continue
 * through the sequence:
 * 	sequence(
 * 		function errorHandler(error) {
 * 			clb(error, null);
 * 		},
 *
 * 		function doSomethingAsync() {
 * 			fs.doAsync(path, this);
 * 		},
 *
 * 		function done(result) {
 * 			clb(null, result);
 * 		}
 * 	);
 */
function sequence(errorHandler: (error: Error) => void, ...sequences: Function[]): void;
function sequence(sequences: Function[]): void;
function sequence(sequences: any): void {
	Sequence((Array.isArray(sequences)) ? sequences : Array.prototype.slice.call(arguments));
}

export class StatResolver {
	private name: string;
	private etag: string;

	constructor(
		private resource: uri,
		private isSymbolicLink: boolean,
		private isDirectory: boolean,
		private mtime: number,
		private size: number,
		private errorLogger?: (error: Error | string) => void
	) {
		assert.ok(resource && resource.scheme === Schemas.file, `Invalid resource: ${resource}`);

		this.name = getBaseLabel(resource);
		this.etag = etag(size, mtime);
	}

	resolve(options: IResolveFileOptions | undefined): Promise<IFileStat> {

		// General Data
		const fileStat: IFileStat = {
			resource: this.resource,
			isDirectory: this.isDirectory,
			isSymbolicLink: this.isSymbolicLink,
			isReadonly: false,
			name: this.name,
			etag: this.etag,
			size: this.size,
			mtime: this.mtime
		};

		// File Specific Data
		if (!this.isDirectory) {
			return Promise.resolve(fileStat);
		}

		// Directory Specific Data
		else {

			// Convert the paths from options.resolveTo to absolute paths
			let absoluteTargetPaths: string[] | null = null;
			if (options && options.resolveTo) {
				absoluteTargetPaths = [];
				for (const resource of options.resolveTo) {
					absoluteTargetPaths.push(resource.fsPath);
				}
			}

			return new Promise<IFileStat>(resolve => {

				// Load children
				this.resolveChildren(this.resource.fsPath, absoluteTargetPaths, !!(options && options.resolveSingleChildDescendants), children => {
					if (children) {
						children = arrays.coalesce(children); // we don't want those null children (could be permission denied when reading a child)
					}
					fileStat.children = children || [];

					resolve(fileStat);
				});
			});
		}
	}

	private resolveChildren(absolutePath: string, absoluteTargetPaths: string[] | null, resolveSingleChildDescendants: boolean, callback: (children: IFileStat[] | null) => void): void {
		readdir(absolutePath, (error: Error, files: string[]) => {
			if (error) {
				if (this.errorLogger) {
					this.errorLogger(error);
				}

				return callback(null); // return - we might not have permissions to read the folder
			}

			// for each file in the folder
			parallel(files, (file: string, clb: (error: Error | null, children: IFileStat | null) => void) => {
				const fileResource = uri.file(paths.resolve(absolutePath, file));
				let fileStat: fs.Stats;
				let isSymbolicLink = false;
				const $this = this;

				sequence(
					function onError(error: Error): void {
						if ($this.errorLogger) {
							$this.errorLogger(error);
						}

						clb(null, null); // return - we might not have permissions to read the folder or stat the file
					},

					function stat(this: any): void {
						statLink(fileResource.fsPath, this);
					},

					function countChildren(this: any, statAndLink: IStatAndLink): void {
						fileStat = statAndLink.stat;
						isSymbolicLink = statAndLink.isSymbolicLink;

						if (fileStat.isDirectory()) {
							readdir(fileResource.fsPath, (error, result) => {
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
							isSymbolicLink,
							isReadonly: false,
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
								if (children) {
									children = arrays.coalesce(children);  // we don't want those null children
								}
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
