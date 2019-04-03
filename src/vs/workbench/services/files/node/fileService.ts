/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import * as fs from 'fs';
import * as os from 'os';
import * as assert from 'assert';
import { FileOperation, FileOperationEvent, IContent, IResolveContentOptions, IFileStat, IStreamContent, FileOperationError, FileOperationResult, IUpdateContentOptions, ICreateFileOptions, IContentData, ITextSnapshot, ILegacyFileService, IFileStatWithMetadata, IFileService, IFileSystemProvider, etag } from 'vs/platform/files/common/files';
import { MAX_FILE_SIZE, MAX_HEAP_SIZE } from 'vs/platform/files/node/fileConstants';
import * as objects from 'vs/base/common/objects';
import { timeout } from 'vs/base/common/async';
import { URI as uri } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import * as pfs from 'vs/base/node/pfs';
import { detectEncodingFromBuffer, decodeStream, detectEncodingByBOM, UTF8 } from 'vs/base/node/encoding';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import { onUnexpectedError } from 'vs/base/common/errors';
import product from 'vs/platform/product/node/product';
import { IEncodingOverride, ResourceEncodings } from 'vs/workbench/services/files/node/encoding';
import { createReadableOfSnapshot } from 'vs/workbench/services/files/node/streams';
import { withUndefinedAsNull } from 'vs/base/common/types';

export interface IFileServiceTestOptions {
	encodingOverride?: IEncodingOverride[];
}

export class LegacyFileService extends Disposable implements ILegacyFileService {

	_serviceBrand: any;

	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable { return Disposable.None; }

	protected readonly _onAfterOperation: Emitter<FileOperationEvent> = this._register(new Emitter<FileOperationEvent>());
	get onAfterOperation(): Event<FileOperationEvent> { return this._onAfterOperation.event; }

	private _encoding: ResourceEncodings;

	constructor(
		protected fileService: IFileService,
		contextService: IWorkspaceContextService,
		private environmentService: IEnvironmentService,
		private textResourceConfigurationService: ITextResourceConfigurationService,
		private options: IFileServiceTestOptions = Object.create(null)
	) {
		super();

		this._encoding = new ResourceEncodings(textResourceConfigurationService, environmentService, contextService, this.options.encodingOverride);
	}

	get encoding(): ResourceEncodings {
		return this._encoding;
	}

	//#region Read File

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

		const statsPromise = this.fileService.resolve(resource).then(stat => {
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
								onUnexpectedError(`resolveFileData#close(): ${err.toString()}`);
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

	//#endregion

	//#region File Writing

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
			return this.fileService.resolve(resource);
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
						return this.fileService.resolve(resource);
					});
				});
			});
		}).then(undefined, error => {
			if (this.environmentService.verbose) {
				onUnexpectedError(`Unable to write to file '${resource.toString(true)}' as elevated user (${error})`);
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

	//#endregion

	//#region Create File

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

	//#endregion

	//#region Helpers

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

	//#endregion
}
