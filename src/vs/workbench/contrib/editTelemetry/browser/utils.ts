/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservableWithChange, observableValue, runOnChange, transaction } from '../../../../base/common/observable.js';

export function sumByCategory<T, TCategory extends string>(items: readonly T[], getValue: (item: T) => number, getCategory: (item: T) => TCategory): Record<TCategory, number | undefined> {
	return items.reduce((acc, item) => {
		const category = getCategory(item);
		acc[category] = (acc[category] || 0) + getValue(item);
		return acc;
	}, {} as any as Record<TCategory, number>);
}
export function mapObservableDelta<T, TDelta, TDeltaNew>(obs: IObservableWithChange<T, TDelta>, mapFn: (value: TDelta) => TDeltaNew, store: DisposableStore): IObservableWithChange<T, TDeltaNew> {
	const obsResult = observableValue<T, TDeltaNew>('mapped', obs.get());
	store.add(runOnChange(obs, (value, _prevValue, changes) => {
		transaction(tx => {
			for (const c of changes) {
				obsResult.set(value, tx, mapFn(c));
			}
		});
	}));
	return obsResult;
}
export const AsyncReaderEndOfStream = Symbol('AsyncReaderEndOfStream');

export class AsyncReader<T> {
	private _buffer: T[] = [];
	private _atEnd = false;

	public get endOfStream(): boolean { return this._buffer.length === 0 && this._atEnd; }
	private _extendBufferPromise: Promise<void> | undefined;

	constructor(
		private readonly _source: AsyncIterator<T>
	) {
	}

	private async _extendBuffer(): Promise<void> {
		if (this._atEnd) {
			return;
		}

		if (!this._extendBufferPromise) {
			this._extendBufferPromise = (async () => {
				const { value, done } = await this._source.next();
				this._extendBufferPromise = undefined;
				if (done) {
					this._atEnd = true;
				} else {
					this._buffer.push(value);
				}
			})();
		}

		await this._extendBufferPromise;
	}

	public async peek(): Promise<T | typeof AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this._extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReaderEndOfStream;
		}
		return this._buffer[0];
	}

	public peekSyncOrThrow(): T | typeof AsyncReaderEndOfStream {
		if (this._buffer.length === 0) {
			if (this._atEnd) {
				return AsyncReaderEndOfStream;
			}
			throw new Error('No more elements');
		}

		return this._buffer[0];
	}

	public readSyncOrThrow(): T | typeof AsyncReaderEndOfStream {
		if (this._buffer.length === 0) {
			if (this._atEnd) {
				return AsyncReaderEndOfStream;
			}
			throw new Error('No more elements');
		}

		return this._buffer.shift()!;
	}

	public async peekNextTimeout(timeoutMs: number): Promise<T | typeof AsyncReaderEndOfStream | undefined> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await raceTimeout(this._extendBuffer(), timeoutMs);
		}
		if (this._atEnd) {
			return AsyncReaderEndOfStream;
		}
		if (this._buffer.length === 0) {
			return undefined;
		}
		return this._buffer[0];
	}

	public async waitForBufferTimeout(timeoutMs: number): Promise<boolean> {
		if (this._buffer.length > 0 || this._atEnd) {
			return true;
		}
		const result = await raceTimeout(this._extendBuffer().then(() => true), timeoutMs);
		return result !== undefined;
	}

	public async read(): Promise<T | typeof AsyncReaderEndOfStream> {
		if (this._buffer.length === 0 && !this._atEnd) {
			await this._extendBuffer();
		}
		if (this._buffer.length === 0) {
			return AsyncReaderEndOfStream;
		}
		return this._buffer.shift()!;
	}

	public async readWhile(predicate: (value: T) => boolean, callback: (element: T) => unknown): Promise<void> {
		do {
			const piece = await this.peek();
			if (piece === AsyncReaderEndOfStream) {
				break;
			}
			if (!predicate(piece)) {
				break;
			}
			await this.read(); // consume
			await callback(piece);
		} while (true);
	}

	public async consumeToEnd(): Promise<void> {
		while (!this.endOfStream) {
			await this.read();
		}
	}
}

