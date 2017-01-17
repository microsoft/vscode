/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export class Uint8Matrix {

	private _data: Uint8Array;
	private _rows: number;
	private _cols: number;

	constructor(rows: number, cols: number, defaultValue: number) {
		let data = new Uint8Array(rows * cols);
		for (let i = 0, len = rows * cols; i < len; i++) {
			data[i] = defaultValue;
		}

		this._data = data;
		this._rows = rows;
		this._cols = cols;
	}

	public get(row: number, col: number): number {
		return this._data[row * this._cols + col];
	}

	public set(row: number, col: number, value: number): void {
		this._data[row * this._cols + col] = value;
	}
}

export const enum Constants {
	/**
	 * MAX SMI (SMall Integer) as defined in v8.
	 * one bit is lost for boxing/unboxing flag.
	 * one bit is lost for sign flag.
	 * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
	 */
	MAX_SAFE_SMALL_INTEGER = 1 << 30,

	/**
	 * MIN SMI (SMall Integer) as defined in v8.
	 * one bit is lost for boxing/unboxing flag.
	 * one bit is lost for sign flag.
	 * See https://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/#tagged-values
	 */
	MIN_SAFE_SMALL_INTEGER = -(1 << 30),

	/**
	 * Max unsigned integer that fits on 8 bits.
	 */
	MAX_UINT_8 = 255, // 2^8 - 1

	/**
	 * Max unsigned integer that fits on 16 bits.
	 */
	MAX_UINT_16 = 65535, // 2^16 - 1

	/**
	 * Max unsigned integer that fits on 32 bits.
	 */
	MAX_UINT_32 = 4294967295, // 2^32 - 1


}

export function toUint8(v: number): number {
	if (v < 0) {
		return 0;
	}
	if (v > Constants.MAX_UINT_8) {
		return Constants.MAX_UINT_8;
	}
	return v | 0;
}

export function toUint32(v: number): number {
	if (v < 0) {
		return 0;
	}
	if (v > Constants.MAX_UINT_32) {
		return Constants.MAX_UINT_32;
	}
	return v | 0;
}

export function toUint32Array(arr: number[]): Uint32Array {
	let len = arr.length;
	let r = new Uint32Array(len);
	for (let i = 0; i < len; i++) {
		r[i] = toUint32(arr[i]);
	}
	return r;
}
