/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptContentsProvider } from './types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { assert } from '../../../../../../base/common/assert.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { VSBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ObservableDisposable } from '../../../../../../base/common/observableDisposable.js';
import { FailedToResolveContentsStream, ResolveError } from '../../promptFileReferenceErrors.js';
import { cancelPreviousCalls } from '../../../../../../base/common/decorators/cancelPreviousCalls.js';

/**
 * Options of the {@link PromptContentsProviderBase} class.
 */
export interface IPromptContentsProviderOptions {
	/**
	 * Whether to allow files that don't have usual prompt
	 * file extension to be treated as a prompt file.
	 */
	readonly allowNonPromptFiles: boolean;
}

/**
 * Default {@link IPromptContentsProviderOptions} options.
 */
export const DEFAULT_OPTIONS: IPromptContentsProviderOptions = {
	allowNonPromptFiles: false,
};

/**
 * Base class for prompt contents providers. Classes that extend this one are responsible to:
 *
 * - implement the {@link getContentsStream} method to provide the contents stream
 *   of a prompt; this method should throw a `ResolveError` or its derivative if the contents
 *   cannot be parsed for any reason
 * - fire a {@link TChangeEvent} event on the {@link onChangeEmitter} event when
 * 	 prompt contents change
 * - misc:
 *   - provide the {@link uri} property that represents the URI of a prompt that
 *     the contents are for
 *   - implement the {@link toString} method to return a string representation of this
 *     provider type to aid with debugging/tracing
 */
export abstract class PromptContentsProviderBase<
	TChangeEvent extends NonNullable<unknown>,
> extends ObservableDisposable implements IPromptContentsProvider {
	public abstract readonly uri: URI;
	public abstract createNew(promptContentsSource: { uri: URI }): IPromptContentsProvider;
	public abstract override toString(): string;
	public abstract get languageId(): string;
	public abstract get sourceName(): string;

	/**
	 * Function to get contents stream for the provider. This function should
	 * throw a `ResolveError` or its derivative if the contents cannot be parsed.
	 *
	 * @param changesEvent The event that triggered the change. The special
	 * `'full'` value means  that everything has changed hence entire prompt
	 * contents need to be re-parsed from scratch.
	 */
	protected abstract getContentsStream(
		changesEvent: TChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<VSBufferReadableStream>;

	/**
	 * Internal event emitter for the prompt contents change event. Classes that extend
	 * this abstract class are responsible to use this emitter to fire the contents change
	 * event when the prompt contents get modified.
	 */
	protected readonly onChangeEmitter = this._register(new Emitter<TChangeEvent | 'full'>());

	/**
	 * Options passed to the constructor, extended with
	 * value defaults from {@link DEFAULT_OPTIONS}.
	 */
	protected readonly options: IPromptContentsProviderOptions;

	constructor(
		options: Partial<IPromptContentsProviderOptions>,
	) {
		super();

		this.options = {
			...DEFAULT_OPTIONS,
			...options,
		};

		// ensure that the `onChangeEmitter` always fires with the correct context
		this.onChangeEmitter.fire = this.onChangeEmitter.fire.bind(this.onChangeEmitter);
	}

	/**
	 * Event emitter for the prompt contents change event.
	 * See {@link onContentChanged} for more details.
	 */
	private readonly onContentChangedEmitter = this._register(new Emitter<VSBufferReadableStream | ResolveError>());

	/**
	 * Event that fires when the prompt contents change. The event is either
	 * a `VSBufferReadableStream` stream with changed contents or an instance of
	 * the `ResolveError` class representing a parsing failure case.
	 *
	 * `Note!` this field is meant to be used by the external consumers of the prompt
	 *         contents provider that the classes that extend this abstract class.
	 *         Please use the {@link onChangeEmitter} event to provide a change
	 *         event in your prompt contents implementation instead.
	 */
	public readonly onContentChanged = this.onContentChangedEmitter.event;

	/**
	 * Internal common implementation of the event that should be fired when
	 * prompt contents change.
	 */
	@cancelPreviousCalls
	private onContentsChanged(
		event: TChangeEvent | 'full',
		cancellationToken?: CancellationToken,
	): this {
		const promise = (cancellationToken?.isCancellationRequested)
			? Promise.reject(new CancellationError())
			: this.getContentsStream(event, cancellationToken);

		promise
			.then((stream) => {
				if (cancellationToken?.isCancellationRequested || this.disposed) {
					stream.destroy();
					throw new CancellationError();
				}

				this.onContentChangedEmitter.fire(stream);
			})
			.catch((error) => {
				if (error instanceof ResolveError) {
					this.onContentChangedEmitter.fire(error);

					return;
				}

				this.onContentChangedEmitter.fire(
					new FailedToResolveContentsStream(this.uri, error),
				);
			});

		return this;
	}

	/**
	 * Start producing the prompt contents data.
	 */
	public start(): this {
		assert(
			!this.disposed,
			'Cannot start contents provider that was already disposed.',
		);

		// `'full'` means "everything has changed"
		this.onContentsChanged('full');

		// subscribe to the change event emitted by a child class
		this._register(this.onChangeEmitter.event(this.onContentsChanged, this));

		return this;
	}
}
