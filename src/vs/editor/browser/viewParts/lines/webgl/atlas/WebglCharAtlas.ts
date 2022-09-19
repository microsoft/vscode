/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ICharAtlasConfig } from './Types';
import { IRasterizedGlyph, IBoundingBox } from '../Types';
import { DEFAULT_COLOR, Attributes, DEFAULT_EXT, UnderlineStyle } from 'common/buffer/Constants';
import { throwIfFalsy } from '../WebglUtils';
import { AttributeData } from 'common/buffer/AttributeData';
import { color, rgba } from 'common/Color';
import { tryDrawCustomChar } from 'browser/renderer/CustomGlyphs';
// import { excludeFromContrastRatioDemands, isPowerlineGlyph, isRestrictedPowerlineGlyph } from 'browser/renderer/RendererUtils';
import { IDisposable } from 'vs/base/common/lifecycle';
import { FourKeyMap } from 'vs/editor/browser/viewParts/lines/webgl/base/MultiKeyMap';
import { IColor } from 'vs/editor/browser/viewParts/lines/webgl/base/Types';
import { DIM_OPACITY, TEXT_BASELINE } from 'vs/editor/browser/viewParts/lines/webgl/base/Constants';

// For debugging purposes, it can be useful to set this to a really tiny value,
// to verify that LRU eviction works.
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1024;

/**
 * The amount of the texture to be filled before throwing it away and starting
 * again. Since the throw away and individual glyph draws don't cost too much,
 * this prevent juggling multiple textures in the GL context.
 */
const TEXTURE_CAPACITY = Math.floor(TEXTURE_HEIGHT * 0.8);

const TRANSPARENT_COLOR = {
	css: 'rgba(0, 0, 0, 0)',
	rgba: 0
};

/**
 * A shared object which is used to draw nothing for a particular cell.
 */
const NULL_RASTERIZED_GLYPH: IRasterizedGlyph = {
	offset: { x: 0, y: 0 },
	texturePosition: { x: 0, y: 0 },
	texturePositionClipSpace: { x: 0, y: 0 },
	size: { x: 0, y: 0 },
	sizeClipSpace: { x: 0, y: 0 }
};

const TMP_CANVAS_GLYPH_PADDING = 2;

interface ICharAtlasActiveRow {
	x: number;
	y: number;
	height: number;
}

/** Work variables to avoid garbage collection. */
const w: { glyph: IRasterizedGlyph | undefined } = {
	glyph: undefined
};

export class WebglCharAtlas implements IDisposable {
	private _didWarmUp: boolean = false;

	private _cacheMap: FourKeyMap<number, number, number, number, IRasterizedGlyph> = new FourKeyMap();
	private _cacheMapCombined: FourKeyMap<string, number, number, number, IRasterizedGlyph> = new FourKeyMap();

	// The texture that the atlas is drawn to
	public cacheCanvas: HTMLCanvasElement;
	private _cacheCtx: CanvasRenderingContext2D;

	private _tmpCanvas: HTMLCanvasElement;
	// A temporary context that glyphs are drawn to before being transfered to the atlas.
	private _tmpCtx: CanvasRenderingContext2D;

	// Texture atlas current positioning data. The texture packing strategy used is to fill from
	// left-to-right and top-to-bottom. When the glyph being written is less than half of the current
	// row's height, the following happens:
	//
	// - The current row becomes the fixed height row A
	// - A new fixed height row B the exact size of the glyph is created below the current row
	// - A new dynamic height current row is created below B
	//
	// This strategy does a good job preventing space being wasted for very short glyphs such as
	// underscores, hyphens etc. or those with underlines rendered.
	private _currentRow: ICharAtlasActiveRow = {
		x: 0,
		y: 0,
		height: 0
	};
	private readonly _fixedRows: ICharAtlasActiveRow[] = [];

	public hasCanvasChanged = false;

	private _workBoundingBox: IBoundingBox = { top: 0, left: 0, bottom: 0, right: 0 };
	private _workAttributeData: AttributeData = new AttributeData();

