/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import type { IViewLineTokens } from '../../../common/tokens/lineTokens.js';
import { type ViewConfigurationChangedEvent, type ViewDecorationsChangedEvent, type ViewLineMappingChangedEvent, type ViewLinesChangedEvent, type ViewLinesDeletedEvent, type ViewLinesInsertedEvent, type ViewScrollChangedEvent, type ViewThemeChangedEvent, type ViewTokensChangedEvent, type ViewZonesChangedEvent } from '../../../common/viewEvents.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import type { InlineDecoration, ViewLineRenderingData } from '../../../common/viewModel.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import type { ViewLineOptions } from '../../viewParts/viewLines/viewLineOptions.js';
import type { ITextureAtlasPageGlyph } from '../atlas/atlas.js';
import { createContentSegmenter, type IContentSegmenter } from '../contentSegmenter.js';
import { BindingId } from '../gpu.js';
import { GPULifecycle } from '../gpuDisposable.js';
import { quadVertices } from '../gpuUtils.js';
import { GlyphRasterizer } from '../raster/glyphRasterizer.js';
import { ViewGpuContext } from '../viewGpuContext.js';
import { BaseRenderStrategy } from './baseRenderStrategy.js';
import { fullFileRenderStrategyWgsl } from './fullFileRenderStrategy.wgsl.js';

const enum Constants {
	IndicesPerCell = 6,
	CellBindBufferCapacityIncrement = 32,
	CellBindBufferInitialCapacity = 63, // Will be rounded up to nearest increment
}

const enum CellBufferInfo {
	FloatsPerEntry = 6,
	BytesPerEntry = CellBufferInfo.FloatsPerEntry * 4,
	Offset_X = 0,
	Offset_Y = 1,
	Offset_Unused1 = 2,
	Offset_Unused2 = 3,
	GlyphIndex = 4,
	TextureIndex = 5,
}

/**
 * A render strategy that uploads the content of the entire viewport every frame.
 */
export class ViewportRenderStrategy extends BaseRenderStrategy {
	/**
	 * The hard cap for line columns that can be rendered by the GPU renderer.
	 */
	static readonly maxSupportedColumns = 2000;

	readonly type = 'viewport';
	readonly wgsl: string = fullFileRenderStrategyWgsl;

	private _cellBindBufferLineCapacity = Constants.CellBindBufferInitialCapacity;
	private _cellBindBuffer!: GPUBuffer;

	/**
	 * The cell value buffers, these hold the cells and their glyphs. It's double buffers such that
	 * the thread doesn't block when one is being uploaded to the GPU.
	 */
	private _cellValueBuffers!: [ArrayBuffer, ArrayBuffer];
	private _activeDoubleBufferIndex: 0 | 1 = 0;

	private _visibleObjectCount: number = 0;

	private _scrollOffsetBindBuffer: GPUBuffer;
	private _scrollOffsetValueBuffer: Float32Array;
	private _scrollInitialized: boolean = false;

