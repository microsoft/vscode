/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { GlyphRenderer } from './GlyphRenderer';
// import { CursorRenderLayer } from './renderLayer/CursorRenderLayer';
import { acquireCharAtlas } from './atlas/CharAtlasCache';
import { WebglCharAtlas } from './atlas/WebglCharAtlas';
import { RectangleRenderer } from './RectangleRenderer';
import { IWebGL2RenderingContext } from './Types';
import { RenderModel } from './RenderModel';
import { IRenderLayer } from './renderLayer/Types';
import { Disposable } from 'vs/base/common/lifecycle';
import { observeDevicePixelDimensions } from 'vs/editor/browser/viewParts/lines/webgl/base/DevicePixelObserver';
import { IColorSet, IRenderDimensions, IRequestRedrawEvent } from 'vs/editor/browser/viewParts/lines/webgl/base/Types';
import { Emitter } from 'vs/base/common/event';

/** Work variables to avoid garbage collection. */
// const w: { fg: number; bg: number; hasFg: boolean; hasBg: boolean; isSelected: boolean } = {
// 	fg: 0,
// 	bg: 0,
// 	hasFg: false,
// 	hasBg: false,
// 	isSelected: false
// };

export class WebglRenderer extends Disposable {
	private _renderLayers: IRenderLayer[];
	private _charAtlas: WebglCharAtlas | undefined;
	private _devicePixelRatio: number;

	private _model: RenderModel = new RenderModel();
	// private _workCell: CellData = new CellData();
	// private _workColors: { fg: number; bg: number; ext: number } = { fg: 0, bg: 0, ext: 0 };

	private _canvas: HTMLCanvasElement;
	private _gl: IWebGL2RenderingContext;
	private _rectangleRenderer!: RectangleRenderer;
	private _glyphRenderer!: GlyphRenderer;

	public dimensions: IRenderDimensions;

	// private _core: { cols: number; rows: number };
	private _charSize = { width: 10, height: 20 };
	private _isAttached: boolean;
	// private _contextRestorationTimeout: number | undefined;

	private _onChangeTextureAtlas = new Emitter<HTMLCanvasElement>();
	public get onChangeTextureAtlas() { return this._onChangeTextureAtlas.event; }
	private _onRequestRedraw = new Emitter<IRequestRedrawEvent>();
	public get onRequestRedraw() { return this._onRequestRedraw.event; }

	private _onContextLoss = new Emitter<void>();
	public get onContextLoss() { return this._onContextLoss.event; }

	constructor(
		private _viewportDims: {
			cols: number;
			rows: number;
			options: {
				lineHeight: number;
				letterSpacing: number;
			};
		},
		private _colors: IColorSet,
		private readonly _screenElement: HTMLElement,
		preserveDrawingBuffer?: boolean
	) {
		super();

		// this._core = (this._viewportDims as any)._core;

		this._renderLayers = [
			// new CursorRenderLayer(_terminal, screenElement, 3, this._colors, this._onRequestRedraw, this._coreBrowserService, coreService)
		];
		this.dimensions = {
			scaledCharWidth: 0,
			scaledCharHeight: 0,
			scaledCellWidth: 0,
			scaledCellHeight: 0,
			scaledCharLeft: 0,
			scaledCharTop: 0,
			scaledCanvasWidth: 0,
			scaledCanvasHeight: 0,
			canvasWidth: 0,
			canvasHeight: 0,
			actualCellWidth: 0,
			actualCellHeight: 0
		};
		this._devicePixelRatio = window.devicePixelRatio;
		this._updateDimensions();

		this._canvas = document.createElement('canvas');

		const contextAttributes = {
			antialias: false,
			depth: false,
			preserveDrawingBuffer
		};
		this._gl = this._canvas.getContext('webgl2', contextAttributes) as IWebGL2RenderingContext;
		if (!this._gl) {
			throw new Error('WebGL2 not supported ' + this._gl);
		}

		// this.register(addDisposableDomListener(this._canvas, 'webglcontextlost', (e) => {
		// 	console.log('webglcontextlost event received');
		// 	// Prevent the default behavior in order to enable WebGL context restoration.
		// 	e.preventDefault();
		// 	// Wait a few seconds to see if the 'webglcontextrestored' event is fired.
		// 	// If not, dispatch the onContextLoss notification to observers.
		// 	this._contextRestorationTimeout = setTimeout(() => {
		// 		this._contextRestorationTimeout = undefined;
		// 		console.warn('webgl context not restored; firing onContextLoss');
		// 		this._onContextLoss.fire(e);
		// 	}, 3000 /* ms */);
		// }));
		// this.register(addDisposableDomListener(this._canvas, 'webglcontextrestored', (e) => {
		// 	console.warn('webglcontextrestored event received');
		// 	clearTimeout(this._contextRestorationTimeout);
		// 	this._contextRestorationTimeout = undefined;
		// 	// The texture atlas and glyph renderer must be fully reinitialized
		// 	// because their contents have been lost.
		// 	removeTerminalFromCache(this._terminal);
		// 	this._initializeWebGLState();
		// 	this._requestRedrawViewport();
		// }));

		this._register(observeDevicePixelDimensions(this._canvas, window, (w, h) => this._setCanvasDevicePixelDimensions(w, h)));

		this._screenElement.appendChild(this._canvas);

		this._initializeWebGLState();

		this._isAttached = window.document.body.contains(this._screenElement);
	}

