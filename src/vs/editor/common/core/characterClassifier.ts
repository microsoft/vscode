/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * A fast character classifier that uses a compact array for ASCII values.
 */
export class CharacterClassifier<T> {
	/**
	 * Maintain a compact (fully initialized ASCII map for quickly classifying ASCII characters - used more often in code).
	 */
	private _asciiMap: T[];

	/**
	 * The entire map (sparse array).
	 */
	private _map: T[];

	private _defaultValue: T;

	constructor(defaultValue: T) {
		this._defaultValue = defaultValue;
		this._asciiMap = CharacterClassifier._createAsciiMap(defaultValue);
		this._map = [];
	}

	private static _createAsciiMap<T>(defaultValue: T): T[] {
		let asciiMap: T[] = [];
		for (let i = 0; i < 256; i++) {
			asciiMap[i] = defaultValue;
		}
		return asciiMap;
	}

	public set(charCode: number, value: T): void {
		if (charCode >= 0 && charCode < 256) {
			this._asciiMap[charCode] = value;
		} else {
			this._map[charCode] = value;
		}
	}

	public get(charCode: number): T {
		if (charCode >= 0 && charCode < 256) {
			return this._asciiMap[charCode];
		} else {
			return this._map[charCode] || this._defaultValue;
		}
	}
}