	get bindGroupEntries(): GPUBindGroupEntry[] {
		return [
			{ binding: BindingId.Cells, resource: { buffer: this._cellBindBuffer } },
			{ binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
		];
	}

	private readonly _onDidChangeBindGroupEntries = this._register(new Emitter<void>());
	readonly onDidChangeBindGroupEntries = this._onDidChangeBindGroupEntries.event;

	constructor(
		context: ViewContext,
		viewGpuContext: ViewGpuContext,
		device: GPUDevice,
		glyphRasterizer: { value: GlyphRasterizer },
	) {
		super(context, viewGpuContext, device, glyphRasterizer);

		this._rebuildCellBuffer(this._cellBindBufferLineCapacity);

		const scrollOffsetBufferSize = 2;
		this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco scroll offset buffer',
			size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})).object;
		this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
	}

	private _rebuildCellBuffer(lineCount: number) {
		this._cellBindBuffer?.destroy();

		// Increase in chunks so resizing a window by hand doesn't keep allocating and throwing away
		const lineCountWithIncrement = (Math.floor(lineCount / Constants.CellBindBufferCapacityIncrement) + 1) * Constants.CellBindBufferCapacityIncrement;

		const bufferSize = lineCountWithIncrement * ViewportRenderStrategy.maxSupportedColumns * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco full file cell buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;
		this._cellValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];
		this._cellBindBufferLineCapacity = lineCountWithIncrement;

		this._onDidChangeBindGroupEntries.fire();
	}

	// #region Event handlers

	// The primary job of these handlers is to:
	// 1. Invalidate the up to date line cache, which will cause the line to be re-rendered when
	//    it's _within the viewport_.
	// 2. Pass relevant events on to the render function so it can force certain line ranges to be
	//    re-rendered even if they're not in the viewport. For example when a view zone is added,
	//    there are lines that used to be visible but are no longer, so those ranges must be
	//    cleared and uploaded to the GPU.

	public override onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean {
		return true;
	}

	public override onDecorationsChanged(e: ViewDecorationsChangedEvent): boolean {
		return true;
	}

	public override onTokensChanged(e: ViewTokensChangedEvent): boolean {
		return true;
	}

	public override onLinesDeleted(e: ViewLinesDeletedEvent): boolean {
		return true;
	}

	public override onLinesInserted(e: ViewLinesInsertedEvent): boolean {
		return true;
	}

	public override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		return true;
	}

	public override onScrollChanged(e?: ViewScrollChangedEvent): boolean {
		const dpr = getActiveWindow().devicePixelRatio;
		this._scrollOffsetValueBuffer[0] = (e?.scrollLeft ?? this._context.viewLayout.getCurrentScrollLeft()) * dpr;
		this._scrollOffsetValueBuffer[1] = (e?.scrollTop ?? this._context.viewLayout.getCurrentScrollTop()) * dpr;
		this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer as Float32Array<ArrayBuffer>);
		return true;
	}

	public override onThemeChanged(e: ViewThemeChangedEvent): boolean {
		return true;
	}

	public override onLineMappingChanged(e: ViewLineMappingChangedEvent): boolean {
		return true;
	}

	public override onZonesChanged(e: ViewZonesChangedEvent): boolean {
		return true;
	}

	// #endregion

	reset() {
		for (const bufferIndex of [0, 1]) {
			// Zero out buffer and upload to GPU to prevent stale rows from rendering
			const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
			buffer.fill(0, 0, buffer.length);
			this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
		}
	}

	update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number {
		// IMPORTANT: This is a hot function. Variables are pre-allocated and shared within the
		// loop. This is done so we don't need to trust the JIT compiler to do this optimization to
		// avoid potential additional blocking time in garbage collector which is a common cause of
		// dropped frames.

		let chars = '';
		let segment: string | undefined;
		let charWidth = 0;
		let y = 0;
		let x = 0;
		let absoluteOffsetX = 0;
		let absoluteOffsetY = 0;
		let tabXOffset = 0;
		let glyph: Readonly<ITextureAtlasPageGlyph>;
		let cellIndex = 0;

		let tokenStartIndex = 0;
		let tokenEndIndex = 0;
		let tokenMetadata = 0;

		let decorationStyleSetBold: boolean | undefined;
		let decorationStyleSetColor: number | undefined;
		let decorationStyleSetOpacity: number | undefined;

		let lineData: ViewLineRenderingData;
		let decoration: InlineDecoration;
		let fillStartIndex = 0;
		let fillEndIndex = 0;

		let tokens: IViewLineTokens;

		const dpr = getActiveWindow().devicePixelRatio;
		let contentSegmenter: IContentSegmenter;

		if (!this._scrollInitialized) {
			this.onScrollChanged();
			this._scrollInitialized = true;
		}

		// Zero out cell buffer or rebuild if needed
		if (this._cellBindBufferLineCapacity < viewportData.endLineNumber - viewportData.startLineNumber + 1) {
			this._rebuildCellBuffer(viewportData.endLineNumber - viewportData.startLineNumber + 1);
		}
		const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
		cellBuffer.fill(0);

		const lineIndexCount = ViewportRenderStrategy.maxSupportedColumns * Constants.IndicesPerCell;

		for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {

			// Only attempt to render lines that the GPU renderer can handle
			if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
				continue;
			}

			lineData = viewportData.getViewLineRenderingData(y);
			tabXOffset = 0;

			contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
			charWidth = viewLineOptions.spaceWidth * dpr;
			absoluteOffsetX = 0;

			tokens = lineData.tokens;
			tokenStartIndex = lineData.minColumn - 1;
			tokenEndIndex = 0;
			for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
				tokenEndIndex = tokens.getEndOffset(tokenIndex);
				if (tokenEndIndex <= tokenStartIndex) {
					// The faux indent part of the line should have no token type
					continue;
				}

				tokenMetadata = tokens.getMetadata(tokenIndex);

				for (x = tokenStartIndex; x < tokenEndIndex; x++) {
					// Only render lines that do not exceed maximum columns
					if (x > ViewportRenderStrategy.maxSupportedColumns) {
						break;
					}
					segment = contentSegmenter.getSegmentAtIndex(x);
					if (segment === undefined) {
						continue;
					}
					chars = segment;

					if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
						charWidth = this.glyphRasterizer.getTextMetrics(chars).width;
					}

					decorationStyleSetColor = undefined;
					decorationStyleSetBold = undefined;
					decorationStyleSetOpacity = undefined;

					// Apply supported inline decoration styles to the cell metadata
					for (decoration of lineData.inlineDecorations) {
						// This is Range.strictContainsPosition except it works at the cell level,
						// it's also inlined to avoid overhead.
						if (
							(y < decoration.range.startLineNumber || y > decoration.range.endLineNumber) ||
							(y === decoration.range.startLineNumber && x < decoration.range.startColumn - 1) ||
							(y === decoration.range.endLineNumber && x >= decoration.range.endColumn - 1)
						) {
							continue;
						}

						const rules = ViewGpuContext.decorationCssRuleExtractor.getStyleRules(this._viewGpuContext.canvas.domNode, decoration.inlineClassName);
						for (const rule of rules) {
							for (const r of rule.style) {
								const value = rule.styleMap.get(r)?.toString() ?? '';
								switch (r) {
									case 'color': {
										// TODO: This parsing and error handling should move into canRender so fallback
										//       to DOM works
										const parsedColor = Color.Format.CSS.parse(value);
										if (!parsedColor) {
											throw new BugIndicatingError('Invalid color format ' + value);
										}
										decorationStyleSetColor = parsedColor.toNumber32Bit();
										break;
									}
									case 'font-weight': {
										const parsedValue = parseCssFontWeight(value);
										if (parsedValue >= 400) {
											decorationStyleSetBold = true;
											// TODO: Set bold (https://github.com/microsoft/vscode/issues/237584)
										} else {
											decorationStyleSetBold = false;
											// TODO: Set normal (https://github.com/microsoft/vscode/issues/237584)
										}
										break;
									}
									case 'opacity': {
										const parsedValue = parseCssOpacity(value);
										decorationStyleSetOpacity = parsedValue;
										break;
									}
									default: throw new BugIndicatingError('Unexpected inline decoration style');
								}
							}
						}
					}

					if (chars === ' ' || chars === '\t') {
						// Zero out glyph to ensure it doesn't get rendered
						cellIndex = ((y - 1) * ViewportRenderStrategy.maxSupportedColumns + x) * Constants.IndicesPerCell;
						cellBuffer.fill(0, cellIndex, cellIndex + CellBufferInfo.FloatsPerEntry);
						// Adjust xOffset for tab stops
						if (chars === '\t') {
							// Find the pixel offset between the current position and the next tab stop
							const offsetBefore = x + tabXOffset;
							tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
							absoluteOffsetX += charWidth * (tabXOffset - offsetBefore);
							// Convert back to offset excluding x and the current character
							tabXOffset -= x + 1;
						} else {
							absoluteOffsetX += charWidth;
						}
						continue;
					}

					const decorationStyleSetId = ViewGpuContext.decorationStyleCache.getOrCreateEntry(decorationStyleSetColor, decorationStyleSetBold, decorationStyleSetOpacity);
					glyph = this._viewGpuContext.atlas.getGlyph(this.glyphRasterizer, chars, tokenMetadata, decorationStyleSetId, absoluteOffsetX);

					absoluteOffsetY = Math.round(
						// Top of layout box (includes line height)
						viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] * dpr +

						// Delta from top of layout box (includes line height) to top of the inline box (no line height)
						Math.floor((viewportData.lineHeight * dpr - (glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent)) / 2) +

						// Delta from top of inline box (no line height) to top of glyph origin. If the glyph was drawn
						// with a top baseline for example, this ends up drawing the glyph correctly using the alphabetical
						// baseline.
						glyph.fontBoundingBoxAscent
					);

					cellIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns + x) * Constants.IndicesPerCell;
					cellBuffer[cellIndex + CellBufferInfo.Offset_X] = Math.floor(absoluteOffsetX);
					cellBuffer[cellIndex + CellBufferInfo.Offset_Y] = absoluteOffsetY;
					cellBuffer[cellIndex + CellBufferInfo.GlyphIndex] = glyph.glyphIndex;
					cellBuffer[cellIndex + CellBufferInfo.TextureIndex] = glyph.pageIndex;

					// Adjust the x pixel offset for the next character
					absoluteOffsetX += charWidth;
				}

				tokenStartIndex = tokenEndIndex;
			}

			// Clear to end of line
			fillStartIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns + tokenEndIndex) * Constants.IndicesPerCell;
			fillEndIndex = ((y - viewportData.startLineNumber) * ViewportRenderStrategy.maxSupportedColumns) * Constants.IndicesPerCell;
			cellBuffer.fill(0, fillStartIndex, fillEndIndex);
		}

		const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;

		// This render strategy always uploads the whole viewport
		this._device.queue.writeBuffer(
			this._cellBindBuffer,
			0,
			cellBuffer.buffer,
			0,
			(viewportData.endLineNumber - viewportData.startLineNumber) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT
		);

		this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;

		this._visibleObjectCount = visibleObjectCount;

		return visibleObjectCount;
	}

	draw(pass: GPURenderPassEncoder, viewportData: ViewportData): void {
		if (this._visibleObjectCount <= 0) {
			throw new BugIndicatingError('Attempt to draw 0 objects');
		}
		pass.draw(quadVertices.length / 2, this._visibleObjectCount);
	}
}

function parseCssFontWeight(value: string) {
	switch (value) {
		case 'lighter':
		case 'normal': return 400;
		case 'bolder':
		case 'bold': return 700;
	}
	return parseInt(value);
}

function parseCssOpacity(value: string): number {
	if (value.endsWith('%')) {
		return parseFloat(value.substring(0, value.length - 1)) / 100;
	}
	if (value.match(/^\d+(?:\.\d*)/)) {
		return parseFloat(value);
	}
	return 1;
}
