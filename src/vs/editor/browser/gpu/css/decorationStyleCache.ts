/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDecorationStyleSet {
	/**
	 * A 24-bit number representing `color`.
	 */
	color: number | undefined;
	/**
	 * Whether the text should be rendered in bold.
	 */
	bold: boolean | undefined;
}

export interface IDecorationStyleCacheEntry extends IDecorationStyleSet {
	/**
	 * A unique identifier for this set of styles.
	 */
	id: number;
}

export class DecorationStyleCache {

	private _nextId = 1;

	private readonly _cache = new Map<number, IDecorationStyleSet>();

	getOrCreateEntry(color: number | undefined, bold: boolean | undefined): number {
		if (color === undefined && bold === undefined) {
			return 0;
		}
		const id = this._nextId++;
		const entry = {
			id,
			color,
			bold,
		};
		this._cache.set(id, entry);
		return id;
	}

	getStyleSet(id: number): IDecorationStyleSet | undefined {
		if (id === 0) {
			return undefined;
		}
		return this._cache.get(id);
	}
}