	constructor(
		document: Document,
		private readonly _config: ICharAtlasConfig,
		// private readonly _unicodeService: IUnicodeService
	) {
		this.cacheCanvas = document.createElement('canvas');
		this.cacheCanvas.width = TEXTURE_WIDTH;
		this.cacheCanvas.height = TEXTURE_HEIGHT;
		// The canvas needs alpha because we use clearColor to convert the background color to alpha.
		// It might also contain some characters with transparent backgrounds if allowTransparency is
		// set.
		this._cacheCtx = throwIfFalsy(this.cacheCanvas.getContext('2d', { alpha: true }));

		this._tmpCanvas = document.createElement('canvas');
		this._tmpCanvas.width = this._config.scaledCellWidth * 4 + TMP_CANVAS_GLYPH_PADDING * 2;
		this._tmpCanvas.height = this._config.scaledCellHeight + TMP_CANVAS_GLYPH_PADDING * 2;
		this._tmpCtx = throwIfFalsy(this._tmpCanvas.getContext('2d', { alpha: this._config.allowTransparency }));
	}

	public dispose(): void {
		if (this.cacheCanvas.parentElement) {
			this.cacheCanvas.parentElement.removeChild(this.cacheCanvas);
		}
	}

	public warmUp(): void {
		if (!this._didWarmUp) {
			this._doWarmUp();
			this._didWarmUp = true;
		}
	}

	private _doWarmUp(): void {
		// Pre-fill with ASCII 33-126
		for (let i = 33; i < 126; i++) {
			const rasterizedGlyph = this._drawToCache(i, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_EXT);
			this._cacheMap.set(i, DEFAULT_COLOR, DEFAULT_COLOR, DEFAULT_EXT, rasterizedGlyph);
		}
	}

	public beginFrame(): boolean {
		if (this._currentRow.y > TEXTURE_CAPACITY) {
			this.clearTexture();
			this.warmUp();
			return true;
		}
		return false;
	}

	public clearTexture(): void {
		if (this._currentRow.x === 0 && this._currentRow.y === 0) {
			return;
		}
		this._cacheCtx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
		this._cacheMap.clear();
		this._cacheMapCombined.clear();
		this._currentRow.x = 0;
		this._currentRow.y = 0;
		this._currentRow.height = 0;
		this._fixedRows.length = 0;
		this._didWarmUp = false;
	}

	public getRasterizedGlyphCombinedChar(chars: string, bg: number, fg: number, ext: number): IRasterizedGlyph {
		return this._getFromCacheMap(this._cacheMapCombined, chars, bg, fg, ext);
	}

	public getRasterizedGlyph(code: number, bg: number, fg: number, ext: number): IRasterizedGlyph {
		return this._getFromCacheMap(this._cacheMap, code, bg, fg, ext);
	}

	/**
	 * Gets the glyphs texture coords, drawing the texture if it's not already
	 */
	private _getFromCacheMap(
		cacheMap: FourKeyMap<string | number, number, number, number, IRasterizedGlyph>,
		key: string | number,
		bg: number,
		fg: number,
		ext: number
	): IRasterizedGlyph {
		w.glyph = cacheMap.get(key, bg, fg, ext);
		if (!w.glyph) {
			w.glyph = this._drawToCache(key, bg, fg, ext);
			cacheMap.set(key, bg, fg, ext, w.glyph);
		}
		return w.glyph;
	}

	private _getColorFromAnsiIndex(idx: number): IColor {
		if (idx >= this._config.colors.ansi.length) {
			throw new Error('No color found for idx ' + idx);
		}
		return this._config.colors.ansi[idx];
	}

	private _getBackgroundColor(bgColorMode: number, bgColor: number, inverse: boolean, dim: boolean): IColor {
		if (this._config.allowTransparency) {
			// The background color might have some transparency, so we need to render it as fully
			// transparent in the atlas. Otherwise we'd end up drawing the transparent background twice
			// around the anti-aliased edges of the glyph, and it would look too dark.
			return TRANSPARENT_COLOR;
		}

		let result: IColor;
		switch (bgColorMode) {
			case Attributes.CM_P16:
			case Attributes.CM_P256:
				result = this._getColorFromAnsiIndex(bgColor);
				break;
			case Attributes.CM_RGB: {
				const arr = AttributeData.toColorRGB(bgColor);
				// TODO: This object creation is slow
				result = rgba.toColor(arr[0], arr[1], arr[2]);
				break;
			}
			case Attributes.CM_DEFAULT:
			default:
				if (inverse) {
					result = this._config.colors.foreground;
				} else {
					result = this._config.colors.background;
				}
				break;
		}

		if (dim) {
			// Blend here instead of using opacity because transparent colors mess with clipping the
			// glyph's bounding box
			result = color.blend(this._config.colors.background, color.multiplyOpacity(result, DIM_OPACITY));
		}

		return result;
	}

