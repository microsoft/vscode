/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileOpenFailed, ParseError } from './promptFileReferenceErrors.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { cancelPreviousCalls } from '../../../../base/common/decorators/cancelPreviousCalls.js';

/**
 * TODO: @legomushroom
 */
export interface IPromptContentsProvider extends IDisposable {
	/**
	 * URI component of the prompt associated with this contents provider.
	 */
	readonly uri: URI;

	/**
	 * TODO: @legomushroom
	 */
	start(): void;

	/**
	 * TODO: @legomushroom
	 */
	onContentChanged(
		callback: (streamOrError: ReadableStream<Line> | ParseError) => void,
	): IDisposable;
}

/**
 * Base class for prompt contents providers. Classes that extend this one are responsible to:
 *
 * - implement the {@linkcode getContentsStream} method to provide the contents stream
 *   of a prompt; this method should throw a `ParseError` or its derivative if the contents
 *   cannot be parsed for any reason
 * - fire a {@linkcode TChangeEvent} event on the {@linkcode onChangeEmitter} event when
 * 	 prompt contents change
 * - misc:
 *   - provide the {@linkcode uri} property that represents the URI of a prompt that
 *     the contents are for
 *   - implement the {@linkcode toString} method to return a string representation of this
 *     provider type to aid with debugging/tracing
 *
 * ### Examples
 *
 * ```typescript
 * console.log('TODO: @legomushroom - add the example');
 * ```
 *
 * TODO: @legomushroom - move to a correct place
 */
export abstract class PromptContentsProviderBase<
	TChangeEvent extends NonNullable<unknown>,
> extends Disposable implements IPromptContentsProvider {
	/**
	 * Internal event emitter for the prompt contents change event. Classes that extend
	 * this abstract class are responsible to use this emitter to fire the contents change
	 * event when the prompt contents get modified.
	 */
	protected readonly onChangeEmitter = this._register(new Emitter<TChangeEvent | 'full'>());

	constructor() {
		super();
		// ensure that the `onChangeEmitter` always fires with the correct context
		this.onChangeEmitter.fire = this.onChangeEmitter.fire.bind(this.onChangeEmitter);
		// subscribe to the change event emitted by an extending class
		this._register(this.onChangeEmitter.event(this.onChangeHandler, this));
	}

	/**
	 * Function to get contents stream for the provider. This function should
	 * throw a `ParseError` or its derivative if the contents cannot be parsed.
	 *
	 * @param changesEvent The event that triggered the change. The special
	 * `'full'` value means  that everything has changed hence entire prompt
	 * contents need to be re-parsed from scratch.
	 */
	protected abstract getContentsStream(
		changesEvent: TChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<ReadableStream<Line>>;

	/**
	 * URI reference associated with the prompt contents.
	 */
	public abstract readonly uri: URI;

	/**
	 * Return a string representation of this object
	 * for debugging/tracing purposes.
	 */
	public abstract override toString(): string;

	/**
	 * Event emitter for the prompt contents change event.
	 * See {@linkcode onContentChanged} for more details.
	 */
	private readonly onContentChangedEmitter = this._register(new Emitter<ReadableStream<Line> | ParseError>());

	/**
	 * Event that fires when the prompt contents change. The event is either
	 * a `ReadableStream<Line>` stream with changed lines or an instance of
	 * the `ParseError` class representing a parsing failure case.
	 *
	 * `Note!` this field is meant to be used by the external consumers of the prompt
	 *         contents provider that the classes that extend this abstract class.
	 *         Please use the {@linkcode onChangeEmitter} event to provide a change
	 *         event in your prompt contents implementation instead.
	 */
	public readonly onContentChanged = this.onContentChangedEmitter.event;

	/**
	 * Internal common implementation of the event that should be fired when
	 * prompt contents change.
	 */
	@cancelPreviousCalls
	private onChangeHandler(
		event: TChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): this {
		const promise = (cancellationToken?.isCancellationRequested)
			? Promise.reject(new CancellationError())
			: this.getContentsStream(event, cancellationToken);

		promise
			.then((stream) => {
				if (cancellationToken?.isCancellationRequested) {
					stream.destroy();
					throw new CancellationError();
				}

				this.onContentChangedEmitter.fire(stream);
			})
			.catch((error) => {
				if (error instanceof ParseError) {
					this.onContentChangedEmitter.fire(error);

					return;
				}

				// TODO: @legomushroom - use a better error type
				this.onContentChangedEmitter.fire(new FileOpenFailed(this.uri, error));
			});

		return this;
	}

	/**
	 * Initiate parsing the contents.
	 */
	public start(): this {
		// TODO: @legomushroom - throw if disposed?

		// `'full'` means "everything has changed"
		this.onChangeHandler('full');

		return this;
	}
}
