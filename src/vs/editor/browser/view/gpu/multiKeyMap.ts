/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export class TwoKeyMap<TFirst extends string | number, TSecond extends string | number, TValue> {
	private _data: { [key: string | number]: { [key: string | number]: TValue | undefined } | undefined } = {};

	public set(first: TFirst, second: TSecond, value: TValue): void {
		if (!this._data[first]) {
			this._data[first] = {};
		}
		this._data[first as string | number]![second] = value;
	}

	public get(first: TFirst, second: TSecond): TValue | undefined {
		return this._data[first as string | number] ? this._data[first as string | number]![second] : undefined;
	}

	public clear(): void {
		this._data = {};
	}

	public *values() {
		for (const first in this._data) {
			for (const second in this._data[first]) {
				const value = this._data[first]![second];
				if (value) {
					yield value;
				}
			}
		}
	}
}

export class FourKeyMap<TFirst extends string | number, TSecond extends string | number, TThird extends string | number, TFourth extends string | number, TValue> {
	private _data: TwoKeyMap<TFirst, TSecond, TwoKeyMap<TThird, TFourth, TValue>> = new TwoKeyMap();

	public set(first: TFirst, second: TSecond, third: TThird, fourth: TFourth, value: TValue): void {
		if (!this._data.get(first, second)) {
			this._data.set(first, second, new TwoKeyMap());
		}
		this._data.get(first, second)!.set(third, fourth, value);
	}

	public get(first: TFirst, second: TSecond, third: TThird, fourth: TFourth): TValue | undefined {
		return this._data.get(first, second)?.get(third, fourth);
	}

	public clear(): void {
		this._data.clear();
	}
}