	public override dispose(): void {
		super.dispose();
		for (const l of this._renderLayers) {
			l.dispose();
		}
		this._canvas.parentElement?.removeChild(this._canvas);
		// removeTerminalFromCache(this._terminal);
		super.dispose();
	}

	public get textureAtlas(): HTMLCanvasElement | undefined {
		return this._charAtlas?.cacheCanvas;
	}

	public setColors(colors: IColorSet): void {
		this._colors = colors;
		// Clear layers and force a full render
		for (const l of this._renderLayers) {
			l.setColors(/*this._terminal, */this._colors);
			l.reset(/*this._terminal*/);
		}

		this._rectangleRenderer.setColors();

		this._refreshCharAtlas();

		// Force a full refresh
		this._clearModel(true);
	}

	public onDevicePixelRatioChange(): void {
		// If the device pixel ratio changed, the char atlas needs to be regenerated
		// and the terminal needs to refreshed
		if (this._devicePixelRatio !== window.devicePixelRatio) {
			this._devicePixelRatio = window.devicePixelRatio;
			this.onResize(this._viewportDims.cols, this._viewportDims.rows);
		}
	}

	public onResize(cols: number, rows: number): void {
		// Update character and canvas dimensions
		this._updateDimensions();

		this._model.resize(this._viewportDims.cols, this._viewportDims.rows);

		// Resize all render layers
		for (const l of this._renderLayers) {
			l.resize(/*this._terminal, */this.dimensions);
		}

		// Resize the canvas
		this._canvas.width = this.dimensions.scaledCanvasWidth;
		this._canvas.height = this.dimensions.scaledCanvasHeight;
		this._canvas.style.width = `${this.dimensions.canvasWidth}px`;
		this._canvas.style.height = `${this.dimensions.canvasHeight}px`;

		// Resize the screen
		this._screenElement.style.width = `${this.dimensions.canvasWidth}px`;
		this._screenElement.style.height = `${this.dimensions.canvasHeight}px`;

		this._rectangleRenderer.setDimensions(this.dimensions);
		this._rectangleRenderer.onResize();
		this._glyphRenderer.setDimensions(this.dimensions);
		this._glyphRenderer.onResize();

		this._refreshCharAtlas();

		// Force a full refresh. Resizing `_glyphRenderer` should clear it already,
		// so there is no need to clear it again here.
		this._clearModel(false);
	}

	public onCharSizeChanged(): void {
		this.onResize(this._viewportDims.cols, this._viewportDims.rows);
	}

	public onBlur(): void {
		for (const l of this._renderLayers) {
			l.onBlur(/*this._terminal*/);
		}
		// Request a redraw for active/inactive selection background
		this._requestRedrawViewport();
	}

	public onFocus(): void {
		for (const l of this._renderLayers) {
			l.onFocus(/*this._terminal*/);
		}
		// Request a redraw for active/inactive selection background
		this._requestRedrawViewport();
	}

