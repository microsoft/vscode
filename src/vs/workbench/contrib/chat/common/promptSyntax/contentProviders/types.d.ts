/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ResolveError } from '../../promptFileReferenceErrors.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';

/**
 * Interface for a prompt contents provider. Prompt contents providers are
 * responsible for providing contents of a prompt as a byte streams and
 * allow to subscribe to the change events of the prompt contents.
 */
export interface IPromptContentsProvider extends IDisposable {
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
		callback: (streamOrError: VSBufferReadableStream | ResolveError) => void,
	): IDisposable;

	/**
	 * Subscribe to `onDispose` event of the contents provider.
	 */
	onDispose(callback: () => void): this;

	/**
	 * Create a new instance of prompt contents provider.
	 */
	createNew(
		promptContentsSource: { uri: URI },
	): IPromptContentsProvider;
}
