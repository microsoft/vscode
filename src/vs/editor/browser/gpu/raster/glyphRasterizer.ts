/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from '../../../../base/common/decorators.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { FontStyle, TokenMetadata } from '../../../common/encodedTokenAttributes.js';
import { ensureNonNullable } from '../gpuUtils.js';
import { type IBoundingBox, type IGlyphRasterizer, type IRasterizedGlyph } from './raster.js';

let nextId = 0;

export class GlyphRasterizer extends Disposable implements IGlyphRasterizer {
	public readonly id = nextId++;

	@memoize
	public get cacheKey(): string {
		return `${this.fontFamily}_${this.fontSize}px`;
	}

	private _canvas: OffscreenCanvas;
	private _ctx: OffscreenCanvasRenderingContext2D;

	private readonly _textMetrics: TextMetrics;

	private _workGlyph: IRasterizedGlyph = {
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
		},
		fontBoundingBoxAscent: 0,
		fontBoundingBoxDescent: 0,
	};
	private _workGlyphConfig: { chars: string | undefined; tokenMetadata: number; charMetadata: number } = { chars: undefined, tokenMetadata: 0, charMetadata: 0 };

	constructor(
		readonly fontSize: number,
		readonly fontFamily: string,
		readonly devicePixelRatio: number
	) {
		super();

		const devicePixelFontSize = Math.ceil(this.fontSize * devicePixelRatio);
		this._canvas = new OffscreenCanvas(devicePixelFontSize * 3, devicePixelFontSize * 3);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));
		this._ctx.textBaseline = 'top';
		this._ctx.fillStyle = '#FFFFFF';
		this._ctx.font = `${devicePixelFontSize}px ${this.fontFamily}`;
		this._textMetrics = this._ctx.measureText('A');
	}

	// TODO: Support drawing multiple fonts and sizes
	/**
	 * Rasterizes a glyph. Note that the returned object is reused across different glyphs and
	 * therefore is only safe for synchronous access.
	 */
	public rasterizeGlyph(
		chars: string,
		tokenMetadata: number,
		charMetadata: number,
		colorMap: string[],
	): Readonly<IRasterizedGlyph> {
		if (chars === '') {
			return {
				source: this._canvas,
				boundingBox: { top: 0, left: 0, bottom: -1, right: -1 },
				originOffset: { x: 0, y: 0 },
				fontBoundingBoxAscent: 0,
				fontBoundingBoxDescent: 0,
			};
		}
		// Check if the last glyph matches the config, reuse if so. This helps avoid unnecessary
		// work when the rasterizer is called multiple times like when the glyph doesn't fit into a
		// page.
		if (this._workGlyphConfig.chars === chars && this._workGlyphConfig.tokenMetadata === tokenMetadata && this._workGlyphConfig.charMetadata === charMetadata) {
			return this._workGlyph;
		}
		this._workGlyphConfig.chars = chars;
		this._workGlyphConfig.tokenMetadata = tokenMetadata;
		this._workGlyphConfig.charMetadata = charMetadata;
		return this._rasterizeGlyph(chars, tokenMetadata, charMetadata, colorMap);
	}

	public _rasterizeGlyph(
		chars: string,
		metadata: number,
		charMetadata: number,
		colorMap: string[],
	): Readonly<IRasterizedGlyph> {
		const devicePixelFontSize = Math.ceil(this.fontSize * this.devicePixelRatio);
		const canvasDim = devicePixelFontSize * 3;
		if (this._canvas.width !== canvasDim) {
			this._canvas.width = canvasDim;
			this._canvas.height = canvasDim;
		}

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
		fontSb.appendString(`${devicePixelFontSize}px ${this.fontFamily}`);
		this._ctx.font = fontSb.build();

		// TODO: Support FontStyle.Strikethrough and FontStyle.Underline text decorations, these
		//       need to be drawn manually to the canvas. See xterm.js for "dodging" the text for
		//       underlines.

		const originX = devicePixelFontSize;
		const originY = devicePixelFontSize;
		if (charMetadata) {
			this._ctx.fillStyle = `#${charMetadata.toString(16).padStart(8, '0')}`;
		} else {
			this._ctx.fillStyle = colorMap[TokenMetadata.getForeground(metadata)];
		}
		this._ctx.textBaseline = 'top';

		this._ctx.fillText(chars, originX, originY);

		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		this._findGlyphBoundingBox(imageData, this._workGlyph.boundingBox);
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
		this._workGlyph.source = this._canvas;
		this._workGlyph.originOffset.x = this._workGlyph.boundingBox.left - originX;
		this._workGlyph.originOffset.y = this._workGlyph.boundingBox.top - originY;
		this._workGlyph.fontBoundingBoxAscent = this._textMetrics.fontBoundingBoxAscent;
		this._workGlyph.fontBoundingBoxDescent = this._textMetrics.fontBoundingBoxDescent;

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



		return this._workGlyph;
	}

	// TODO: Does this even need to happen when measure text is used?
	private _findGlyphBoundingBox(imageData: ImageData, outBoundingBox: IBoundingBox) {
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
