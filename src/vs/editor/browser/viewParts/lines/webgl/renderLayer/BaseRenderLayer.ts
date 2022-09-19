/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// import { IRenderLayer } from './Types';
// import { acquireCharAtlas } from '../atlas/CharAtlasCache';
// import { Terminal } from 'xterm';
// import { IColorSet } from 'browser/Types';
// import { TEXT_BASELINE } from 'browser/renderer/Constants';
// import { ICoreBrowserService } from 'browser/services/Services';
// import { IRenderDimensions } from 'browser/renderer/Types';
// import { CellData } from 'common/buffer/CellData';
// import { WebglCharAtlas } from 'atlas/WebglCharAtlas';
// import { throwIfFalsy } from '../WebglUtils';

// export abstract class BaseRenderLayer implements IRenderLayer {
// 	private _canvas: HTMLCanvasElement;
// 	protected _ctx!: CanvasRenderingContext2D;
// 	private _scaledCharWidth: number = 0;
// 	private _scaledCharHeight: number = 0;
// 	private _scaledCellWidth: number = 0;
// 	private _scaledCellHeight: number = 0;
// 	private _scaledCharLeft: number = 0;
// 	private _scaledCharTop: number = 0;

// 	protected _charAtlas: WebglCharAtlas | undefined;

// 	constructor(
// 		private _container: HTMLElement,
// 		id: string,
// 		zIndex: number,
// 		private _alpha: boolean,
// 		protected _colors: IColorSet,
// 		protected readonly _coreBrowserService: ICoreBrowserService
// 	) {
// 		this._canvas = document.createElement('canvas');
// 		this._canvas.classList.add(`xterm-${id}-layer`);
// 		this._canvas.style.zIndex = zIndex.toString();
// 		this._initCanvas();
// 		this._container.appendChild(this._canvas);
// 	}

// 	public dispose(): void {
// 		this._canvas.remove();
// 		if (this._charAtlas) {
// 			this._charAtlas.dispose();
// 		}
// 	}

// 	private _initCanvas(): void {
// 		this._ctx = throwIfFalsy(this._canvas.getContext('2d', { alpha: this._alpha }));
// 		// Draw the background if this is an opaque layer
// 		if (!this._alpha) {
// 			this._clearAll();
// 		}
// 	}

// 	public onOptionsChanged(terminal: Terminal): void { }
// 	public onBlur(terminal: Terminal): void { }
// 	public onFocus(terminal: Terminal): void { }
// 	public onCursorMove(terminal: Terminal): void { }
// 	public onGridChanged(terminal: Terminal, startRow: number, endRow: number): void { }
// 	public onSelectionChanged(terminal: Terminal, start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean = false): void { }

// 	public setColors(terminal: Terminal, colorSet: IColorSet): void {
// 		this._refreshCharAtlas(terminal, colorSet);
// 	}

// 	protected _setTransparency(terminal: Terminal, alpha: boolean): void {
// 		// Do nothing when alpha doesn't change
// 		if (alpha === this._alpha) {
// 			return;
// 		}

// 		// Create new canvas and replace old one
// 		const oldCanvas = this._canvas;
// 		this._alpha = alpha;
// 		// Cloning preserves properties
// 		this._canvas = this._canvas.cloneNode() as HTMLCanvasElement;
// 		this._initCanvas();
// 		this._container.replaceChild(this._canvas, oldCanvas);

// 		// Regenerate char atlas and force a full redraw
// 		this._refreshCharAtlas(terminal, this._colors);
// 		this.onGridChanged(terminal, 0, terminal.rows - 1);
// 	}

// 	/**
// 	 * Refreshes the char atlas, aquiring a new one if necessary.
// 	 * @param terminal The terminal.
// 	 * @param colorSet The color set to use for the char atlas.
// 	 */
// 	private _refreshCharAtlas(terminal: Terminal, colorSet: IColorSet): void {
// 		if (this._scaledCharWidth <= 0 && this._scaledCharHeight <= 0) {
// 			return;
// 		}
// 		this._charAtlas = acquireCharAtlas(terminal, colorSet, this._scaledCellWidth, this._scaledCellHeight, this._scaledCharWidth, this._scaledCharHeight, this._coreBrowserService.dpr);
// 		this._charAtlas.warmUp();
// 	}

// 	public resize(terminal: Terminal, dim: IRenderDimensions): void {
// 		this._scaledCellWidth = dim.scaledCellWidth;
// 		this._scaledCellHeight = dim.scaledCellHeight;
// 		this._scaledCharWidth = dim.scaledCharWidth;
// 		this._scaledCharHeight = dim.scaledCharHeight;
// 		this._scaledCharLeft = dim.scaledCharLeft;
// 		this._scaledCharTop = dim.scaledCharTop;
// 		this._canvas.width = dim.scaledCanvasWidth;
// 		this._canvas.height = dim.scaledCanvasHeight;
// 		this._canvas.style.width = `${dim.canvasWidth}px`;
// 		this._canvas.style.height = `${dim.canvasHeight}px`;

// 		// Draw the background if this is an opaque layer
// 		if (!this._alpha) {
// 			this._clearAll();
// 		}

// 		this._refreshCharAtlas(terminal, this._colors);
// 	}

// 	public abstract reset(terminal: Terminal): void;

// 	/**
// 	 * Fills 1+ cells completely. This uses the existing fillStyle on the context.
// 	 * @param x The column to start at.
// 	 * @param y The row to start at
// 	 * @param width The number of columns to fill.
// 	 * @param height The number of rows to fill.
// 	 */
// 	protected _fillCells(x: number, y: number, width: number, height: number): void {
// 		this._ctx.fillRect(
// 			x * this._scaledCellWidth,
// 			y * this._scaledCellHeight,
// 			width * this._scaledCellWidth,
// 			height * this._scaledCellHeight);
// 	}