	private _getForegroundColor(bg: number, bgColorMode: number, bgColor: number, fg: number, fgColorMode: number, fgColor: number, inverse: boolean, dim: boolean, bold: boolean, excludeFromContrastRatioDemands: boolean): IColor {
		// TODO: Pass dim along to get min contrast?
		const minimumContrastColor = this._getMinimumContrastColor(bg, bgColorMode, bgColor, fg, fgColorMode, fgColor, false, bold, excludeFromContrastRatioDemands);
		if (minimumContrastColor) {
			return minimumContrastColor;
		}

		let result: IColor;
		switch (fgColorMode) {
			case Attributes.CM_P16:
			case Attributes.CM_P256:
				if (this._config.drawBoldTextInBrightColors && bold && fgColor < 8) {
					fgColor += 8;
				}
				result = this._getColorFromAnsiIndex(fgColor);
				break;
			case Attributes.CM_RGB: {
				const arr = AttributeData.toColorRGB(fgColor);
				result = rgba.toColor(arr[0], arr[1], arr[2]);
				break;
			}
			case Attributes.CM_DEFAULT:
			default:
				if (inverse) {
					result = this._config.colors.background;
				} else {
					result = this._config.colors.foreground;
				}
		}

		// Always use an opaque color regardless of allowTransparency
		if (this._config.allowTransparency) {
			result = color.opaque(result);
		}

		// Apply dim to the color, opacity is fine to use for the foreground color
		if (dim) {
			result = color.multiplyOpacity(result, DIM_OPACITY);
		}

		return result;
	}

	// private _resolveBackgroundRgba(bgColorMode: number, bgColor: number, inverse: boolean): number {
	// 	switch (bgColorMode) {
	// 		case Attributes.CM_P16:
	// 		case Attributes.CM_P256:
	// 			return this._getColorFromAnsiIndex(bgColor).rgba;
	// 		case Attributes.CM_RGB:
	// 			return bgColor << 8;
	// 		case Attributes.CM_DEFAULT:
	// 		default:
	// 			if (inverse) {
	// 				return this._config.colors.foreground.rgba;
	// 			}
	// 			return this._config.colors.background.rgba;
	// 	}
	// }

	// private _resolveForegroundRgba(fgColorMode: number, fgColor: number, inverse: boolean, bold: boolean): number {
	// 	switch (fgColorMode) {
	// 		case Attributes.CM_P16:
	// 		case Attributes.CM_P256:
	// 			if (this._config.drawBoldTextInBrightColors && bold && fgColor < 8) {
	// 				fgColor += 8;
	// 			}
	// 			return this._getColorFromAnsiIndex(fgColor).rgba;
	// 		case Attributes.CM_RGB:
	// 			return fgColor << 8;
	// 		case Attributes.CM_DEFAULT:
	// 		default:
	// 			if (inverse) {
	// 				return this._config.colors.background.rgba;
	// 			}
	// 			return this._config.colors.foreground.rgba;
	// 	}
	// }

	private _getMinimumContrastColor(bg: number, bgColorMode: number, bgColor: number, fg: number, fgColorMode: number, fgColor: number, inverse: boolean, bold: boolean, excludeFromContrastRatioDemands: boolean): IColor | undefined {
		return undefined;
		// if (this._config.minimumContrastRatio === 1 || excludeFromContrastRatioDemands) {
		// 	return undefined;
		// }

		// // Try get from cache first
		// const adjustedColor = this._config.colors.contrastCache.getColor(bg, fg);
		// if (adjustedColor !== undefined) {
		// 	return adjustedColor || undefined;
		// }

		// const bgRgba = this._resolveBackgroundRgba(bgColorMode, bgColor, inverse);
		// const fgRgba = this._resolveForegroundRgba(fgColorMode, fgColor, inverse, bold);
		// const result = rgba.ensureContrastRatio(bgRgba, fgRgba, this._config.minimumContrastRatio);

		// if (!result) {
		// 	this._config.colors.contrastCache.setColor(bg, fg, null);
		// 	return undefined;
		// }

		// const color = rgba.toColor(
		// 	(result >> 24) & 0xFF,
		// 	(result >> 16) & 0xFF,
		// 	(result >> 8) & 0xFF
		// );
		// this._config.colors.contrastCache.setColor(bg, fg, color);

		// return color;
	}

