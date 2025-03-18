/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';
import { Disposable } from 'vscode';
import { ResolveError } from '../errors';
import { ReadableStream, VSBuffer } from '../../utils/vscode';

/**
 * Interface for a prompt contents provider. Prompt contents providers are
 * responsible for providing contents of a prompt as a byte streams and
 * allow to subscribe to the change events of the prompt contents.
 */
export interface IContentsProvider extends Disposable {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	readonly uri: URI;

	/**
	 * Start the contents provider to produce the underlying contents.
	 */
	start(): this;

	/**
	 * Event that fires when the prompt contents change. The event is either a
	 * {@linkcode VSBufferReadableStream} stream with changed contents or
	 * an instance of the {@linkcode ResolveError} error.
	 */
	onContentChanged(
		callback: (streamOrError: ReadableStream<VSBuffer> | ResolveError) => void,
	): Disposable;
}
