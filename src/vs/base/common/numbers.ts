/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function rot(index: number, modulo: number): number {
	return (modulo + (index % modulo)) % modulo;
}

export class Counter {
	private _next = 0;

	getNext(): number {
		return this._next++;
	}
}

export class MovingAverage {

	private _n = 1;
	private _val = 0;

	update(value: number): number {
		this._val = this._val + (value - this._val) / this._n;
		this._n += 1;
		return this._val;
	}

	get value(): number {
		return this._val;
	}
}

export class SlidingWindowAverage {

	private _n: number = 0;
	private _val = 0;

	private readonly _values: number[] = [];
	private _index: number = 0;
	private _sum = 0;

	constructor(size: number) {
		this._values = new Array(size);
		this._values.fill(0, 0, size);
	}

	update(value: number): number {
		const oldValue = this._values[this._index];
		this._values[this._index] = value;
		this._index = (this._index + 1) % this._values.length;

		this._sum -= oldValue;
		this._sum += value;

		if (this._n < this._values.length) {
			this._n += 1;
		}

		this._val = this._sum / this._n;
		return this._val;
	}

	get value(): number {
		return this._val;
	}
}
