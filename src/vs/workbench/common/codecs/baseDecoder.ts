/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../base/common/stream.js';
import { TStreamListenerNames } from './types/TStreamListenerEventNames.js';

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - when a decoder is disposed, we need to emit/throw errors
// 						 if the object still being used by someone
export abstract class BaseDecoder<T extends NonNullable<unknown>, K = VSBuffer> extends Disposable implements ReadableStream<T> {
	protected ended = false;

	protected readonly _onData = this._register(new Emitter<T>());
	protected readonly _onError = this._register(new Emitter<Error>());
	protected readonly _onEnd = this._register(new Emitter<void>());

	private readonly _listeners: Map<TStreamListenerNames, Map<Function, IDisposable>> = new Map();

	constructor(
		protected readonly stream: ReadableStream<K>
	) {
		super();

		// automatically catch and dispatch errors thrown inside `onStreamData`
		this.onStreamData = (data: K): void => {
			try {
				this.onStreamData(data);
			} catch (error) {
				// TODO: @legomushroom - should we end the stream on the first error?
				this._onError.fire(error);
			}
		};
		this.onStreamError = this.onStreamError.bind(this);
		this.onStreamEnd = this.onStreamEnd.bind(this);

		stream.on('data', this.onStreamData);
		stream.on('error', this.onStreamError);
		stream.on('end', this.onStreamEnd);
	}

	on(event: 'data', callback: (data: T) => void): void;
	on(event: 'error', callback: (err: Error) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: TStreamListenerNames, callback: unknown): void {
		if (event === 'data') {
			return this.addDataListener(callback as (data: T) => void);
		}

		if (event === 'error') {
			return this.addErrorListener(callback as (error: Error) => void);
		}

		if (event === 'end') {
			return this.addEndListener(callback as () => void);
		}

		throw new Error(`Invalid event name: ${event}`);
	}

	/**
	 * TODO: @legomushroom
	 */
	public addDataListener(callback: (data: T) => void): void {
		let currentListeners = this._listeners.get('data');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('data', currentListeners);
		}

		currentListeners.set(callback, this._onData.event(callback));
	}

	/**
	 * TODO: @legomushroom
	 */
	public addErrorListener(callback: (error: Error) => void): void {
		let currentListeners = this._listeners.get('error');

		if (!currentListeners) {
			currentListeners = new Map();
			this._listeners.set('error', currentListeners);
		}

		currentListeners.set(callback, this._onError.event(callback));
	}

	/**
	 * TODO: @legomushroom
	 */
	public addEndListener(callback: () => void): void {
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
		this.stream.removeListener('data', this.onStreamData);
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

	pause(): void {
		this.stream.pause();
	}

	resume(): void {
		this.stream.resume();
	}

	destroy(): void {
		this.dispose();
	}

	removeListener(event: string, callback: Function): void {
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

	public override dispose(): void {
		this.stream.destroy();
		this.removeAllListeners();
		super.dispose();
	}

	/**
	 * TODO: @legomushroom
	 */
	protected abstract onStreamData(data: K): void;

	/**
	 * TODO: @legomushroom
	 */
	protected onStreamEnd(): void {
		this.ended = true;
		this._onEnd.fire();
	}

	/**
	 * TODO: @legomushroom
	 */
	protected onStreamError(error: Error): void {
		// TODO: @legomushroom - define specific error types
		this._onError.fire(error);
	}

	/**
	 * TODO: @legomushroom
	 */
	public next(): Promise<T | null> {
		if (this.ended) {
			return Promise.resolve(null);
		}

		return new Promise<T | null>((resolve) => {
			const endCallback = () => {
				resolve(null);
				this.removeListener('end', endCallback);
			};

			const dataCallback = (data: T) => {
				resolve(data);
				this.removeListener('data', dataCallback);
				this.removeListener('end', endCallback);
			};

			this.on('data', dataCallback);
			this.on('end', endCallback);
		});
	}
}
