/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import * as fs from 'fs';
import * as assert from 'assert';
import { FileOperationEvent, IContent, IResolveContentOptions, IFileStat, IStreamContent, FileOperationError, FileOperationResult, IContentData, ILegacyFileService, IFileService, IFileSystemProvider } from 'vs/platform/files/common/files';
import { MAX_FILE_SIZE, MAX_HEAP_SIZE } from 'vs/platform/files/node/fileConstants';
import { URI as uri } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { detectEncodingFromBuffer, decodeStream } from 'vs/base/node/encoding';
import { Event, Emitter } from 'vs/base/common/event';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IEncodingOverride, ResourceEncodings } from 'vs/workbench/services/files/node/encoding';
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

	//#region Helpers

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
