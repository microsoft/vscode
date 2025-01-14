/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { VSBufferReadableStream } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { FileOpenFailed, NonPromptSnippetFile } from '../promptFileReferenceErrors.js';
import { IPromptContentsProvider, PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';

/**
 * Prompt contents provider for a file on the disk referenced by the provided {@linkcode URI}.
 */
export class FilePromptContentProvider extends PromptContentsProviderBase<FileChangesEvent> implements IPromptContentsProvider {
	/**
	 * Whether current file was deleted.
	 */
	private deleted = false;

	constructor(
		public readonly uri: URI,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
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
		event: FileChangesEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream> {
		if (cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}

		const addedEvent = event !== 'full' && event.contains(this.uri, FileChangeType.ADDED);
		const deletedEvent = event !== 'full' && event.contains(this.uri, FileChangeType.DELETED);

		// if file has been deleted, throw an the file open error
		if (deletedEvent) {
			if (this.deleted) {
				this.logService.warn(
					[
						`Received 'deleted' event for file at '${this.uri.path}', but it was already previously deleted.`,
						'This most likely indicates a bug in our logic, so please report it.',
					].join(' '),
				);
			}

			this.deleted = true;
			throw new FileOpenFailed(this.uri, 'Failed to open non-existing file.');
		}

		// if we receive an `add` event, validate that the file was previously deleted, because
		// that is the only way we could have end up in this state of the file reference object
		if (addedEvent && !this.deleted) {
			this.logService.warn(
				[
					`Received 'add' event for file at '${this.uri.path}', but it was not previously deleted.`,
					'This most likely indicates a bug in our logic, so please report it.',
				].join(' '),
			);
		}

		// get the binary stream of the file contents
		let fileStream;
		try {
			fileStream = await this.fileService.readFileStream(this.uri);
		} catch (error) {
			throw new FileOpenFailed(this.uri, error);
		}

		assertDefined(
			fileStream,
			new FileOpenFailed(this.uri, 'Failed to open file stream.'),
		);

		// after the promise above complete, this object can be already disposed or
		// the cancellation could be requested, in that case destroy the stream and
		// throw cancellation error
		if (this.disposed || cancellationToken?.isCancellationRequested) {
			fileStream.value.destroy();
			throw new CancellationError();
		}

		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (!this.isPromptSnippet()) {
			throw new NonPromptSnippetFile(this.uri);
		}

		return fileStream.value;
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
