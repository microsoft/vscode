/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from './assert.js';

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

/** Returns whether the point is within the triangle formed by the following 6 x/y point pairs */
export function isPointWithinTriangle(
	x: number, y: number,
	ax: number, ay: number,
	bx: number, by: number,
	cx: number, cy: number
) {
	const v0x = cx - ax;
	const v0y = cy - ay;
	const v1x = bx - ax;
	const v1y = by - ay;
	const v2x = x - ax;
	const v2y = y - ay;

	const dot00 = v0x * v0x + v0y * v0y;
	const dot01 = v0x * v1x + v0y * v1y;
	const dot02 = v0x * v2x + v0y * v2y;
	const dot11 = v1x * v1x + v1y * v1y;
	const dot12 = v1x * v2x + v1y * v2y;

	const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
	const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
	const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

	return u >= 0 && v >= 0 && u + v < 1;
}

/**
 * Function to get a (pseudo)random integer from a provided `max`...[`min`] range.
 * Both `min` and `max` values are inclusive. The `min` value is optional and defaults
 * to `0` if not explicitely specified.
 *
 * @throws in the next cases:
 * 	- if provided `min` or `max` is not a number
 *  - if provided `min` or `max` is not finite
 *  - if provided `min` is larger than `max` value
 *
 * ## Examples
 *
 * Specifying a `max` value only uses `0` as the `min` value by default:
 *
 * ```typescript
 * // get a random integer between 0 and 10
 * const randomInt = randomInt(10);
 *
 * assert(
 *   randomInt >= 0,
 *   'Should be greater than or equal to 0.',
 * );
 *
 * assert(
 *   randomInt <= 10,
 *   'Should be less than or equal to 10.',
 * );
 * ```
 * * Specifying both `max` and `min` values:
 *
 * ```typescript
 * // get a random integer between 5 and 8
 * const randomInt = randomInt(8, 5);
 *
 * assert(
 *   randomInt >= 5,
 *   'Should be greater than or equal to 5.',
 * );
 *
 * assert(
 *   randomInt <= 8,
 *   'Should be less than or equal to 8.',
 * );
 * ```
 */
export const randomInt = (max: number, min: number = 0): number => {
	assert(!isNaN(min), '"min" param is not a number.');
	assert(!isNaN(max), '"max" param is not a number.');

	assert(isFinite(max), '"max" param is not finite.');
	assert(isFinite(min), '"min" param is not finite.');

	assert(max > min, `"max"(${max}) param should be greater than "min"(${min}).`);

	const delta = max - min;
	const randomFloat = delta * Math.random();

	return Math.round(min + randomFloat);
};