	private _drawToCache(codeOrChars: number | string, bg: number, fg: number, ext: number): IRasterizedGlyph {
		const chars = typeof codeOrChars === 'number' ? String.fromCharCode(codeOrChars) : codeOrChars;

		this.hasCanvasChanged = true;

		// Allow 1 cell width per character, with a minimum of 2 (CJK), plus some padding. This is used
		// to draw the glyph to the canvas as well as to restrict the bounding box search to ensure
		// giant ligatures (eg. =====>) don't impact overall performance.
		const allowedWidth = this._config.scaledCellWidth * Math.max(chars.length, 2) + TMP_CANVAS_GLYPH_PADDING * 2;
		if (this._tmpCanvas.width < allowedWidth) {
			this._tmpCanvas.width = allowedWidth;
		}
		// Include line height when drawing glyphs
		const allowedHeight = this._config.scaledCellHeight + TMP_CANVAS_GLYPH_PADDING * 4;
		if (this._tmpCanvas.height < allowedHeight) {
			this._tmpCanvas.height = allowedHeight;
		}
		this._tmpCtx.save();

		this._workAttributeData.fg = fg;
		this._workAttributeData.bg = bg;
		this._workAttributeData.extended.ext = ext;

		const invisible = !!this._workAttributeData.isInvisible();
		if (invisible) {
			return NULL_RASTERIZED_GLYPH;
		}

		const bold = !!this._workAttributeData.isBold();
		const inverse = !!this._workAttributeData.isInverse();
		const dim = !!this._workAttributeData.isDim();
		const italic = !!this._workAttributeData.isItalic();
		const underline = !!this._workAttributeData.isUnderline();
		const strikethrough = !!this._workAttributeData.isStrikethrough();
		let fgColor = this._workAttributeData.getFgColor();
		let fgColorMode = this._workAttributeData.getFgColorMode();
		let bgColor = this._workAttributeData.getBgColor();
		let bgColorMode = this._workAttributeData.getBgColorMode();
		if (inverse) {
			const temp = fgColor;
			fgColor = bgColor;
			bgColor = temp;
			const temp2 = fgColorMode;
			fgColorMode = bgColorMode;
			bgColorMode = temp2;
		}

		// draw the background
		const backgroundColor = this._getBackgroundColor(bgColorMode, bgColor, inverse, dim);
		// Use a 'copy' composite operation to clear any existing glyph out of _tmpCtxWithAlpha, regardless of
		// transparency in backgroundColor
		this._tmpCtx.globalCompositeOperation = 'copy';
		this._tmpCtx.fillStyle = backgroundColor.css;
		this._tmpCtx.fillRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height);
		this._tmpCtx.globalCompositeOperation = 'source-over';

		// draw the foreground/glyph
		const fontWeight = bold ? this._config.fontWeightBold : this._config.fontWeight;
		const fontStyle = italic ? 'italic' : '';
		this._tmpCtx.font =
			`${fontStyle} ${fontWeight} ${this._config.fontSize * this._config.devicePixelRatio}px ${this._config.fontFamily}`;
		this._tmpCtx.textBaseline = TEXT_BASELINE;

		// const powerlineGlyph = chars.length === 1 && isPowerlineGlyph(chars.charCodeAt(0));
		// const restrictedPowerlineGlyph = chars.length === 1 && isRestrictedPowerlineGlyph(chars.charCodeAt(0));
		const foregroundColor = this._getForegroundColor(bg, bgColorMode, bgColor, fg, fgColorMode, fgColor, inverse, dim, bold, true/* excludeFromContrastRatioDemands(chars.charCodeAt(0))*/);
		this._tmpCtx.fillStyle = foregroundColor.css;

		// For powerline glyphs left/top padding is excluded (https://github.com/microsoft/vscode/issues/120129)
		const padding = /*restrictedPowerlineGlyph ? 0 :*/ TMP_CANVAS_GLYPH_PADDING * 2;

		// Draw custom characters if applicable
		let customGlyph = false;
		if (this._config.customGlyphs !== false) {
			customGlyph = tryDrawCustomChar(this._tmpCtx, chars, padding, padding, this._config.scaledCellWidth, this._config.scaledCellHeight, this._config.fontSize, this._config.devicePixelRatio);
		}

		// Whether to clear pixels based on a threshold difference between the glyph color and the
		// background color. This should be disabled when the glyph contains multiple colors such as
		// underline colors to prevent important colors could get cleared.
		let enableClearThresholdCheck = true; //!powerlineGlyph;

