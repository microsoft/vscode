/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../assert.js';
import { Emitter } from '../event.js';
import { IDisposable } from '../lifecycle.js';
import { ReadableStream } from '../stream.js';
import { DeferredPromise } from '../async.js';
import { AsyncDecoder } from './asyncDecoder.js';
import { ObservableDisposable } from '../observableDisposable.js';

/**
 * Event names of {@link ReadableStream} stream.
 */
export type TStreamListenerNames = 'data' | 'error' | 'end';

/**
 * Base decoder class that can be used to convert stream messages data type
 * from one type to another. For instance, a stream of binary data can be
 * "decoded" into a stream of well defined objects.
 * Intended to be a part of "codec" implementation rather than used directly.
 */
export abstract class BaseDecoder<
	T extends NonNullable<unknown>,
	K extends NonNullable<unknown> = NonNullable<unknown>,
> extends ObservableDisposable implements ReadableStream<T> {
	/**
	 * Private attribute to track if the stream has ended.
	 */
	private _ended = false;

	protected readonly _onData = this._register(new Emitter<T>());
	private readonly _onEnd = this._register(new Emitter<void>());
	private readonly _onError = this._register(new Emitter<Error>());

	/**
	 * A store of currently registered event listeners.
	 */
	private readonly _listeners: Map<TStreamListenerNames, Map<Function, IDisposable>> = new Map();

	/**
	 * This method is called when a new incomming data
	 * is received from the input stream.
	 */
	protected abstract onStreamData(data: K): void;

	/**
	 * @param stream The input stream to decode.
	 */
	constructor(
		protected readonly stream: ReadableStream<K>,
	) {
		super();

		this.tryOnStreamData = this.tryOnStreamData.bind(this);
		this.onStreamError = this.onStreamError.bind(this);
		this.onStreamEnd = this.onStreamEnd.bind(this);
	}

	/**
	 * Private attribute to track if the stream has started.
	 */
	private started = false;

	/**
	 * Promise that resolves when the stream has ended, either by
	 * receiving the `end` event or by a disposal, but not when
	 * the `error` event is received alone.
	 */
	private settledPromise = new DeferredPromise<void>();

	/**
	 * Promise that resolves when the stream has ended, either by
	 * receiving the `end` event or by a disposal, but not when
	 * the `error` event is received alone.
	 *
	 * @throws If the stream was not yet started to prevent this
	 * 		   promise to block the consumer calls indefinitely.
	 */
	public get settled(): Promise<void> {
		// if the stream has not started yet, the promise might
		// block the consumer calls indefinitely if they forget
		// to call the `start()` method, or if the call happens
		// after await on the `settled` promise; to forbid this
		// confusion, we require the stream to be started first
		assert(
			this.started,
			[
				'Cannot get `settled` promise of a stream that has not been started.',
				'Please call `start()` first.',
			].join(' '),
		);

		return this.settledPromise.p;
	}

	/**
	 * Start receiveing data from the stream.
	 * @throws if the decoder stream has already ended.
	 */
	public start(): this {
		assert(
			!this._ended,
			'Cannot start stream that has already ended.',
		);
		assert(
			!this.disposed,
			'Cannot start stream that has already disposed.',
		);

		// if already started, nothing to do
		if (this.started) {
			return this;
		}
		this.started = true;

		this.stream.on('data', this.tryOnStreamData);
		this.stream.on('error', this.onStreamError);
		this.stream.on('end', this.onStreamEnd);

		// this allows to compose decoders together, - if a decoder
		// instance is passed as a readble stream to this decoder,
		// then we need to call `start` on it too
		if (this.stream instanceof BaseDecoder) {
			this.stream.start();
		}

		return this;
	}

	/**
	 * Check if the decoder has been ended hence has
	 * no more data to produce.
	 */
	public get ended(): boolean {
		return this._ended;
	}

	/**
	 * Automatically catch and dispatch errors thrown inside `onStreamData`.
	 */
	private tryOnStreamData(data: K): void {
		try {
			this.onStreamData(data);
		} catch (error) {
			this.onStreamError(error);
		}
	}

	public on(event: 'data', callback: (data: T) => void): void;
	public on(event: 'error', callback: (err: Error) => void): void;
	public on(event: 'end', callback: () => void): void;
	public on(event: TStreamListenerNames, callback: unknown): void {
		if (event === 'data') {
			return this.onData(callback as (data: T) => void);
		}

		if (event === 'error') {
			return this.onError(callback as (error: Error) => void);
		}

		if (event === 'end') {
			return this.onEnd(callback as () => void);
		}

		throw new Error(`Invalid event name: ${event}`);
	}

	/**
	 * Add listener for the `data` event.
	 * @throws if the decoder stream has already ended.
	 */
	public onData(callback: (data: T) => void): void {
		assert(
			!this.ended,
			'Cannot subscribe to the `data` event because the decoder stream has already ended.',
		);

		let currentListeners = this._listeners.get('data');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('data', currentListeners);
		}

		currentListeners.set(callback, this._onData.event(callback));
	}

	/**
	 * Add listener for the `error` event.
	 * @throws if the decoder stream has already ended.
	 */
	public onError(callback: (error: Error) => void): void {
		assert(
			!this.ended,
			'Cannot subscribe to the `error` event because the decoder stream has already ended.',
		);

		let currentListeners = this._listeners.get('error');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('error', currentListeners);
		}

		currentListeners.set(callback, this._onError.event(callback));
	}

	/**
	 * Add listener for the `end` event.
	 * @throws if the decoder stream has already ended.
	 */
	public onEnd(callback: () => void): void {
		assert(
			!this.ended,
			'Cannot subscribe to the `end` event because the decoder stream has already ended.',
		);

		let currentListeners = this._listeners.get('end');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('end', currentListeners);
		}

		currentListeners.set(callback, this._onEnd.event(callback));
	}

	/**
	 * Remove all existing event listeners.
	 */
	public removeAllListeners(): void {
		// remove listeners set up by this class
		this.stream.removeListener('data', this.tryOnStreamData);
		this.stream.removeListener('error', this.onStreamError);
		this.stream.removeListener('end', this.onStreamEnd);

		// remove listeners set up by external consumers
		for (const [name, listeners] of this._listeners.entries()) {
			this._listeners.delete(name);
			for (const [listener, disposable] of listeners) {
				disposable.dispose();
				listeners.delete(listener);
			}
		}
	}

	/**
	 * Pauses the stream.
	 */
	public pause(): void {
		this.stream.pause();
	}

	/**
	 * Resumes the stream if it has been paused.
	 * @throws if the decoder stream has already ended.
	 */
	public resume(): void {
		assert(
			!this.ended,
			'Cannot resume the stream because it has already ended.',
		);

		this.stream.resume();
	}

	/**
	 * Destroys(disposes) the stream.
	 */
	public destroy(): void {
		this.dispose();
	}

	/**
	 * Removes a priorly-registered event listener for a specified event.
	 *
	 * Note!
	 *  - the callback function must be the same as the one that was used when
	 * 	  registering the event listener as it is used as an identifier to
	 *    remove the listener
	 *  - this method is idempotent and results in no-op if the listener is
	 *    not found, therefore passing incorrect `callback` function may
	 *    result in silent unexpected behaviour
	 */
	public removeListener(event: string, callback: Function): void {
		for (const [nameName, listeners] of this._listeners.entries()) {
			if (nameName !== event) {
				continue;
			}

			for (const [listener, disposable] of listeners) {
				if (listener !== callback) {
					continue;
				}

				disposable.dispose();
				listeners.delete(listener);
			}
		}
	}

	/**
	 * This method is called when the input stream ends.
	 */
	protected onStreamEnd(): void {
		if (this._ended) {
			return;
		}

		this._ended = true;
		this._onEnd.fire();
		this.settledPromise.complete();
	}

	/**
	 * This method is called when the input stream emits an error.
	 * We re-emit the error here by default, but subclasses can
	 * override this method to handle the error differently.
	 */
	protected onStreamError(error: Error): void {
		this._onError.fire(error);
	}

	/**
	 * Consume all messages from the stream, blocking until the stream finishes.
	 * @throws if the decoder stream has already ended.
	 */
	public async consumeAll(): Promise<T[]> {
		assert(
			!this._ended,
			'Cannot consume all messages of the stream that has already ended.',
		);

		const messages = [];

		for await (const maybeMessage of this) {
			if (maybeMessage === null) {
				break;
			}

			messages.push(maybeMessage);
		}

		return messages;
	}

	/**
	 * Async iterator interface for the decoder.
	 * @throws if the decoder stream has already ended.
	 */
	[Symbol.asyncIterator](): AsyncIterator<T | null> {
		assert(
			!this._ended,
			'Cannot iterate on messages of the stream that has already ended.',
		);

		const asyncDecoder = this._register(new AsyncDecoder(this));

		return asyncDecoder[Symbol.asyncIterator]();
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}

		this.onStreamEnd();

		this.stream.destroy();
		this.removeAllListeners();
		super.dispose();
	}
}