	public onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void {
		for (const l of this._renderLayers) {
			l.onSelectionChanged(/*this._terminal, */start, end, columnSelectMode);
		}
		this._updateSelectionModel(start, end, columnSelectMode);
		this._requestRedrawViewport();
	}

	public onCursorMove(): void {
		for (const l of this._renderLayers) {
			l.onCursorMove(/*this._terminal*/);
		}
	}

	public onOptionsChanged(): void {
		for (const l of this._renderLayers) {
			l.onOptionsChanged(/*this._terminal*/);
		}
		this._updateDimensions();
		this._refreshCharAtlas();
	}

	/**
	 * Initializes members dependent on WebGL context state.
	 */
	private _initializeWebGLState(): void {
		// Dispose any previous rectangle and glyph renderers before creating new ones.
		this._rectangleRenderer?.dispose();
		this._glyphRenderer?.dispose();

		this._rectangleRenderer = new RectangleRenderer(this._viewportDims, this._colors, this._gl, this.dimensions);
		this._glyphRenderer = new GlyphRenderer(this._viewportDims, this._gl, this.dimensions);

		// Update dimensions and acquire char atlas
		this.onCharSizeChanged();
	}

	/**
	 * Refreshes the char atlas, aquiring a new one if necessary.
	 * @param terminal The terminal.
	 * @param colorSet The color set to use for the char atlas.
	 */
	private _refreshCharAtlas(): void {
		if (this.dimensions.scaledCharWidth <= 0 && this.dimensions.scaledCharHeight <= 0) {
			// Mark as not attached so char atlas gets refreshed on next render
			this._isAttached = false;
			return;
		}

		const atlas = acquireCharAtlas(/*this._terminal, */this._colors, this.dimensions.scaledCellWidth, this.dimensions.scaledCellHeight, this.dimensions.scaledCharWidth, this.dimensions.scaledCharHeight, window.devicePixelRatio);
		if (!('getRasterizedGlyph' in atlas)) {
			throw new Error('The webgl renderer only works with the webgl char atlas');
		}
		if (this._charAtlas !== atlas) {
			this._onChangeTextureAtlas.fire(atlas.cacheCanvas);
		}
		this._charAtlas = atlas;
		this._charAtlas.warmUp();
		this._glyphRenderer.setAtlas(this._charAtlas);
	}

	/**
	 * Clear the model.
	 * @param clearGlyphRenderer Whether to also clear the glyph renderer. This
	 * should be true generally to make sure it is in the same state as the model.
	 */
	private _clearModel(clearGlyphRenderer: boolean): void {
		this._model.clear();
		if (clearGlyphRenderer) {
			this._glyphRenderer.clear();
		}
	}

	public clearCharAtlas(): void {
		this._charAtlas?.clearTexture();
		this._clearModel(true);
		this._updateModel(0, this._viewportDims.rows - 1);
		this._requestRedrawViewport();
	}

	public clear(): void {
		this._clearModel(true);
		for (const l of this._renderLayers) {
			l.reset(/*this._terminal*/);
		}
	}

	public registerCharacterJoiner(handler: (text: string) => [number, number][]): number {
		return -1;
	}

	public deregisterCharacterJoiner(joinerId: number): boolean {
		return false;
	}

	public renderRows(start: number, end: number): void {
		if (!this._isAttached) {
			if (window.document.body.contains(this._screenElement) && this._charSize.width && this._charSize.height) {
				this._updateDimensions();
				this._refreshCharAtlas();
				this._isAttached = true;
			} else {
				return;
			}
		}

		// Update render layers
		for (const l of this._renderLayers) {
			l.onGridChanged(/*this._terminal, */start, end);
		}

		// Tell renderer the frame is beginning
		if (this._glyphRenderer.beginFrame()) {
			this._clearModel(true);
			this._updateSelectionModel(undefined, undefined);
		}

		// Update model to reflect what's drawn
		this._updateModel(start, end);

		// Render
		this._rectangleRenderer.render();
		this._glyphRenderer.render(this._model);
	}