		let chWidth: number;
		if (typeof codeOrChars === 'number') {
			chWidth = 1; //this._unicodeService.wcwidth(codeOrChars);
		} else {
			chWidth = 1; //this._unicodeService.getStringCellWidth(codeOrChars);
		}

		// Draw underline
		if (underline) {
			this._tmpCtx.save();
			const lineWidth = Math.max(1, Math.floor(this._config.fontSize * this._config.devicePixelRatio / 15));
			// When the line width is odd, draw at a 0.5 position
			const yOffset = lineWidth % 2 === 1 ? 0.5 : 0;
			this._tmpCtx.lineWidth = lineWidth;

			// Underline color
			if (this._workAttributeData.isUnderlineColorDefault()) {
				this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle;
			} else if (this._workAttributeData.isUnderlineColorRGB()) {
				enableClearThresholdCheck = false;
				this._tmpCtx.strokeStyle = `rgb(${AttributeData.toColorRGB(this._workAttributeData.getUnderlineColor()).join(',')})`;
			} else {
				enableClearThresholdCheck = false;
				let fg = this._workAttributeData.getUnderlineColor();
				if (this._config.drawBoldTextInBrightColors && this._workAttributeData.isBold() && fg < 8) {
					fg += 8;
				}
				this._tmpCtx.strokeStyle = this._getColorFromAnsiIndex(fg).css;
			}

			// Underline style/stroke
			this._tmpCtx.beginPath();
			const xLeft = padding;
			const yTop = Math.ceil(padding + this._config.scaledCharHeight) - yOffset;
			const yMid = padding + this._config.scaledCharHeight + lineWidth - yOffset;
			const yBot = Math.ceil(padding + this._config.scaledCharHeight + lineWidth * 2) - yOffset;

			for (let i = 0; i < chWidth; i++) {
				this._tmpCtx.save();
				const xChLeft = xLeft + i * this._config.scaledCellWidth;
				const xChRight = xLeft + (i + 1) * this._config.scaledCellWidth;
				const xChMid = xChLeft + this._config.scaledCellWidth / 2;
				switch (this._workAttributeData.extended.underlineStyle) {
					case UnderlineStyle.DOUBLE:
						this._tmpCtx.moveTo(xChLeft, yTop);
						this._tmpCtx.lineTo(xChRight, yTop);
						this._tmpCtx.moveTo(xChLeft, yBot);
						this._tmpCtx.lineTo(xChRight, yBot);
						break;
					case UnderlineStyle.CURLY: {
						// Choose the bezier top and bottom based on the device pixel ratio, the curly line is
						// made taller when the line width is  as otherwise it's not very clear otherwise.
						const yCurlyBot = lineWidth <= 1 ? yBot : Math.ceil(padding + this._config.scaledCharHeight - lineWidth / 2) - yOffset;
						const yCurlyTop = lineWidth <= 1 ? yTop : Math.ceil(padding + this._config.scaledCharHeight + lineWidth / 2) - yOffset;
						// Clip the left and right edges of the underline such that it can be drawn just outside
						// the edge of the cell to ensure a continuous stroke when there are multiple underlined
						// glyphs adjacent to one another.
						const clipRegion = new Path2D();
						clipRegion.rect(xChLeft, yTop, this._config.scaledCellWidth, yBot - yTop);
						this._tmpCtx.clip(clipRegion);
						// Start 1/2 cell before and end 1/2 cells after to ensure a smooth curve with other cells
						this._tmpCtx.moveTo(xChLeft - this._config.scaledCellWidth / 2, yMid);
						this._tmpCtx.bezierCurveTo(
							xChLeft - this._config.scaledCellWidth / 2, yCurlyTop,
							xChLeft, yCurlyTop,
							xChLeft, yMid
						);
						this._tmpCtx.bezierCurveTo(
							xChLeft, yCurlyBot,
							xChMid, yCurlyBot,
							xChMid, yMid
						);
						this._tmpCtx.bezierCurveTo(
							xChMid, yCurlyTop,
							xChRight, yCurlyTop,
							xChRight, yMid
						);
						this._tmpCtx.bezierCurveTo(
							xChRight, yCurlyBot,
							xChRight + this._config.scaledCellWidth / 2, yCurlyBot,
							xChRight + this._config.scaledCellWidth / 2, yMid
						);
						break;
					}
					case UnderlineStyle.DOTTED:
						this._tmpCtx.setLineDash([this._config.devicePixelRatio * 2, this._config.devicePixelRatio]);
						this._tmpCtx.moveTo(xChLeft, yTop);
						this._tmpCtx.lineTo(xChRight, yTop);
						break;
					case UnderlineStyle.DASHED:
						this._tmpCtx.setLineDash([this._config.devicePixelRatio * 4, this._config.devicePixelRatio * 3]);
						this._tmpCtx.moveTo(xChLeft, yTop);
						this._tmpCtx.lineTo(xChRight, yTop);
						break;
					case UnderlineStyle.SINGLE:
					default:
						this._tmpCtx.moveTo(xChLeft, yTop);
						this._tmpCtx.lineTo(xChRight, yTop);
						break;
				}
				this._tmpCtx.stroke();
				this._tmpCtx.restore();
			}
			this._tmpCtx.restore();

			// Draw stroke in the background color for non custom characters in order to give an outline
			// between the text and the underline. Only do this when font size is >= 12 as the underline
			// looks odd when the font size is too small
			if (!customGlyph && this._config.fontSize >= 12) {
				// This only works when transparency is disabled because it's not clear how to clear stroked
				// text
				if (!this._config.allowTransparency && chars !== ' ') {
					// Measure the text, only draw the stroke if there is a descent beyond an alphabetic text
					// baseline
					this._tmpCtx.save();
					this._tmpCtx.textBaseline = 'alphabetic';
					const metrics = this._tmpCtx.measureText(chars);
					this._tmpCtx.restore();
					if ('actualBoundingBoxDescent' in metrics && metrics.actualBoundingBoxDescent > 0) {
						// This translates to 1/2 the line width in either direction
						this._tmpCtx.save();
						// Clip the region to only draw in valid pixels near the underline to avoid a slight
						// outline around the whole glyph, as well as additional pixels in the glyph at the top
						// which would increase GPU memory demands
						const clipRegion = new Path2D();
						clipRegion.rect(xLeft, yTop - Math.ceil(lineWidth / 2), this._config.scaledCellWidth, yBot - yTop + Math.ceil(lineWidth / 2));
						this._tmpCtx.clip(clipRegion);
						this._tmpCtx.lineWidth = this._config.devicePixelRatio * 3;
						this._tmpCtx.strokeStyle = backgroundColor.css;
						this._tmpCtx.strokeText(chars, padding, padding + this._config.scaledCharHeight);
						this._tmpCtx.restore();
					}
				}
			}
		}

