/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vscode-uri';
import { CancellationToken } from 'vscode-jsonrpc';
import { CancellationError, FileType } from 'vscode';

import { IContentsProvider } from './types';
import { ContentsProviderBase } from './contentsProviderBase';
import { assertDefined, assertNever } from '../../utils/asserts';
import { DEFAULT_CONTENTS_STREAM_CHUNK_SIZE } from './constants';
import { FolderReference, NotPromptFile, OpenFailed, ResolveError } from '../errors';
import { newWriteableStream, type ReadableStream, VSBuffer } from '../../utils/vscode';
import { IFileSystemService, FileChangeEvent, ILogService } from '../../services/types';

/**
 * Prompt contents provider for a file on the disk referenced by the provided file {@link URI}.
 */
export class FileContentsProvider extends ContentsProviderBase<FileChangeEvent> implements IContentsProvider {
	constructor(
		public readonly uri: URI,
		private readonly fileService: IFileSystemService,
		private readonly logService: ILogService,
	) {
		super();

		// make sure the object is updated on file changes
		this._register(
			this.fileService.onFileChange(this.uri, (event) => {
				// if file was added or updated, forward the event to
				// the `getContentsStream()` produce a new stream for file contents
				if ((event === FileChangeEvent.ADDED) || (event === FileChangeEvent.UPDATED)) {
					// we support only full file parsing right now because
					// the event doesn't contain a list of changed lines
					return this.onChangeEmitter.fire('full');
				}

				// if file was deleted, forward the event to
				// the `getContentsStream()` produce an error
				if (event === FileChangeEvent.DELETED) {
					return this.onChangeEmitter.fire(event);
				}

				assertNever(
					event,
					`Unexpected file change event '${event}'.`,
				);
			}),
		);
	}

	/**
	 * Creates a stream of lines from the file based on the changes listed in
	 * the provided event.
	 *
	 * @param event - event that describes the changes in the file; `'full'` is
	 * 				  the special value that means that all contents have changed
	 * @param cancellationToken - token that cancels this operation
	 */
	protected async getContentsStream(
		_event: FileChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<ReadableStream<VSBuffer>> {
		assert(
			!cancellationToken?.isCancellationRequested,
			new CancellationError(),
		);

		// get the binary stream of the file contents
		let fileContents: Uint8Array | undefined;
		try {
			// ensure that the referenced URI points to a file before
			// trying to get a stream for its contents
			const info = await this.fileService.stat(this.uri);

			// validate that the cancellation was not yet requested
			assert(
				!cancellationToken?.isCancellationRequested,
				new CancellationError(),
			);

			assert(
				info.type === FileType.File,
				new FolderReference(this.uri),
			);

			fileContents = await this.fileService.readFile(this.uri);
		} catch (error) {
			if (error instanceof ResolveError) {
				throw error;
			}

			throw new OpenFailed(this.uri, error);
		}

		assertDefined(
			fileContents,
			new OpenFailed(this.uri, 'Failed to open file.'),
		);

		// after the promise above complete, this object can be already disposed or
		// the cancellation could be requested, in that case destroy the stream and
		// throw cancellation error
		if (this.disposed || cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}

		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (!this.isPromptSnippet()) {
			throw new NotPromptFile(this.uri);
		}

		const stream = newWriteableStream<VSBuffer>((chunks) => {
			return VSBuffer.concat(chunks);
		});

		let contentsBuffer = VSBuffer.fromByteArray([...fileContents]);

		const interval = setInterval(() => {
			// if we have written all contents then end the stream
			// and stop the interval timer
			if (contentsBuffer.byteLength === 0) {
				clearInterval(interval);
				stream.end();
				// stream.destroy(); // TODO: @legomushroom - remove
				return;
			}

			// if model was disposed or cancellation was requested,
			// end the stream with an error and stop the interval timer
			if (this.disposed || cancellationToken?.isCancellationRequested) {
				clearInterval(interval);
				stream.error(new CancellationError());
				stream.destroy();
				return;
			}

			try {
				// write the current line to the stream
				const chunk = contentsBuffer.slice(0, DEFAULT_CONTENTS_STREAM_CHUNK_SIZE);
				stream.write(chunk);
				contentsBuffer = contentsBuffer.slice(DEFAULT_CONTENTS_STREAM_CHUNK_SIZE);
			} catch (error) {
				this.logService.warn(`[${this}] failed to write a chunk to the stream`, error);
			}
		}, 1);

		return stream;
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
