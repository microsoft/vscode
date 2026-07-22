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
	/**
	 * Whether the text should be rendered with a strikethrough.
	 */
	strikethrough: boolean | undefined;
	/**
	 * The thickness of the strikethrough line in pixels (CSS pixels, not device pixels).
	 */
	strikethroughThickness: number | undefined;
	/**
	 * A 32-bit number representing the strikethrough color.
	 */
	strikethroughColor: number | undefined;
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
	private readonly _cacheByStyle = new NKeyMap<IDecorationStyleCacheEntry, [number, number, string, number, string, number]>();

	getOrCreateEntry(
		color: number | undefined,
		bold: boolean | undefined,
		opacity: number | undefined,
		strikethrough: boolean | undefined,
		strikethroughThickness: number | undefined,
		strikethroughColor: number | undefined
	): number {
		if (color === undefined && bold === undefined && opacity === undefined && strikethrough === undefined && strikethroughThickness === undefined && strikethroughColor === undefined) {
			return 0;
		}
		const result = this._cacheByStyle.get(
			color ?? 0,
			bold ? 1 : 0,
			opacity === undefined ? '' : opacity.toFixed(2),
			strikethrough ? 1 : 0,
			strikethroughThickness === undefined ? '' : strikethroughThickness.toFixed(2),
			strikethroughColor ?? 0
		);
		if (result) {
			return result.id;
		}
		const id = this._nextId++;
		const entry: IDecorationStyleCacheEntry = {
			id,
			color,
			bold,
			opacity,
			strikethrough,
			strikethroughThickness,
			strikethroughColor,
		};
		this._cacheById.set(id, entry);
		this._cacheByStyle.set(entry,
			color ?? 0,
			bold ? 1 : 0,
			opacity === undefined ? '' : opacity.toFixed(2),
			strikethrough ? 1 : 0,
			strikethroughThickness === undefined ? '' : strikethroughThickness.toFixed(2),
			strikethroughColor ?? 0
		);
		return id;
	}

	getStyleSet(id: number): IDecorationStyleSet | undefined {
		if (id === 0) {
			return undefined;
		}
		return this._cacheById.get(id);
	}
}
