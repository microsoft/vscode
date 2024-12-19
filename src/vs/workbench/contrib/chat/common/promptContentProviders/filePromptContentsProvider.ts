/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BaseDecoder } from '../../../../../base/common/codecs/baseDecoder.js';
import { Line } from '../../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { FileOpenFailed, NotPromptSnippetFile } from '../promptFileReferenceErrors.js';
import { LinesDecoder } from '../../../../../editor/common/codecs/linesCodec/linesDecoder.js';
import { IPromptContentsProvider, PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';

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
	): Promise<BaseDecoder<Line>> {
		if (cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}

		// if file has been deleted, throw an the file open error
		if (event !== 'full' && event.contains(this.uri, FileChangeType.DELETED)) {
			throw new FileOpenFailed(this.uri, 'Failed to open non-existing file.');
		}

		// get the binary stream of the file contents
		const fileStream = await this.fileService.readFileStream(this.uri);
		assertDefined(
			fileStream,
			new FileOpenFailed(this.uri, 'Failed to open file stream.'),
		);

		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (!this.isPromptSnippet()) {
			throw new NotPromptSnippetFile(this.uri);
		}

		// ensure that operation was not yet cancelled
		if (cancellationToken?.isCancellationRequested) {
			fileStream.value.destroy();
			throw new CancellationError();
		}

		// create a stream of lines from the file stream
		const stream = new LinesDecoder(fileStream.value)
			// filter out all non-line tokens from the stream
			.transform((token) => {
				if (token instanceof Line) {
					return token;
				}

				return null;
			});

		return stream;
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
