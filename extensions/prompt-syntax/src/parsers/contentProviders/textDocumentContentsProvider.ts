/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancellationToken } from 'vscode-jsonrpc';
import { CancellationError, TextDocument, TextDocumentChangeEvent, workspace } from 'vscode';

import { ContentsProviderBase } from './contentsProviderBase';
import { newWriteableStream, type ReadableStream, VSBuffer } from '../../utils/vscode';

/**
 * Prompt contents provider for a {@link TextDocument} instance.
 */
// TODO: @legomushroom - add unit tests
export class TextDocumentContentsProvider extends ContentsProviderBase<TextDocumentChangeEvent> {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	public readonly uri = this.textDocument.uri;

	constructor(
		private readonly textDocument: TextDocument,
	) {
		super();

		this._register(workspace.onDidCloseTextDocument((document) => {
			if (document !== this.textDocument) {
				return;
			}

			this.dispose();
		}));

		this._register(workspace.onDidChangeTextDocument((event) => {
			if (event.document !== this.textDocument) {
				return;
			}

			this.onChangeEmitter.fire(event);
		}));
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
		_event: TextDocumentChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<ReadableStream<VSBuffer>> {
		const text = this.textDocument.getText();

		const stream = newWriteableStream<VSBuffer>((chunks) => {
			return VSBuffer.concat(chunks);
		});

		let contentsBuffer = VSBuffer.fromString(text);

		// TODO: @legomushroom
		const CHUNK_SIZE = 4 * 1024;

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
				const chunk = contentsBuffer.slice(0, CHUNK_SIZE);
				stream.write(chunk);
				contentsBuffer = contentsBuffer.slice(CHUNK_SIZE);
			} catch (error) {
				// TODO: @legomushroom - log the error
				console.log(this.uri, error);
			}
		}, 1);

		return stream;

		// // provide the changed lines to the stream incrementally and asynchronously
		// // to avoid blocking the main thread and save system resources used
		// let i = 1;
		// const interval = setInterval(() => {
		// 	// if we have written all lines or lines count is zero,
		// 	// end the stream and stop the interval timer
		// 	if (i >= lineCount) {
		// 		clearInterval(interval);
		// 		stream.end();
		// 		// stream.destroy(); TODO: @legomushroom - remove this?
		// 		return;
		// 	}

		// 	// if model was disposed or cancellation was requested,
		// 	// end the stream with an error and stop the interval timer
		// 	if (this.textDocument.isClosed || cancellationToken?.isCancellationRequested) {
		// 		clearInterval(interval);
		// 		stream.error(new CancellationError());
		// 		stream.destroy();
		// 		return;
		// 	}

		// 	try {
		// 		// write the current line to the stream
		// 		stream.write(
		// 			VSBuffer.fromString(this.textDocument.lineAt(i).text),
		// 		);

		// 		// for all lines except the last one, write the EOL character
		// 		// to separate the lines in the stream
		// 		if (i !== lineCount) {
		// 			const eolString = (this.textDocument.eol === EndOfLine.LF)
		// 				? '\n'
		// 				: '\r\n';

		// 			stream.write(
		// 				VSBuffer.fromString(eolString),
		// 			);
		// 		}
		// 	} catch (error) {
		// 		// TODO: @legomushroom - trace the error instead
		// 		console.log(this.uri, i, error);
		// 	}

		// 	// use the next line in the next iteration
		// 	i++;
		// }, 1);

		// return stream;
	}

	/**
	 * String representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-contents-provider:${this.uri.path}`;
	}
}
