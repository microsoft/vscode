/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PROMPT_LANGUAGE_ID } from '../promptTypes.js';
import { IPromptContentsProvider } from './types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { isPromptOrInstructionsFile } from '../config/promptFileLocations.js';
import { IPromptContentsProviderOptions, PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { OpenFailed, NotPromptFile, ResolveError, FolderReference } from '../../promptFileReferenceErrors.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../../../platform/files/common/files.js';

/**
 * Prompt contents provider for a file on the disk referenced by
 * a provided {@link URI}.
 */
export class FilePromptContentProvider extends PromptContentsProviderBase<FileChangesEvent> implements IPromptContentsProvider {
	public override get sourceName(): string {
		return 'file';
	}

	public override get languageId(): string {
		if (this.options.languageId) {
			return this.options.languageId;
		}

		const model = this.modelService.getModel(this.uri);

		if (model !== null) {
			return model.getLanguageId();
		}

		const inferredId = this.languageService
			.guessLanguageIdByFilepathOrFirstLine(this.uri);

		if (inferredId !== null) {
			return inferredId;
		}

		// fallback to the default prompt language ID
		return PROMPT_LANGUAGE_ID;
	}

	constructor(
		public readonly uri: URI,
		options: IPromptContentsProviderOptions,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super(options);

		if (options.updateOnChange) {
			// make sure the object is updated on file changes
			this._register(
				this.fileService.onDidFilesChange((event) => {
					// if file was added or updated, forward the event to
					// the `getContentsStream()` produce a new stream for file contents
					if (event.contains(this.uri, FileChangeType.ADDED, FileChangeType.UPDATED)) {
						// we support only full file parsing right now because
						// the event doesn't contain a list of changed lines
						this.onChangeEmitter.fire('full');
						return;
					}

					// if file was deleted, forward the event to
					// the `getContentsStream()` produce an error
					if (event.contains(this.uri, FileChangeType.DELETED)) {
						this.onChangeEmitter.fire(event);
						return;
					}
				}),
			);
		}
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

			const { allowNonPromptFiles } = this.options;

			// if URI doesn't point to a prompt file, don't try to resolve it,
			// unless the `allowNonPromptFiles` option is set to `true`
			if ((allowNonPromptFiles !== true) && (isPromptOrInstructionsFile(this.uri) === false)) {
				throw new NotPromptFile(this.uri);
			}

			fileStream = await this.fileService.readFileStream(this.uri);

			// after the promise above complete, this object can be already disposed or
			// the cancellation could be requested, in that case destroy the stream and
			// throw cancellation error
			if (this.isDisposed || cancellationToken?.isCancellationRequested) {
				fileStream.value.destroy();
				throw new CancellationError();
			}

			return fileStream.value;
		} catch (error) {
			if ((error instanceof ResolveError) || (error instanceof CancellationError)) {
				throw error;
			}

			throw new OpenFailed(this.uri, error);
		}
	}

	public override createNew(
		promptContentsSource: { uri: URI },
		options: IPromptContentsProviderOptions,
	): IPromptContentsProvider {
		return new FilePromptContentProvider(
			promptContentsSource.uri,
			options,
			this.fileService,
			this.modelService,
			this.languageService,
		);
	}

	/**
	 * String representation of this object.
	 */
	public override toString(): string {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
