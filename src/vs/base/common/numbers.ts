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