	private _updateModel(start: number, end: number): void {
		// TODO: Update the model for monaco

		// const terminal = this._core;
		// let cell: ICellData = this._workCell;

		// // Declare variable ahead of time to avoid garbage collection
		// let lastBg: number;
		// let y: number;
		// let row: number;
		// let line: IBufferLine;
		// let joinedRanges: [number, number][];
		// let isJoined: boolean;
		// let lastCharX: number;
		// let range: [number, number];
		// let chars: string;
		// let code: number;
		// let i: number;
		// let x: number;
		// let j: number;

		// for (y = start; y <= end; y++) {
		// 	row = y + terminal.buffer.ydisp;
		// 	line = terminal.buffer.lines.get(row)!;
		// 	this._model.lineLengths[y] = 0;
		// 	joinedRanges = this._characterJoinerService.getJoinedCharacters(row);
		// 	for (x = 0; x < terminal.cols; x++) {
		// 		lastBg = this._workColors.bg;
		// 		line.loadCell(x, cell);

		// 		if (x === 0) {
		// 			lastBg = this._workColors.bg;
		// 		}

		// 		// If true, indicates that the current character(s) to draw were joined.
		// 		isJoined = false;
		// 		lastCharX = x;

		// 		// Process any joined character ranges as needed. Because of how the
		// 		// ranges are produced, we know that they are valid for the characters
		// 		// and attributes of our input.
		// 		if (joinedRanges.length > 0 && x === joinedRanges[0][0]) {
		// 			isJoined = true;
		// 			range = joinedRanges.shift()!;

		// 			// We already know the exact start and end column of the joined range,
		// 			// so we get the string and width representing it directly.
		// 			cell = new JoinedCellData(
		// 				cell,
		// 				line!.translateToString(true, range[0], range[1]),
		// 				range[1] - range[0]
		// 			);

		// 			// Skip over the cells occupied by this range in the loop
		// 			lastCharX = range[1] - 1;
		// 		}

		// 		chars = cell.getChars();
		// 		code = cell.getCode();
		// 		i = ((y * terminal.cols) + x) * RENDER_MODEL_INDICIES_PER_CELL;

		// 		// Load colors/resolve overrides into work colors
		// 		this._loadColorsForCell(x, row);

		// 		if (code !== NULL_CELL_CODE) {
		// 			this._model.lineLengths[y] = x + 1;
		// 		}

		// 		// Nothing has changed, no updates needed
		// 		if (this._model.cells[i] === code &&
		// 			this._model.cells[i + RENDER_MODEL_BG_OFFSET] === this._workColors.bg &&
		// 			this._model.cells[i + RENDER_MODEL_FG_OFFSET] === this._workColors.fg &&
		// 			this._model.cells[i + RENDER_MODEL_EXT_OFFSET] === this._workColors.ext) {
		// 			continue;
		// 		}

		// 		// Flag combined chars with a bit mask so they're easily identifiable
		// 		if (chars.length > 1) {
		// 			code |= COMBINED_CHAR_BIT_MASK;
		// 		}

		// 		// Cache the results in the model
		// 		this._model.cells[i] = code;
		// 		this._model.cells[i + RENDER_MODEL_BG_OFFSET] = this._workColors.bg;
		// 		this._model.cells[i + RENDER_MODEL_FG_OFFSET] = this._workColors.fg;
		// 		this._model.cells[i + RENDER_MODEL_EXT_OFFSET] = this._workColors.ext;

		// 		this._glyphRenderer.updateCell(x, y, code, this._workColors.bg, this._workColors.fg, this._workColors.ext, chars, lastBg);

		// 		if (isJoined) {
		// 			// Restore work cell
		// 			cell = this._workCell;

		// 			// Null out non-first cells
		// 			for (x++; x < lastCharX; x++) {
		// 				j = ((y * terminal.cols) + x) * RENDER_MODEL_INDICIES_PER_CELL;
		// 				this._glyphRenderer.updateCell(x, y, NULL_CELL_CODE, 0, 0, 0, NULL_CELL_CHAR, 0);
		// 				this._model.cells[j] = NULL_CELL_CODE;
		// 				this._model.cells[j + RENDER_MODEL_BG_OFFSET] = this._workColors.bg;
		// 				this._model.cells[j + RENDER_MODEL_FG_OFFSET] = this._workColors.fg;
		// 				this._model.cells[j + RENDER_MODEL_EXT_OFFSET] = this._workColors.ext;
		// 			}
		// 		}
		// 	}
		// }
		// this._rectangleRenderer.updateBackgrounds(this._model);
	}

