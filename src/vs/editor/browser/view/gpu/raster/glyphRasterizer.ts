/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { FontStyle, TokenMetadata } from 'vs/editor/common/encodedTokenAttributes';

const $rasterizedGlyph: IRasterizedGlyph = {
	source: null!,
	boundingBox: {
		left: 0,
		bottom: 0,
		right: 0,
		top: 0,
	},
	originOffset: {
		x: 0,
		y: 0,
	}
};
const $bbox = $rasterizedGlyph.boundingBox;

let nextId = 0;

export class GlyphRasterizer extends Disposable {
	/**
	 * A unique identifier for this rasterizer.
	 */
	public readonly id = nextId++;

	private _canvas: OffscreenCanvas;
	// A temporary context that glyphs are drawn to before being transfered to the atlas.
	private _ctx: OffscreenCanvasRenderingContext2D;

	constructor(
		private readonly _fontSize: number,
		private readonly _fontFamily: string,
	) {
		super();

		this._canvas = new OffscreenCanvas(this._fontSize * 3, this._fontSize * 3);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));
		this._ctx.textBaseline = 'top';
		this._ctx.fillStyle = '#FFFFFF';
	}

	// TODO: Support drawing multiple fonts and sizes
	// TODO: Should pull in the font size from config instead of random dom node
	/**
	 * Rasterizes a glyph. Note that the returned object is reused across different glyphs and
	 * therefore is only safe for synchronous access.
	 */
	public rasterizeGlyph(
		chars: string,
		metadata: number,
		colorMap: string[],
	): Readonly<IRasterizedGlyph> {
		// TODO: Support workbench.fontAliasing
		this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

		const fontSb = new StringBuilder(200);
		const fontStyle = TokenMetadata.getFontStyle(metadata);
		if (fontStyle & FontStyle.Italic) {
			fontSb.appendString('italic ');
		}
		if (fontStyle & FontStyle.Bold) {
			fontSb.appendString('bold ');
		}
		fontSb.appendString(`${this._fontSize}px ${this._fontFamily}`);
		this._ctx.font = fontSb.build();

		// TODO: Support FontStyle.Strikethrough and FontStyle.Underline text decorations, these
		//       need to be drawn manually to the canvas. See xterm.js for "dodging" the text for
		//       underlines.

		// TODO: Draw in middle using alphabetical baseline
		const originX = this._fontSize;
		const originY = this._fontSize;
		this._ctx.fillStyle = colorMap[TokenMetadata.getForeground(metadata)];
		// TODO: This might actually be slower
		// const textMetrics = this._ctx.measureText(chars);
		this._ctx.fillText(chars, originX, originY);

		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		this._findGlyphBoundingBox(imageData, $rasterizedGlyph.boundingBox);
		// const offset = {
		// 	x: textMetrics.actualBoundingBoxLeft,
		// 	y: textMetrics.actualBoundingBoxAscent
		// };
		// const size = {
		// 	w: textMetrics.actualBoundingBoxRight + textMetrics.actualBoundingBoxLeft,
		// 	y: textMetrics.actualBoundingBoxDescent + textMetrics.actualBoundingBoxAscent,
		// 	wInt: Math.ceil(textMetrics.actualBoundingBoxRight + textMetrics.actualBoundingBoxLeft),
		// 	yInt: Math.ceil(textMetrics.actualBoundingBoxDescent + textMetrics.actualBoundingBoxAscent),
		// };
		// console.log(`${chars}_${fg}`, textMetrics, boundingBox, originX, originY, { width: boundingBox.right - boundingBox.left, height: boundingBox.bottom - boundingBox.top });
		$rasterizedGlyph.source = this._canvas;
		$rasterizedGlyph.originOffset.x = $bbox.left - originX;
		$rasterizedGlyph.originOffset.y = $bbox.top - originY;

		// const result2: IRasterizedGlyph = {
		// 	source: this._canvas,
		// 	boundingBox: {
		// 		left: Math.floor(originX - textMetrics.actualBoundingBoxLeft),
		// 		right: Math.ceil(originX + textMetrics.actualBoundingBoxRight),
		// 		top: Math.floor(originY - textMetrics.actualBoundingBoxAscent),
		// 		bottom: Math.ceil(originY + textMetrics.actualBoundingBoxDescent),
		// 	},
		// 	originOffset: {
		// 		x: Math.floor(boundingBox.left - originX),
		// 		y: Math.floor(boundingBox.top - originY)
		// 	}
		// };

		// DEBUG: Show image data in console
		// (console as any).image(imageData);

		// TODO: Verify result 1 and 2 are the same

		// if (result2.boundingBox.left > result.boundingBox.left) {
		// 	debugger;
		// }
		// if (result2.boundingBox.top > result.boundingBox.top) {
		// 	debugger;
		// }
		// if (result2.boundingBox.right < result.boundingBox.right) {
		// 	debugger;
		// }
		// if (result2.boundingBox.bottom < result.boundingBox.bottom) {
		// 	debugger;
		// }
		// if (JSON.stringify(result2.originOffset) !== JSON.stringify(result.originOffset)) {
		// 	debugger;
		// }

		return $rasterizedGlyph;
	}

	// TODO: Does this even need to happen when measure text is used?
	// TODO: Pass back origin offset
	private _findGlyphBoundingBox(imageData: ImageData, outBoundingBox: IBoundingBox) {
		// TODO: This could be optimized to be aware of the font size padding on all sides
		const height = this._canvas.height;
		const width = this._canvas.width;
		let found = false;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.top = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.left = 0;
		found = false;
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.left = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.right = width;
		found = false;
		for (let x = width - 1; x >= outBoundingBox.left; x--) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.right = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.bottom = outBoundingBox.top;
		found = false;
		for (let y = height - 1; y >= 0; y--) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.bottom = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
	}
}

export interface IBoundingBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * A glyph that has been rasterized to a canvas.
 */
export interface IRasterizedGlyph {
	source: OffscreenCanvas;
	/**
	 * The bounding box of the glyph within {@link source}.
	 */
	boundingBox: IBoundingBox;
	/**
	 * The offset to the glyph's origin (where it should be drawn to).
	 */
	originOffset: { x: number; y: number };
}
