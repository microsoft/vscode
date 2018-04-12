/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as paths from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as assert from 'assert';
import { isParent, FileOperation, FileOperationEvent, IContent, IFileService, IResolveFileOptions, IResolveFileResult, IResolveContentOptions, IFileStat, IStreamContent, FileOperationError, FileOperationResult, IUpdateContentOptions, FileChangeType, FileChangesEvent, ICreateFileOptions, IContentData, ITextSnapshot, IFilesConfiguration } from 'vs/platform/files/common/files';
import { MAX_FILE_SIZE, MAX_HEAP_SIZE } from 'vs/platform/files/node/files';
import { isEqualOrParent } from 'vs/base/common/paths';
import { ResourceMap } from 'vs/base/common/map';
import * as arrays from 'vs/base/common/arrays';
import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import * as extfs from 'vs/base/node/extfs';
import { nfcall, ThrottledDelayer } from 'vs/base/common/async';
import uri from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import * as pfs from 'vs/base/node/pfs';
import * as encoding from 'vs/base/node/encoding';
import * as flow from 'vs/base/node/flow';
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
import { Readable } from 'stream';
import { Schemas } from 'vs/base/common/network';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { onUnexpectedError } from 'vs/base/common/errors';
import product from 'vs/platform/node/product';
import { shell } from 'electron';
import { IEncodingOverride, ResourceEncodings } from 'vs/workbench/services/files/electron-browser/encoding';

class BufferPool {

	static _64K = new BufferPool(64 * 1024, 5);

	constructor(
		readonly bufferSize: number,
		private readonly _capacity: number,
		private readonly _free: Buffer[] = [],
	) { }

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

export interface IFileServiceTestOptions {
	disableWatcher?: boolean;
	encodingOverride?: IEncodingOverride[];
}

export class FileService implements IFileService {

	public _serviceBrand: any;

	private static readonly FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static readonly FS_REWATCH_DELAY = 300; // delay to rewatch a file that was renamed or deleted (in ms)

	private static readonly NET_VERSION_ERROR = 'System.MissingMethodException';
	private static readonly NET_VERSION_ERROR_IGNORE_KEY = 'ignoreNetVersionError';

	private static readonly ENOSPC_ERROR = 'ENOSPC';
	private static readonly ENOSPC_ERROR_IGNORE_KEY = 'ignoreEnospcError';

	protected readonly _onFileChanges: Emitter<FileChangesEvent>;
	protected readonly _onAfterOperation: Emitter<FileOperationEvent>;

	private toDispose: IDisposable[];

	private activeWorkspaceFileChangeWatcher: IDisposable;
	private activeFileChangesWatchers: ResourceMap<fs.FSWatcher>;
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
		this.toDispose = [];

		this._onFileChanges = new Emitter<FileChangesEvent>();
		this.toDispose.push(this._onFileChanges);

		this._onAfterOperation = new Emitter<FileOperationEvent>();
		this.toDispose.push(this._onAfterOperation);

		this.activeFileChangesWatchers = new ResourceMap<fs.FSWatcher>();
		this.fileChangesWatchDelayer = new ThrottledDelayer<void>(FileService.FS_EVENT_DELAY);
		this.undeliveredRawFileChangesEvents = [];

		this._encoding = new ResourceEncodings(textResourceConfigurationService, environmentService, contextService, this.options.encodingOverride);

		this.registerListeners();
	}

	public get encoding(): ResourceEncodings {
		return this._encoding;
	}