		// Draw the character
		if (!customGlyph) {
			this._tmpCtx.fillText(chars, padding, padding + this._config.scaledCharHeight);
		}

		// If this charcater is underscore and beyond the cell bounds, shift it up until it is visible
		// even on the bottom row, try for a maximum of 5 pixels.
		if (chars === '_' && !this._config.allowTransparency) {
			let isBeyondCellBounds = clearColor(this._tmpCtx.getImageData(padding, padding, this._config.scaledCellWidth, this._config.scaledCellHeight), backgroundColor, foregroundColor, enableClearThresholdCheck);
			if (isBeyondCellBounds) {
				for (let offset = 1; offset <= 5; offset++) {
					this._tmpCtx.save();
					this._tmpCtx.fillStyle = backgroundColor.css;
					this._tmpCtx.fillRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height);
					this._tmpCtx.restore();
					this._tmpCtx.fillText(chars, padding, padding + this._config.scaledCharHeight - offset);
					isBeyondCellBounds = clearColor(this._tmpCtx.getImageData(padding, padding, this._config.scaledCellWidth, this._config.scaledCellHeight), backgroundColor, foregroundColor, enableClearThresholdCheck);
					if (!isBeyondCellBounds) {
						break;
					}
				}
			}
		}

		// Draw strokethrough
		if (strikethrough) {
			const lineWidth = Math.max(1, Math.floor(this._config.fontSize * this._config.devicePixelRatio / 10));
			const yOffset = this._tmpCtx.lineWidth % 2 === 1 ? 0.5 : 0; // When the width is odd, draw at 0.5 position
			this._tmpCtx.lineWidth = lineWidth;
			this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle;
			this._tmpCtx.beginPath();
			this._tmpCtx.moveTo(padding, padding + Math.floor(this._config.scaledCharHeight / 2) - yOffset);
			this._tmpCtx.lineTo(padding + this._config.scaledCharWidth * chWidth, padding + Math.floor(this._config.scaledCharHeight / 2) - yOffset);
			this._tmpCtx.stroke();
		}

		this._tmpCtx.restore();

		// clear the background from the character to avoid issues with drawing over the previous
		// character if it extends past it's bounds
		const imageData = this._tmpCtx.getImageData(
			0, 0, this._tmpCanvas.width, this._tmpCanvas.height
		);

		// Clear out the background color and determine if the glyph is empty.
		let isEmpty: boolean;
		if (!this._config.allowTransparency) {
			isEmpty = clearColor(imageData, backgroundColor, foregroundColor, enableClearThresholdCheck);
		} else {
			isEmpty = checkCompletelyTransparent(imageData);
		}

		// Handle empty glyphs
		if (isEmpty) {
			return NULL_RASTERIZED_GLYPH;
		}

		const rasterizedGlyph = this._findGlyphBoundingBox(imageData, this._workBoundingBox, allowedWidth, false/*restrictedPowerlineGlyph*/, customGlyph, padding);
		const clippedImageData = this._clipImageData(imageData, this._workBoundingBox);

		// Find the best atlas row to use
		let activeRow: ICharAtlasActiveRow;
		while (true) {
			// Select the ideal existing row, preferring fixed rows over the current row
			activeRow = this._currentRow;
			for (const row of this._fixedRows) {
				if ((activeRow === this._currentRow || row.height < activeRow.height) && rasterizedGlyph.size.y <= row.height) {
					activeRow = row;
				}
			}

			// Create a new one if vertical space would be wasted, fixing the previously active row in the
			// process as it now has a fixed height
			if (activeRow.height > rasterizedGlyph.size.y * 2) {
				// Fix the current row as the new row is being added below
				if (this._currentRow.height > 0) {
					this._fixedRows.push(this._currentRow);
				}

				// Create the new fixed height row
				activeRow = {
					x: 0,
					y: this._currentRow.y + this._currentRow.height,
					height: rasterizedGlyph.size.y
				};
				this._fixedRows.push(activeRow);

				// Create the new current row below the new fixed height row
				this._currentRow = {
					x: 0,
					y: activeRow.y + activeRow.height,
					height: 0
				};
			}

			// Exit the loop if there is enough room in the row
			if (activeRow.x + rasterizedGlyph.size.x <= TEXTURE_WIDTH) {
				break;
			}

			// If there is enough room in the current row, finish it and try again
			if (activeRow === this._currentRow) {
				activeRow.x = 0;
				activeRow.y += activeRow.height;
				activeRow.height = 0;
			} else {
				this._fixedRows.splice(this._fixedRows.indexOf(activeRow), 1);
			}
		}

		// Record texture position
		rasterizedGlyph.texturePosition.x = activeRow.x;
		rasterizedGlyph.texturePosition.y = activeRow.y;
		rasterizedGlyph.texturePositionClipSpace.x = activeRow.x / TEXTURE_WIDTH;
		rasterizedGlyph.texturePositionClipSpace.y = activeRow.y / TEXTURE_HEIGHT;

		// Update atlas current row, for fixed rows the glyph height will never be larger than the row
		// height
		activeRow.height = Math.max(activeRow.height, rasterizedGlyph.size.y);
		activeRow.x += rasterizedGlyph.size.x;

		// putImageData doesn't do any blending, so it will overwrite any existing cache entry for us
		this._cacheCtx.putImageData(clippedImageData, rasterizedGlyph.texturePosition.x, rasterizedGlyph.texturePosition.y);

		return rasterizedGlyph;
	}

	/**
	 * Given an ImageData object, find the bounding box of the non-transparent
	 * portion of the texture and return an IRasterizedGlyph with these
	 * dimensions.
	 * @param imageData The image data to read.
	 * @param boundingBox An IBoundingBox to put the clipped bounding box values.
	 */
	private _findGlyphBoundingBox(imageData: ImageData, boundingBox: IBoundingBox, allowedWidth: number, restrictedGlyph: boolean, customGlyph: boolean, padding: number): IRasterizedGlyph {
		boundingBox.top = 0;
		const height = restrictedGlyph ? this._config.scaledCellHeight : this._tmpCanvas.height;
		const width = restrictedGlyph ? this._config.scaledCellWidth : allowedWidth;
		let found = false;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * this._tmpCanvas.width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.top = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.left = 0;
		found = false;
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * this._tmpCanvas.width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.left = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.right = width;
		found = false;
		for (let x = width - 1; x >= 0; x--) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * this._tmpCanvas.width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.right = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		boundingBox.bottom = height;
		found = false;
		for (let y = height - 1; y >= 0; y--) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * this._tmpCanvas.width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					boundingBox.bottom = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		return {
			texturePosition: { x: 0, y: 0 },
			texturePositionClipSpace: { x: 0, y: 0 },
			size: {
				x: boundingBox.right - boundingBox.left + 1,
				y: boundingBox.bottom - boundingBox.top + 1
			},
			sizeClipSpace: {
				x: (boundingBox.right - boundingBox.left + 1) / TEXTURE_WIDTH,
				y: (boundingBox.bottom - boundingBox.top + 1) / TEXTURE_HEIGHT
			},
			offset: {
				x: -boundingBox.left + padding + ((restrictedGlyph || customGlyph) ? Math.floor((this._config.scaledCellWidth - this._config.scaledCharWidth) / 2) : 0),
				y: -boundingBox.top + padding + ((restrictedGlyph || customGlyph) ? this._config.lineHeight === 1 ? 0 : Math.round((this._config.scaledCellHeight - this._config.scaledCharHeight) / 2) : 0)
			}
		};
	}

	private _clipImageData(imageData: ImageData, boundingBox: IBoundingBox): ImageData {
		const width = boundingBox.right - boundingBox.left + 1;
		const height = boundingBox.bottom - boundingBox.top + 1;
		const clippedData = new Uint8ClampedArray(width * height * 4);
		for (let y = boundingBox.top; y <= boundingBox.bottom; y++) {
			for (let x = boundingBox.left; x <= boundingBox.right; x++) {
				const oldOffset = y * this._tmpCanvas.width * 4 + x * 4;
				const newOffset = (y - boundingBox.top) * width * 4 + (x - boundingBox.left) * 4;
				clippedData[newOffset] = imageData.data[oldOffset];
				clippedData[newOffset + 1] = imageData.data[oldOffset + 1];
				clippedData[newOffset + 2] = imageData.data[oldOffset + 2];
				clippedData[newOffset + 3] = imageData.data[oldOffset + 3];
			}
		}
		return new ImageData(clippedData, width, height);
	}
}

