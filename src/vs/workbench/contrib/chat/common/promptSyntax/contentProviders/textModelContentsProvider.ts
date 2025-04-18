/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptContentsProvider } from './types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { FilePromptContentProvider } from './filePromptContentsProvider.js';
import { PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { TextModel } from '../../../../../../editor/common/model/textModel.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { newWriteableStream, ReadableStream } from '../../../../../../base/common/stream.js';
import { IModelContentChangedEvent } from '../../../../../../editor/common/textModelEvents.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';

/**
 * Prompt contents provider for a {@link ITextModel} instance.
 */
export class TextModelContentsProvider extends PromptContentsProviderBase<IModelContentChangedEvent> {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	public get uri(): URI {
		return this.model.uri;
	}

	constructor(
		private readonly model: ITextModel,
		@IInstantiationService private readonly initService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.model.onWillDispose(this.dispose.bind(this)));
		this._register(this.model.onDidChangeContent(this.onChangeEmitter.fire));
	}

	/**
	 * Creates a stream of binary data from the text model based on the changes
	 * listed in the provided event.
	 *
	 * Note! this method implements a basic logic which does not take into account
	 * 		 the `_event` argument for incremental updates. This needs to be improved.
	 *
	 * @param _event - event that describes the changes in the text model; `'full'` is
	 * 				   the special value that means that all contents have changed
	 * @param cancellationToken - token that cancels this operation
	 */
	protected override async getContentsStream(
		_event: IModelContentChangedEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<ReadableStream<VSBuffer>> {
		const stream = newWriteableStream<VSBuffer>(null);

		// the `getLineCount`method throws is model is already disposed
		// hence to be extra safe, we check the model state before getting
		// the number of available lines in the text model
		if (this.model.isDisposed()) {
			stream.end();
			stream.destroy();

			return stream;
		}

		// provide the changed lines to the stream incrementally and asynchronously
		// to avoid blocking the main thread and save system resources used
		let i = 1;
		const linesCount = this.model.getLineCount();
		const interval = setInterval(() => {
			// if we have written all lines or lines count is zero,
			// end the stream and stop the interval timer
			if (i >= linesCount) {
				clearInterval(interval);
				stream.end();
				stream.destroy();
			}

			// if model was disposed or cancellation was requested,
			// end the stream with an error and stop the interval timer
			if (this.model.isDisposed() || cancellationToken?.isCancellationRequested) {
				clearInterval(interval);
				stream.error(new CancellationError());
				stream.destroy();
				return;
			}

			try {
				// write the current line to the stream
				stream.write(
					VSBuffer.fromString(this.model.getLineContent(i)),
				);

				// for all lines except the last one, write the EOL character
				// to separate the lines in the stream
				if (i !== linesCount) {
					stream.write(
						VSBuffer.fromString(this.model.getEOL()),
					);
				}
			} catch (error) {
				this.logService.error(
					[
						'[text model contents provider]: ',
						`Failed to write line #${i} of text model '${this.uri.path}' to stream: `,
					].join(''),
					error,
				);
			}

			// use the next line in the next iteration
			i++;
		}, 1);

		return stream;
	}

	public override createNew(
		promptContentsSource: TextModel | { uri: URI },
	): IPromptContentsProvider {
		if (promptContentsSource instanceof TextModel) {
			return this.initService.createInstance(
				TextModelContentsProvider,
				promptContentsSource,
			);
		}

		return this.initService.createInstance(
			FilePromptContentProvider,
			promptContentsSource.uri,
			{},
		);
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-contents-provider:${this.uri.path}`;
	}
}