	private registerListeners(): void {

		// Wait until we are fully running before starting file watchers
		this.lifecycleService.when(LifecyclePhase.Running).then(() => {
			this.setupFileWatching();
		});

		// Workbench State Change
		this.toDispose.push(this.contextService.onDidChangeWorkbenchState(() => {
			if (this.lifecycleService.phase >= LifecyclePhase.Running) {
				this.setupFileWatching();
			}
		}));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private handleError(error: string | Error): void {
		const msg = error ? error.toString() : void 0;
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
				}]
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
				}]
			);
		}
	}

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
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
				const legacyUnixWatcher = new UnixWatcherService(this.contextService, watcherIgnoredPatterns, e => this._onFileChanges.fire(e), err => this.handleError(err), this.environmentService.verbose);
				this.activeWorkspaceFileChangeWatcher = toDisposable(legacyUnixWatcher.startWatching());
			}
		}
	}

	public resolveFile(resource: uri, options?: IResolveFileOptions): TPromise<IFileStat> {
		return this.resolve(resource, options);
	}

	public resolveFiles(toResolve: { resource: uri, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(resourceAndOptions => this.resolve(resourceAndOptions.resource, resourceAndOptions.options)
			.then(stat => ({ stat, success: true }), error => ({ stat: void 0, success: false }))));
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
		if (resource.scheme !== Schemas.file || !resource.fsPath) {
			return TPromise.wrapError<IStreamContent>(new FileOperationError(
				nls.localize('fileInvalidPath', "Invalid file resource ({0})", resource.toString(true)),
				FileOperationResult.FILE_INVALID_PATH,
				options
			));
		}

		const result: IStreamContent = {
			resource: void 0,
			name: void 0,
			mtime: void 0,
			etag: void 0,
			encoding: void 0,
			value: void 0
		};

		const contentResolverTokenSource = new CancellationTokenSource();

		const onStatError = (error: Error) => {

			// error: stop reading the file the stat and content resolve call
			// usually race, mostly likely the stat call will win and cancel
			// the content call
			contentResolverTokenSource.cancel();

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
				if (stat.size > Math.max(this.environmentService.args['max-memory'] * 1024 * 1024 || 0, MAX_HEAP_SIZE)) {
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

			return void 0;
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

		let completePromise: Thenable<any>;

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
			completePromise = Promise.all([statsPromise, this.fillInContents(result, resource, options, contentResolverTokenSource.token)]);
		}

		return TPromise.wrap(completePromise).then(() => {
			contentResolverTokenSource.dispose();

			return result;
		});
	}

	private fillInContents(content: IStreamContent, resource: uri, options: IResolveContentOptions, token: CancellationToken): Thenable<any> {
		return this.resolveFileData(resource, options, token).then(data => {
			content.encoding = data.encoding;
			content.value = data.stream;
		});
	}

	private resolveFileData(resource: uri, options: IResolveContentOptions, token: CancellationToken): Thenable<IContentData> {

		const chunkBuffer = BufferPool._64K.acquire();

		const result: IContentData = {
			encoding: void 0,
			stream: void 0
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

					// return the shared buffer
					BufferPool._64K.release(chunkBuffer);

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

				let currentPosition: number = (options && options.position) || null;

				const readChunk = () => {
					fs.read(fd, chunkBuffer, 0, chunkBuffer.length, currentPosition, (err, bytesRead) => {
						totalBytesRead += bytesRead;

						if (typeof currentPosition === 'number') {
							// if we received a position argument as option we need to ensure that
							// we advance the position by the number of bytesread
							currentPosition += bytesRead;
						}

						if (totalBytesRead > Math.max(this.environmentService.args['max-memory'] * 1024 * 1024 || 0, MAX_HEAP_SIZE)) {
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
							const autoGuessEncoding = (options && options.autoGuessEncoding) || this.textResourceConfigurationService.getValue(resource, 'files.autoGuessEncoding');
							TPromise.as(encoding.detectEncodingFromBuffer(
								{ buffer: chunkBuffer, bytesRead },
								autoGuessEncoding
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
									result.stream = decoder = encoding.decodeStream(result.encoding);
									resolve(result);
									handleChunk(bytesRead);
								}

							}).then(void 0, err => {
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

	public updateContent(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): TPromise<IFileStat> {
		if (options.writeElevated) {
			return this.doUpdateContentElevated(resource, value, options);
		}

		return this.doUpdateContent(resource, value, options);
	}

	private doUpdateContent(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): TPromise<IFileStat> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file for writing
		return this.checkFileBeforeWriting(absolutePath, options).then(exists => {
			let createParentsPromise: TPromise<boolean>;
			if (exists) {
				createParentsPromise = TPromise.as(null);
			} else {
				createParentsPromise = pfs.mkdirp(paths.dirname(absolutePath));
			}

			// 2.) create parents as needed
			return createParentsPromise.then(() => {
				const encodingToWrite = this._encoding.getWriteEncoding(resource, options.encoding);
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
					return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encodingToWrite).then(void 0, error => {
						if (!exists || error.code !== 'EPERM' || !isWindows) {
							return TPromise.wrapError(error);
						}

						// On Windows and if the file exists with an EPERM error, we try a different strategy of saving the file
						// by first truncating the file and then writing with r+ mode. This helps to save hidden files on Windows
						// (see https://github.com/Microsoft/vscode/issues/931)

						// 5.) truncate
						return pfs.truncate(absolutePath, 0).then(() => {

							// 6.) set contents (this time with r+ mode) and resolve again
							return this.doSetContentsAndResolve(resource, absolutePath, value, addBom, encodingToWrite, { flag: 'r+' });
						});
					});
				});
			});
		}).then(null, error => {
			if (error.code === 'EACCES' || error.code === 'EPERM') {
				return TPromise.wrapError(new FileOperationError(
					nls.localize('filePermission', "Permission denied writing to file ({0})", resource.toString(true)),
					FileOperationResult.FILE_PERMISSION_DENIED,
					options
				));
			}

			return TPromise.wrapError(error);
		});
	}

	private doSetContentsAndResolve(resource: uri, absolutePath: string, value: string | ITextSnapshot, addBOM: boolean, encodingToWrite: string, options?: { mode?: number; flag?: string; }): TPromise<IFileStat> {
		let writeFilePromise: TPromise<void>;

		// Configure encoding related options as needed
		const writeFileOptions: extfs.IWriteFileOptions = options ? options : Object.create(null);
		if (addBOM || encodingToWrite !== encoding.UTF8) {
			writeFileOptions.encoding = {
				charset: encodingToWrite,
				addBOM
			};
		}

		if (typeof value === 'string') {
			writeFilePromise = pfs.writeFile(absolutePath, value, writeFileOptions);
		} else {
			writeFilePromise = pfs.writeFile(absolutePath, this.snapshotToReadableStream(value), writeFileOptions);
		}

		// set contents
		return writeFilePromise.then(() => {

			// resolve
			return this.resolve(resource);
		});
	}

	private snapshotToReadableStream(snapshot: ITextSnapshot): NodeJS.ReadableStream {
		return new Readable({
			read: function () {
				try {
					let chunk: string;
					let canPush = true;

					// Push all chunks as long as we can push and as long as
					// the underlying snapshot returns strings to us
					while (canPush && typeof (chunk = snapshot.read()) === 'string') {
						canPush = this.push(chunk);
					}

					// Signal EOS by pushing NULL
					if (typeof chunk !== 'string') {
						this.push(null);
					}
				} catch (error) {
					this.emit('error', error);
				}
			},
			encoding: encoding.UTF8 // very important, so that strings are passed around and not buffers!
		});
	}

	private doUpdateContentElevated(resource: uri, value: string | ITextSnapshot, options: IUpdateContentOptions = Object.create(null)): TPromise<IFileStat> {
		const absolutePath = this.toAbsolutePath(resource);

		// 1.) check file for writing
		return this.checkFileBeforeWriting(absolutePath, options, options.overwriteReadonly /* ignore readonly if we overwrite readonly, this is handled via sudo later */).then(exists => {
			const writeOptions: IUpdateContentOptions = objects.assign(Object.create(null), options);
			writeOptions.writeElevated = false;
			writeOptions.encoding = this._encoding.getWriteEncoding(resource, options.encoding);

			// 2.) write to a temporary file to be able to copy over later
			const tmpPath = paths.join(os.tmpdir(), `code-elevated-${Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6)}`);
			return this.updateContent(uri.file(tmpPath), value, writeOptions).then(() => {

				// 3.) invoke our CLI as super user
				return (import('sudo-prompt')).then(sudoPrompt => {
					return new TPromise<void>((c, e) => {
						const promptOptions = {
							name: this.environmentService.appNameLong.replace('-', ''),
							icns: (isMacintosh && this.environmentService.isBuilt) ? paths.join(paths.dirname(this.environmentService.appRoot), `${product.nameShort}.icns`) : void 0
						};

						const sudoCommand: string[] = [`"${this.environmentService.cliPath}"`];
						if (options.overwriteReadonly) {
							sudoCommand.push('--file-chmod');
						}
						sudoCommand.push('--file-write', `"${tmpPath}"`, `"${absolutePath}"`);

						sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error: string, stdout: string, stderr: string) => {
							if (error || stderr) {
								e(error || stderr);
							} else {
								c(void 0);
							}
						});
					});
				}).then(() => {

					// 3.) delete temp file
					return pfs.del(tmpPath, os.tmpdir()).then(() => {

						// 4.) resolve again
						return this.resolve(resource);
					});
				});
			});
		}).then(null, error => {
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

			return TPromise.wrapError(error);
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

	private checkFileBeforeWriting(absolutePath: string, options: IUpdateContentOptions = Object.create(null), ignoreReadonly?: boolean): TPromise<boolean /* exists */> {
		return pfs.exists(absolutePath).then(exists => {
			if (exists) {
				return pfs.stat(absolutePath).then(stat => {
					if (stat.isDirectory()) {
						return TPromise.wrapError<boolean>(new Error('Expected file is actually a directory'));
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
						return TPromise.wrapError<boolean>(new FileOperationError(nls.localize('fileModifiedError', "File Modified Since"), FileOperationResult.FILE_MODIFIED_SINCE, options));
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

					return TPromise.as<boolean>(exists);
				});
			}

			return TPromise.as<boolean>(exists);
		});
	}

	private readOnlyError<T>(options: IUpdateContentOptions): TPromise<T> {
		return TPromise.wrapError<T>(new FileOperationError(
			nls.localize('fileReadOnlyError', "File is Read Only"),
			FileOperationResult.FILE_READ_ONLY,
			options
		));
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

		// 1.) validate operation
		if (isParent(targetPath, sourcePath, !isLinux)) {
			return TPromise.wrapError<boolean>(new Error('Unable to move/copy when source path is parent of target path'));
		}

		// 2.) check if target exists
		return pfs.exists(targetPath).then(exists => {
			const isCaseRename = sourcePath.toLowerCase() === targetPath.toLowerCase();
			const isSameFile = sourcePath === targetPath;

			// Return early with conflict if target exists and we are not told to overwrite
			if (exists && !isCaseRename && !overwrite) {
				return TPromise.wrapError<boolean>(new FileOperationError(nls.localize('fileMoveConflict', "Unable to move/copy. File already exists at destination."), FileOperationResult.FILE_MOVE_CONFLICT));
			}

			// 3.) make sure target is deleted before we move/copy unless this is a case rename of the same file
			let deleteTargetPromise = TPromise.wrap<void>(void 0);
			if (exists && !isCaseRename) {
				if (isEqualOrParent(sourcePath, targetPath, !isLinux /* ignorecase */)) {
					return TPromise.wrapError<boolean>(new Error(nls.localize('unableToMoveCopyError', "Unable to move/copy. File would replace folder it is contained in."))); // catch this corner case!
				}

				deleteTargetPromise = this.del(uri.file(targetPath));
			}

			return deleteTargetPromise.then(() => {

				// 4.) make sure parents exists
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

	public del(resource: uri, useTrash?: boolean): TPromise<void> {
		if (useTrash) {
			return this.doMoveItemToTrash(resource);
		}

		return this.doDelete(resource);
	}

	private doMoveItemToTrash(resource: uri): TPromise<void> {
		const absolutePath = resource.fsPath;
		const result = shell.moveItemToTrash(absolutePath);
		if (!result) {
			return TPromise.wrapError<void>(new Error(isWindows ? nls.localize('binFailed', "Failed to move '{0}' to the recycle bin", paths.basename(absolutePath)) : nls.localize('trashFailed', "Failed to move '{0}' to the trash", paths.basename(absolutePath))));
		}

		this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));

		return TPromise.as(null);
	}

	private doDelete(resource: uri): TPromise<void> {
		const absolutePath = this.toAbsolutePath(resource);

		return pfs.del(absolutePath, os.tmpdir()).then(() => {

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

		assert.ok(resource && resource.scheme === Schemas.file, `Invalid resource: ${resource}`);

		return paths.normalize(resource.fsPath);
	}

	private resolve(resource: uri, options: IResolveFileOptions = Object.create(null)): TPromise<IFileStat> {
		return this.toStatResolver(resource).then(model => model.resolve(options));
	}

	private toStatResolver(resource: uri): TPromise<StatResolver> {
		const absolutePath = this.toAbsolutePath(resource);

		return pfs.statLink(absolutePath).then(({ isSymbolicLink, stat }) => {
			return new StatResolver(resource, isSymbolicLink, stat.isDirectory(), stat.mtime.getTime(), stat.size, this.environmentService.verbose ? err => this.handleError(err) : void 0);
		});
	}

	public watchFileChanges(resource: uri): void {
		assert.ok(resource && resource.scheme === Schemas.file, `Invalid resource for watching: ${resource}`);

		// Create or get watcher for provided path
		let watcher = this.activeFileChangesWatchers.get(resource);
		if (!watcher) {
			const fsPath = resource.fsPath;
			const fsName = paths.basename(resource.fsPath);

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
			}, (error: string) => this.handleError(error));

			if (watcher) {
				this.activeFileChangesWatchers.set(resource, watcher);
			}
		}
	}

	private onRawFileChange(event: IRawFileChange): void {

		// add to bucket of undelivered events
		this.undeliveredRawFileChangesEvents.push(event);

		if (this.environmentService.verbose) {
			console.log('%c[node.js Watcher]%c', 'color: green', 'color: black', event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', event.path);
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

	public resolve(options: IResolveFileOptions): TPromise<IFileStat> {

		// General Data
		const fileStat: IFileStat = {
			resource: this.resource,
			isDirectory: this.isDirectory,
			isSymbolicLink: this.isSymbolicLink,
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
					fileStat.children = children || [];

					c(fileStat);
				});
			});
		}
	}

	private resolveChildren(absolutePath: string, absoluteTargetPaths: string[], resolveSingleChildDescendants: boolean, callback: (children: IFileStat[]) => void): void {
		extfs.readdir(absolutePath, (error: Error, files: string[]) => {
			if (error) {
				if (this.errorLogger) {
					this.errorLogger(error);
				}

				return callback(null); // return - we might not have permissions to read the folder
			}

			// for each file in the folder
			flow.parallel(files, (file: string, clb: (error: Error, children: IFileStat) => void) => {
				const fileResource = uri.file(paths.resolve(absolutePath, file));
				let fileStat: fs.Stats;
				let isSymbolicLink = false;
				const $this = this;

				flow.sequence(
					function onError(error: Error): void {
						if ($this.errorLogger) {
							$this.errorLogger(error);
						}

						clb(null, null); // return - we might not have permissions to read the folder or stat the file
					},

					function stat(this: any): void {
						extfs.statLink(fileResource.fsPath, this);
					},

					function countChildren(this: any, statAndLink: extfs.IStatAndLink): void {
						fileStat = statAndLink.stat;
						isSymbolicLink = statAndLink.isSymbolicLink;

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
							isSymbolicLink,
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