/**
 * Makes a particular rgb color and colors that are nearly the same in an ImageData completely
 * transparent.
 * @returns True if the result is "empty", meaning all pixels are fully transparent.
 */
function clearColor(imageData: ImageData, bg: IColor, fg: IColor, enableThresholdCheck: boolean): boolean {
	// Get color channels
	const r = bg.rgba >>> 24;
	const g = bg.rgba >>> 16 & 0xFF;
	const b = bg.rgba >>> 8 & 0xFF;
	const fgR = fg.rgba >>> 24;
	const fgG = fg.rgba >>> 16 & 0xFF;
	const fgB = fg.rgba >>> 8 & 0xFF;

	// Calculate a threshold that when below a color will be treated as transpart when the sum of
	// channel value differs. This helps improve rendering when glyphs overlap with others. This
	// threshold is calculated relative to the difference between the background and foreground to
	// ensure important details of the glyph are always shown, even when the contrast ratio is low.
	// The number 12 is largely arbitrary to ensure the pixels that escape the cell in the test case
	// were covered (fg=#8ae234, bg=#c4a000).
	const threshold = Math.floor((Math.abs(r - fgR) + Math.abs(g - fgG) + Math.abs(b - fgB)) / 12);

	// Set alpha channel of relevent pixels to 0
	let isEmpty = true;
	for (let offset = 0; offset < imageData.data.length; offset += 4) {
		// Check exact match
		if (imageData.data[offset] === r &&
			imageData.data[offset + 1] === g &&
			imageData.data[offset + 2] === b) {
			imageData.data[offset + 3] = 0;
		} else {
			// Check the threshold based difference
			if (enableThresholdCheck &&
				(Math.abs(imageData.data[offset] - r) +
					Math.abs(imageData.data[offset + 1] - g) +
					Math.abs(imageData.data[offset + 2] - b)) < threshold) {
				imageData.data[offset + 3] = 0;
			} else {
				isEmpty = false;
			}
		}
	}

	return isEmpty;
}

function checkCompletelyTransparent(imageData: ImageData): boolean {
	for (let offset = 0; offset < imageData.data.length; offset += 4) {
		if (imageData.data[offset + 3] > 0) {
			return false;
		}
	}
	return true;
}
