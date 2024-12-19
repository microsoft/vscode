/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../editor/common/model.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Line } from '../../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { newWriteableStream, ReadableStream } from '../../../../../base/common/stream.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';

/**
 * Prompt contents provider for a {@linkcode ITextModel} instance.
 */
export class TextModelContentsProvider extends PromptContentsProviderBase<IModelContentChangedEvent> {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	public readonly uri = this.model.uri;

	constructor(
		private readonly model: ITextModel,
	) {
		super();

		this._register(this.model.onWillDispose(this.dispose.bind(this)));
		this._register(this.model.onDidChangeContent(this.onChangeEmitter.fire));
	}

	/**
	 * Creates a stream of lines from the text model based on the changes listed in
	 * the provided event.
	 *
	 * @param _event - event that describes the changes in the text model; `'full'` is
	 * 				   the special value that means that all contents have changed
	 * @param cancellationToken - token that cancels this operation
	 */
	protected override async getContentsStream(
		_event: IModelContentChangedEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<ReadableStream<Line>> {
		// TODO: @legomushroom - use the `event` for incremental updates

		const stream = newWriteableStream<Line>(null);
		const linesCount = this.model.getLineCount();

		// provide the changed lines to the stream incrementaly and asynchronously
		// to avoid blocking the main thread and save system resources used
		let i = 0;
		const interval = setInterval(() => {
			if (this.model.isDisposed() || cancellationToken?.isCancellationRequested) {
				clearInterval(interval);
				stream.error(new CancellationError());
				stream.end();
				return;
			}

			// write the current line to the stream;
			// line numbers are `1-based` hence the `i + 1`
			stream.write(
				new Line(i + 1, this.model.getLineContent(i)),
			);

			// use the next line in the next iteration
			i++;

			// if we have written all lines, end the stream and stop
			// the interval timer
			if (i >= linesCount) {
				clearInterval(interval);
				stream.end();
			}
		}, 1);

		return stream;
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-contents-provider:${this.uri.path}`;
	}
}