	/**
	 * Loads colors for the cell into the work colors object. This resolves overrides/inverse if
	 * necessary which is why the work cell object is not used.
	 */
	// private _loadColorsForCell(x: number, y: number): void {
	// 	this._workColors.bg = this._workCell.bg;
	// 	this._workColors.fg = this._workCell.fg;
	// 	this._workColors.ext = this._workCell.bg & BgFlags.HAS_EXTENDED ? this._workCell.extended.ext : 0;
	// 	// Get any foreground/background overrides, this happens on the model to avoid spreading
	// 	// override logic throughout the different sub-renderers

	// 	// Reset overrides work variables
	// 	w.bg = 0;
	// 	w.fg = 0;
	// 	w.hasBg = false;
	// 	w.hasFg = false;
	// 	w.isSelected = false;

	// 	// Apply decorations on the bottom layer
	// 	// this._decorationService.forEachDecorationAtCell(x, y, 'bottom', d => {
	// 	// 	if (d.backgroundColorRGB) {
	// 	// 		w.bg = d.backgroundColorRGB.rgba >> 8 & 0xFFFFFF;
	// 	// 		w.hasBg = true;
	// 	// 	}
	// 	// 	if (d.foregroundColorRGB) {
	// 	// 		w.fg = d.foregroundColorRGB.rgba >> 8 & 0xFFFFFF;
	// 	// 		w.hasFg = true;
	// 	// 	}
	// 	// });

	// 	// Apply the selection color if needed
	// 	w.isSelected = this._isCellSelected(x, y);
	// 	if (w.isSelected) {
	// 		w.bg = (this._coreBrowserService.isFocused ? this._colors.selectionBackgroundOpaque : this._colors.selectionInactiveBackgroundOpaque).rgba >> 8 & 0xFFFFFF;
	// 		w.hasBg = true;
	// 		if (this._colors.selectionForeground) {
	// 			w.fg = this._colors.selectionForeground.rgba >> 8 & 0xFFFFFF;
	// 			w.hasFg = true;
	// 		}
	// 	}

	// 	// Apply decorations on the top layer
	// 	// this._decorationService.forEachDecorationAtCell(x, y, 'top', d => {
	// 	// 	if (d.backgroundColorRGB) {
	// 	// 		w.bg = d.backgroundColorRGB.rgba >> 8 & 0xFFFFFF;
	// 	// 		w.hasBg = true;
	// 	// 	}
	// 	// 	if (d.foregroundColorRGB) {
	// 	// 		w.fg = d.foregroundColorRGB.rgba >> 8 & 0xFFFFFF;
	// 	// 		w.hasFg = true;
	// 	// 	}
	// 	// });

	// 	// Convert any overrides from rgba to the fg/bg packed format. This resolves the inverse flag
	// 	// ahead of time in order to use the correct cache key
	// 	if (w.hasBg) {
	// 		if (w.isSelected) {
	// 			// Non-RGB attributes from model + force non-dim + override + force RGB color mode
	// 			w.bg = (this._workCell.bg & ~Attributes.RGB_MASK & ~BgFlags.DIM) | w.bg | Attributes.CM_RGB;
	// 		} else {
	// 			// Non-RGB attributes from model + override + force RGB color mode
	// 			w.bg = (this._workCell.bg & ~Attributes.RGB_MASK) | w.bg | Attributes.CM_RGB;
	// 		}
	// 	}
	// 	if (w.hasFg) {
	// 		// Non-RGB attributes from model + force disable inverse + override + force RGB color mode
	// 		w.fg = (this._workCell.fg & ~Attributes.RGB_MASK & ~FgFlags.INVERSE) | w.fg | Attributes.CM_RGB;
	// 	}

