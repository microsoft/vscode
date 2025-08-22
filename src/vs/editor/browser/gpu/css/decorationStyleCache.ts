/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NKeyMap } from '../../../../base/common/map.js';

export interface IDecorationStyleSet {
	/**
	 * A 24-bit number representing `color`.
	 */
	color: number | undefined;
	/**
	 * Whether the text should be rendered in bold.
	 */
	bold: boolean | undefined;
	/**
	 * A number between 0 and 1 representing the opacity of the text.
	 */
	opacity: number | undefined;
}

export interface IDecorationStyleCacheEntry extends IDecorationStyleSet {
	/**
	 * A unique identifier for this set of styles.
	 */
	id: number;
}

export class DecorationStyleCache {

	private _nextId = 1;

	private readonly _cacheById = new Map<number, IDecorationStyleCacheEntry>();
	private readonly _cacheByStyle = new NKeyMap<IDecorationStyleCacheEntry, [number, number, string]>();

	getOrCreateEntry(
		color: number | undefined,
		bold: boolean | undefined,
		opacity: number | undefined
	): number {
		if (color === undefined && bold === undefined && opacity === undefined) {
			return 0;
		}
		const result = this._cacheByStyle.get(color ?? 0, bold ? 1 : 0, opacity === undefined ? '' : opacity.toFixed(2));
		if (result) {
			return result.id;
		}
		const id = this._nextId++;
		const entry = {
			id,
			color,
			bold,
			opacity,
		};
		this._cacheById.set(id, entry);
		this._cacheByStyle.set(entry, color ?? 0, bold ? 1 : 0, opacity === undefined ? '' : opacity.toFixed(2));
		return id;
	}

	getStyleSet(id: number): IDecorationStyleSet | undefined {
		if (id === 0) {
			return undefined;
		}
		return this._cacheById.get(id);
	}
}
