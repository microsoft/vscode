/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptContentsProvider } from './types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
import { OpenFailed, NotPromptFile, ResolveError, FolderReference } from '../../promptFileReferenceErrors.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../../platform/files/common/files.js';

/**
 * Prompt contents provider for a file on the disk referenced by the provided {@linkcode URI}.
 */
export class FilePromptContentProvider extends PromptContentsProviderBase<FileChangesEvent> implements IPromptContentsProvider {
	constructor(
		public readonly uri: URI,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		// make sure the object is updated on file changes
		this._register(
			this.fileService.onDidFilesChange((event) => {
				// if file was added or updated, forward the event to
				// the `getContentsStream()` produce a new stream for file contents
				if (event.contains(this.uri, FileChangeType.ADDED, FileChangeType.UPDATED)) {
					// we support only full file parsing right now because
					// the event doesn't contain a list of changed lines
					return this.onChangeEmitter.fire('full');
				}

				// if file was deleted, forward the event to
				// the `getContentsStream()` produce an error
				if (event.contains(this.uri, FileChangeType.DELETED)) {
					return this.onChangeEmitter.fire(event);
				}
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
		_event: FileChangesEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream> {
		assert(
			!cancellationToken?.isCancellationRequested,
			new CancellationError(),
		);

		// get the binary stream of the file contents
		let fileStream;
		try {
			// ensure that the referenced URI points to a file before
			// trying to get a stream for its contents
			const info = await this.fileService.resolve(this.uri);

			// validate that the cancellation was not yet requested
			assert(
				!cancellationToken?.isCancellationRequested,
				new CancellationError(),
			);

			assert(
				info.isFile,
				new FolderReference(this.uri),
			);

			fileStream = await this.fileService.readFileStream(this.uri);
		} catch (error) {
			if (error instanceof ResolveError) {
				throw error;
			}

			throw new OpenFailed(this.uri, error);
		}

		assertDefined(
			fileStream,
			new OpenFailed(this.uri, 'Failed to open file stream.'),
		);

		// after the promise above complete, this object can be already disposed or
		// the cancellation could be requested, in that case destroy the stream and
		// throw cancellation error
		if (this.disposed || cancellationToken?.isCancellationRequested) {
			fileStream.value.destroy();
			throw new CancellationError();
		}

		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (isPromptFile(this.uri) === false) {
			throw new NotPromptFile(this.uri);
		}

		return fileStream.value;
	}

	public override createNew(
		promptContentsSource: { uri: URI },
	): IPromptContentsProvider {
		return new FilePromptContentProvider(
			promptContentsSource.uri,
			this.fileService,
		);
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