	// 	// Handle case where inverse was specified by only one of bg override or fg override was set,
	// 	// resolving the other inverse color and setting the inverse flag if needed.
	// 	if (this._workColors.fg & FgFlags.INVERSE) {
	// 		if (w.hasBg && !w.hasFg) {
	// 			// Resolve bg color type (default color has a different meaning in fg vs bg)
	// 			if ((this._workColors.bg & Attributes.CM_MASK) === Attributes.CM_DEFAULT) {
	// 				w.fg = (this._workColors.fg & ~(Attributes.RGB_MASK | FgFlags.INVERSE | Attributes.CM_MASK)) | ((this._colors.background.rgba >> 8 & 0xFFFFFF) & Attributes.RGB_MASK) | Attributes.CM_RGB;
	// 			} else {
	// 				w.fg = (this._workColors.fg & ~(Attributes.RGB_MASK | FgFlags.INVERSE | Attributes.CM_MASK)) | this._workColors.bg & (Attributes.RGB_MASK | Attributes.CM_MASK);
	// 			}
	// 			w.hasFg = true;
	// 		}
	// 		if (!w.hasBg && w.hasFg) {
	// 			// Resolve bg color type (default color has a different meaning in fg vs bg)
	// 			if ((this._workColors.fg & Attributes.CM_MASK) === Attributes.CM_DEFAULT) {
	// 				w.bg = (this._workColors.bg & ~(Attributes.RGB_MASK | Attributes.CM_MASK)) | ((this._colors.foreground.rgba >> 8 & 0xFFFFFF) & Attributes.RGB_MASK) | Attributes.CM_RGB;
	// 			} else {
	// 				w.bg = (this._workColors.bg & ~(Attributes.RGB_MASK | Attributes.CM_MASK)) | this._workColors.fg & (Attributes.RGB_MASK | Attributes.CM_MASK);
	// 			}
	// 			w.hasBg = true;
	// 		}
	// 	}

	// 	// Use the override if it exists
	// 	this._workColors.bg = w.hasBg ? w.bg : this._workColors.bg;
	// 	this._workColors.fg = w.hasFg ? w.fg : this._workColors.fg;
	// }

	// private _isCellSelected(x: number, y: number): boolean {
	// 	return false;
	// 	// if (!this._model.selection.hasSelection) {
	// 	// 	return false;
	// 	// }
	// 	// y -= this._viewportDims.buffer.active.viewportY;
	// 	// if (this._model.selection.columnSelectMode) {
	// 	// 	if (this._model.selection.startCol <= this._model.selection.endCol) {
	// 	// 		return x >= this._model.selection.startCol && y >= this._model.selection.viewportCappedStartRow &&
	// 	// 			x < this._model.selection.endCol && y <= this._model.selection.viewportCappedEndRow;
	// 	// 	}
	// 	// 	return x < this._model.selection.startCol && y >= this._model.selection.viewportCappedStartRow &&
	// 	// 		x >= this._model.selection.endCol && y <= this._model.selection.viewportCappedEndRow;
	// 	// }
	// 	// return (y > this._model.selection.viewportStartRow && y < this._model.selection.viewportEndRow) ||
	// 	// 	(this._model.selection.viewportStartRow === this._model.selection.viewportEndRow && y === this._model.selection.viewportStartRow && x >= this._model.selection.startCol && x < this._model.selection.endCol) ||
	// 	// 	(this._model.selection.viewportStartRow < this._model.selection.viewportEndRow && y === this._model.selection.viewportEndRow && x < this._model.selection.endCol) ||
	// 	// 	(this._model.selection.viewportStartRow < this._model.selection.viewportEndRow && y === this._model.selection.viewportStartRow && x >= this._model.selection.startCol);
	// }

	private _updateSelectionModel(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean = false): void {
		// const terminal = this._viewportDims;

		// Selection does not exist
		if (!start || !end || (start[0] === end[0] && start[1] === end[1])) {
			this._model.clearSelection();
			return;
		}

		return;

		// // Translate from buffer position to viewport position
		// const viewportStartRow = start[1] - terminal.buffer.active.viewportY;
		// const viewportEndRow = end[1] - terminal.buffer.active.viewportY;
		// const viewportCappedStartRow = Math.max(viewportStartRow, 0);
		// const viewportCappedEndRow = Math.min(viewportEndRow, terminal.rows - 1);

		// // No need to draw the selection
		// if (viewportCappedStartRow >= terminal.rows || viewportCappedEndRow < 0) {
		// 	this._model.clearSelection();
		// 	return;
		// }

		// this._model.selection.hasSelection = true;
		// this._model.selection.columnSelectMode = columnSelectMode;
		// this._model.selection.viewportStartRow = viewportStartRow;
		// this._model.selection.viewportEndRow = viewportEndRow;
		// this._model.selection.viewportCappedStartRow = viewportCappedStartRow;
		// this._model.selection.viewportCappedEndRow = viewportCappedEndRow;
		// this._model.selection.startCol = start[0];
		// this._model.selection.endCol = end[0];
	}