// 	/**
// 	 * Fills a 1px line (2px on HDPI) at the bottom of the cell. This uses the
// 	 * existing fillStyle on the context.
// 	 * @param x The column to fill.
// 	 * @param y The row to fill.
// 	 */
// 	protected _fillBottomLineAtCells(x: number, y: number, width: number = 1): void {
// 		this._ctx.fillRect(
// 			x * this._scaledCellWidth,
// 			(y + 1) * this._scaledCellHeight - this._coreBrowserService.dpr - 1 /* Ensure it's drawn within the cell */,
// 			width * this._scaledCellWidth,
// 			this._coreBrowserService.dpr);
// 	}

// 	/**
// 	 * Fills a 1px line (2px on HDPI) at the left of the cell. This uses the
// 	 * existing fillStyle on the context.
// 	 * @param x The column to fill.
// 	 * @param y The row to fill.
// 	 */
// 	protected _fillLeftLineAtCell(x: number, y: number, width: number): void {
// 		this._ctx.fillRect(
// 			x * this._scaledCellWidth,
// 			y * this._scaledCellHeight,
// 			this._coreBrowserService.dpr * width,
// 			this._scaledCellHeight);
// 	}

// 	/**
// 	 * Strokes a 1px rectangle (2px on HDPI) around a cell. This uses the existing
// 	 * strokeStyle on the context.
// 	 * @param x The column to fill.
// 	 * @param y The row to fill.
// 	 */
// 	protected _strokeRectAtCell(x: number, y: number, width: number, height: number): void {
// 		this._ctx.lineWidth = this._coreBrowserService.dpr;
// 		this._ctx.strokeRect(
// 			x * this._scaledCellWidth + this._coreBrowserService.dpr / 2,
// 			y * this._scaledCellHeight + (this._coreBrowserService.dpr / 2),
// 			width * this._scaledCellWidth - this._coreBrowserService.dpr,
// 			(height * this._scaledCellHeight) - this._coreBrowserService.dpr);
// 	}

// 	/**
// 	 * Clears the entire canvas.
// 	 */
// 	protected _clearAll(): void {
// 		if (this._alpha) {
// 			this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
// 		} else {
// 			this._ctx.fillStyle = this._colors.background.css;
// 			this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
// 		}
// 	}

// 	/**
// 	 * Clears 1+ cells completely.
// 	 * @param x The column to start at.
// 	 * @param y The row to start at.
// 	 * @param width The number of columns to clear.
// 	 * @param height The number of rows to clear.
// 	 */
// 	protected _clearCells(x: number, y: number, width: number, height: number): void {
// 		if (this._alpha) {
// 			this._ctx.clearRect(
// 				x * this._scaledCellWidth,
// 				y * this._scaledCellHeight,
// 				width * this._scaledCellWidth,
// 				height * this._scaledCellHeight);
// 		} else {
// 			this._ctx.fillStyle = this._colors.background.css;
// 			this._ctx.fillRect(
// 				x * this._scaledCellWidth,
// 				y * this._scaledCellHeight,
// 				width * this._scaledCellWidth,
// 				height * this._scaledCellHeight);
// 		}
// 	}

// 	/**
// 	 * Draws a truecolor character at the cell. The character will be clipped to
// 	 * ensure that it fits with the cell, including the cell to the right if it's
// 	 * a wide character. This uses the existing fillStyle on the context.
// 	 * @param terminal The terminal.
// 	 * @param cell The cell data for the character to draw.
// 	 * @param x The column to draw at.
// 	 * @param y The row to draw at.
// 	 * @param color The color of the character.
// 	 */
// 	protected _fillCharTrueColor(terminal: Terminal, cell: CellData, x: number, y: number): void {
// 		this._ctx.font = this._getFont(terminal, false, false);
// 		this._ctx.textBaseline = TEXT_BASELINE;
// 		this._clipCell(x, y, cell.getWidth());
// 		this._ctx.fillText(
// 			cell.getChars(),
// 			x * this._scaledCellWidth + this._scaledCharLeft,
// 			y * this._scaledCellHeight + this._scaledCharTop + this._scaledCharHeight);
// 	}

// 	/**
// 	 * Clips a cell to ensure no pixels will be drawn outside of it.
// 	 * @param x The column to clip.
// 	 * @param y The row to clip.
// 	 * @param width The number of columns to clip.
// 	 */
// 	private _clipCell(x: number, y: number, width: number): void {
// 		this._ctx.beginPath();
// 		this._ctx.rect(
// 			x * this._scaledCellWidth,
// 			y * this._scaledCellHeight,
// 			width * this._scaledCellWidth,
// 			this._scaledCellHeight);
// 		this._ctx.clip();
// 	}

// 	/**
// 	 * Gets the current font.
// 	 * @param terminal The terminal.
// 	 * @param isBold If we should use the bold fontWeight.
// 	 */
// 	protected _getFont(terminal: Terminal, isBold: boolean, isItalic: boolean): string {
// 		const fontWeight = isBold ? terminal.options.fontWeightBold : terminal.options.fontWeight;
// 		const fontStyle = isItalic ? 'italic' : '';

// 		return `${fontStyle} ${fontWeight} ${terminal.options.fontSize! * this._coreBrowserService.dpr}px ${terminal.options.fontFamily}`;
// 	}
// }