	/**
	 * Recalculates the character and canvas dimensions.
	 */
	private _updateDimensions(): void {
		// TODO: Acquire CharSizeService properly

		// Perform a new measure if the CharMeasure dimensions are not yet available
		if (!this._charSize.width || !this._charSize.height) {
			return;
		}

		// Calculate the scaled character width. Width is floored as it must be drawn to an integer grid
		// in order for the char atlas glyphs to not be blurry.
		this.dimensions.scaledCharWidth = Math.floor(this._charSize.width * this._devicePixelRatio);

		// Calculate the scaled character height. Height is ceiled in case devicePixelRatio is a
		// floating point number in order to ensure there is enough space to draw the character to the
		// cell.
		this.dimensions.scaledCharHeight = Math.ceil(this._charSize.height * this._devicePixelRatio);

		// Calculate the scaled cell height, if lineHeight is _not_ 1, the resulting value will be
		// floored since lineHeight can never be lower then 1, this guarentees the scaled cell height
		// will always be larger than scaled char height.
		this.dimensions.scaledCellHeight = Math.floor(this.dimensions.scaledCharHeight * this._viewportDims.options.lineHeight);

		// Calculate the y offset within a cell that glyph should draw at in order for it to be centered
		// correctly within the cell.
		this.dimensions.scaledCharTop = this._viewportDims.options.lineHeight === 1 ? 0 : Math.round((this.dimensions.scaledCellHeight - this.dimensions.scaledCharHeight) / 2);

		// Calculate the scaled cell width, taking the letterSpacing into account.
		this.dimensions.scaledCellWidth = this.dimensions.scaledCharWidth + Math.round(this._viewportDims.options.letterSpacing);

		// Calculate the x offset with a cell that text should draw from in order for it to be centered
		// correctly within the cell.
		this.dimensions.scaledCharLeft = Math.floor(this._viewportDims.options.letterSpacing / 2);

		// Recalculate the canvas dimensions, the scaled dimensions define the actual number of pixel in
		// the canvas
		this.dimensions.scaledCanvasHeight = this._viewportDims.rows * this.dimensions.scaledCellHeight;
		this.dimensions.scaledCanvasWidth = this._viewportDims.cols * this.dimensions.scaledCellWidth;

		// The the size of the canvas on the page. It's important that this rounds to nearest integer
		// and not ceils as browsers often have floating point precision issues where
		// `window.devicePixelRatio` ends up being something like `1.100000023841858` for example, when
		// it's actually 1.1. Ceiling may causes blurriness as the backing canvas image is 1 pixel too
		// large for the canvas element size.
		this.dimensions.canvasHeight = Math.round(this.dimensions.scaledCanvasHeight / this._devicePixelRatio);
		this.dimensions.canvasWidth = Math.round(this.dimensions.scaledCanvasWidth / this._devicePixelRatio);

		// Get the CSS dimensions of an individual cell. This needs to be derived from the calculated
		// device pixel canvas value above. CharMeasure.width/height by itself is insufficient when the
		// page is not at 100% zoom level as CharMeasure is measured in CSS pixels, but the actual char
		// size on the canvas can differ.
		this.dimensions.actualCellHeight = this.dimensions.scaledCellHeight / this._devicePixelRatio;
		this.dimensions.actualCellWidth = this.dimensions.scaledCellWidth / this._devicePixelRatio;
	}

	private _setCanvasDevicePixelDimensions(width: number, height: number): void {
		if (this._canvas.width === width && this._canvas.height === height) {
			return;
		}
		// While the actual canvas size has changed, keep scaledCanvasWidth/Height as the value before
		// the change as it's an exact multiple of the cell sizes.
		this._canvas.width = width;
		this._canvas.height = height;
		this._requestRedrawViewport();
	}

	private _requestRedrawViewport(): void {
		this._onRequestRedraw.fire({ start: 0, end: this._viewportDims.rows - 1 });
	}
}
