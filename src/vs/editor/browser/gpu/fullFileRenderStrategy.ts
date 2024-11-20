/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { MandatoryMutableDisposable } from '../../../base/common/lifecycle.js';
import { EditorOption } from '../../common/config/editorOptions.js';
import { CursorColumns } from '../../common/core/cursorColumns.js';
import { MetadataConsts } from '../../common/encodedTokenAttributes.js';
import type { IViewLineTokens } from '../../common/tokens/lineTokens.js';
import { ViewEventHandler } from '../../common/viewEventHandler.js';
import { ViewEventType, type ViewConfigurationChangedEvent, type ViewDecorationsChangedEvent, type ViewLinesChangedEvent, type ViewLinesDeletedEvent, type ViewLinesInsertedEvent, type ViewScrollChangedEvent, type ViewTokensChangedEvent, type ViewZonesChangedEvent } from '../../common/viewEvents.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewLineRenderingData } from '../../common/viewModel.js';
import type { ViewContext } from '../../common/viewModel/viewContext.js';
import type { ViewLineOptions } from '../viewParts/viewLines/viewLineOptions.js';
import type { ITextureAtlasPageGlyph } from './atlas/atlas.js';
import { fullFileRenderStrategyWgsl } from './fullFileRenderStrategy.wgsl.js';
import { BindingId, type IGpuRenderStrategy } from './gpu.js';
import { GPULifecycle } from './gpuDisposable.js';
import { quadVertices } from './gpuUtils.js';
import { GlyphRasterizer } from './raster/glyphRasterizer.js';
import { ViewGpuContext } from './viewGpuContext.js';
import { GpuCharMetadata } from './raster/raster.js';
import { Color } from '../../../base/common/color.js';


const enum Constants {
	IndicesPerCell = 6,
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

type QueuedBufferEvent = (
	ViewConfigurationChangedEvent |
	ViewLinesDeletedEvent |
	ViewZonesChangedEvent
);

export class FullFileRenderStrategy extends ViewEventHandler implements IGpuRenderStrategy {

	readonly wgsl: string = fullFileRenderStrategyWgsl;

	private readonly _glyphRasterizer: MandatoryMutableDisposable<GlyphRasterizer>;

	private _cellBindBuffer!: GPUBuffer;

	/**
	 * The cell value buffers, these hold the cells and their glyphs. It's double buffers such that
	 * the thread doesn't block when one is being uploaded to the GPU.
	 */
	private _cellValueBuffers!: [ArrayBuffer, ArrayBuffer];
	private _activeDoubleBufferIndex: 0 | 1 = 0;

	private readonly _upToDateLines: [Set<number>, Set<number>] = [new Set(), new Set()];
	private _visibleObjectCount: number = 0;
	private _finalRenderedLine: number = 0;

	private _scrollOffsetBindBuffer: GPUBuffer;
	private _scrollOffsetValueBuffer: Float32Array;
	private _scrollInitialized: boolean = false;

	private readonly _queuedBufferUpdates: [QueuedBufferEvent[], QueuedBufferEvent[]] = [[], []];

	get bindGroupEntries(): GPUBindGroupEntry[] {
		return [
			{ binding: BindingId.Cells, resource: { buffer: this._cellBindBuffer } },
			{ binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
		];
	}

	constructor(
		private readonly _context: ViewContext,
		private readonly _viewGpuContext: ViewGpuContext,
		private readonly _device: GPUDevice,
	) {
		super();

		this._context.addEventHandler(this);

		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = this._context.configuration.options.get(EditorOption.fontSize);

		this._glyphRasterizer = this._register(new MandatoryMutableDisposable(new GlyphRasterizer(fontSize, fontFamily)));

		const bufferSize = this._viewGpuContext.maxGpuLines * this._viewGpuContext.maxGpuCols * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco full file cell buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;
		this._cellValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];

		const scrollOffsetBufferSize = 2;
		this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco scroll offset buffer',
			size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})).object;
		this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
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
		this._invalidateAllLines();
		this._queueBufferUpdate(e);

		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
		if (
			this._glyphRasterizer.value.fontFamily !== fontFamily ||
			this._glyphRasterizer.value.fontSize !== fontSize
		) {
			this._glyphRasterizer.value = new GlyphRasterizer(fontSize, fontFamily);
		}

		return true;
	}

	public override onDecorationsChanged(e: ViewDecorationsChangedEvent): boolean {
		// TODO: Don't clear all lines
		this._invalidateAllLines();
		return true;
	}

	public override onTokensChanged(e: ViewTokensChangedEvent): boolean {
		// TODO: This currently fires for the entire viewport whenever scrolling stops
		//       https://github.com/microsoft/vscode/issues/233942
		for (const range of e.ranges) {
			for (let i = range.fromLineNumber; i <= range.toLineNumber; i++) {
				this._upToDateLines[0].delete(i);
				this._upToDateLines[1].delete(i);
			}
		}
		return true;
	}

	public override onLinesDeleted(e: ViewLinesDeletedEvent): boolean {
		// TODO: This currently invalidates everything after the deleted line, it could shift the
		//       line data up to retain some up to date lines
		// TODO: This does not invalidate lines that are no longer in the file
		this._invalidateLinesFrom(e.fromLineNumber);

		// Queue updates that need to happen on the active buffer, not just the cache. This is
		// deferred since the active buffer could be locked by the GPU which would block the main
		// thread.
		this._queueBufferUpdate(e);

		return true;
	}

	public override onLinesInserted(e: ViewLinesInsertedEvent): boolean {
		// TODO: This currently invalidates everything after the deleted line, it could shift the
		//       line data up to retain some up to date lines
		this._invalidateLinesFrom(e.fromLineNumber);
		return true;
	}

	public override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		for (let i = e.fromLineNumber; i < e.fromLineNumber + e.count; i++) {
			this._upToDateLines[0].delete(i);
			this._upToDateLines[1].delete(i);
		}
		return true;
	}

	public override onScrollChanged(e?: ViewScrollChangedEvent): boolean {
		const dpr = getActiveWindow().devicePixelRatio;
		this._scrollOffsetValueBuffer[0] = (e?.scrollLeft ?? this._context.viewLayout.getCurrentScrollLeft()) * dpr;
		this._scrollOffsetValueBuffer[1] = (e?.scrollTop ?? this._context.viewLayout.getCurrentScrollTop()) * dpr;
		this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer);
		return true;
	}

	public override onZonesChanged(e: ViewZonesChangedEvent): boolean {
		this._invalidateAllLines();

		// Queue updates that need to happen on the active buffer, not just the cache. This is
		// deferred since the active buffer could be locked by the GPU which would block the main
		// thread.
		this._queueBufferUpdate(e);

		return true;
	}

	// #endregion

	private _invalidateAllLines(): void {
		this._upToDateLines[0].clear();
		this._upToDateLines[1].clear();
	}

	private _invalidateLinesFrom(lineNumber: number): void {
		for (const i of [0, 1]) {
			const upToDateLines = this._upToDateLines[i];
			for (const upToDateLine of upToDateLines) {
				if (upToDateLine >= lineNumber) {
					upToDateLines.delete(upToDateLine);
				}
			}
		}
	}

	reset() {
		for (const bufferIndex of [0, 1]) {
			// Zero out buffer and upload to GPU to prevent stale rows from rendering
			const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
			buffer.fill(0, 0, buffer.length);
			this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
			this._upToDateLines[bufferIndex].clear();
		}
		this._visibleObjectCount = 0;
	}

	update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number {
		// Pre-allocate variables to be shared within the loop - don't trust the JIT compiler to do
		// this optimization to avoid additional blocking time in garbage collector
		let chars = '';
		let y = 0;
		let x = 0;
		let absoluteOffsetX = 0;
		let absoluteOffsetY = 0;
		let xOffset = 0;
		let glyph: Readonly<ITextureAtlasPageGlyph>;
		let cellIndex = 0;

		let tokenStartIndex = 0;
		let tokenEndIndex = 0;
		let tokenMetadata = 0;

		let charMetadata = 0;

		let lineData: ViewLineRenderingData;
		let content: string = '';
		let fillStartIndex = 0;
		let fillEndIndex = 0;

		let tokens: IViewLineTokens;

		const dpr = getActiveWindow().devicePixelRatio;

		if (!this._scrollInitialized) {
			this.onScrollChanged();
			this._scrollInitialized = true;
		}

		// Update cell data
		const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
		const lineIndexCount = this._viewGpuContext.maxGpuCols * Constants.IndicesPerCell;

		const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
		let dirtyLineStart = Number.MAX_SAFE_INTEGER;
		let dirtyLineEnd = 0;

		// Handle any queued buffer updates
		const queuedBufferUpdates = this._queuedBufferUpdates[this._activeDoubleBufferIndex];
		while (queuedBufferUpdates.length) {
			const e = queuedBufferUpdates.shift()!;

			switch (e.type) {
				case ViewEventType.ViewConfigurationChanged: {
					// TODO: Refine the cases for when we throw away all the data
					cellBuffer.fill(0);

					dirtyLineStart = 1;
					dirtyLineEnd = this._finalRenderedLine;
					this._finalRenderedLine = 0;
					break;
				}
				case ViewEventType.ViewLinesDeleted: {
					// Shift content below deleted line up
					const deletedLineContentStartIndex = (e.fromLineNumber - 1) * this._viewGpuContext.maxGpuCols * Constants.IndicesPerCell;
					const deletedLineContentEndIndex = (e.toLineNumber) * this._viewGpuContext.maxGpuCols * Constants.IndicesPerCell;
					const nullContentStartIndex = (this._finalRenderedLine - (e.toLineNumber - e.fromLineNumber + 1)) * this._viewGpuContext.maxGpuCols * Constants.IndicesPerCell;
					cellBuffer.set(cellBuffer.subarray(deletedLineContentEndIndex), deletedLineContentStartIndex);

					// Zero out content on lines that are no longer valid
					cellBuffer.fill(0, nullContentStartIndex);

					// Update dirty lines and final rendered line
					dirtyLineStart = Math.min(dirtyLineStart, e.fromLineNumber);
					dirtyLineEnd = this._finalRenderedLine;
					this._finalRenderedLine -= e.toLineNumber - e.fromLineNumber + 1;
					break;
				}
				case ViewEventType.ViewZonesChanged: {
					// TODO: We could retain render data if we know what view zones changed and how
					// Zero out content on all lines
					cellBuffer.fill(0);

					dirtyLineStart = 1;
					dirtyLineEnd = this._finalRenderedLine;
					this._finalRenderedLine = 0;
					break;
				}
			}
		}

		const decorations = viewportData.getDecorationsInViewport();

		for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {

			// Only attempt to render lines that the GPU renderer can handle
			if (!ViewGpuContext.canRender(this._viewGpuContext.canvas.domNode, viewLineOptions, viewportData, y)) {
				fillStartIndex = ((y - 1) * this._viewGpuContext.maxGpuCols) * Constants.IndicesPerCell;
				fillEndIndex = (y * this._viewGpuContext.maxGpuCols) * Constants.IndicesPerCell;
				cellBuffer.fill(0, fillStartIndex, fillEndIndex);
				continue;
			}

			// Skip updating the line if it's already up to date
			if (upToDateLines.has(y)) {
				continue;
			}
			dirtyLineStart = Math.min(dirtyLineStart, y);
			dirtyLineEnd = Math.max(dirtyLineEnd, y);

			const inlineDecorations = decorations.filter(e => (
				e.range.startLineNumber <= y && e.range.endLineNumber >= y &&
				e.options.inlineClassName
			));

			lineData = viewportData.getViewLineRenderingData(y);
			content = lineData.content;
			xOffset = 0;

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
					// TODO: This needs to move to a dynamic long line rendering strategy
					if (x > this._viewGpuContext.maxGpuCols) {
						break;
					}
					chars = content.charAt(x);
					charMetadata = 0;

					// TODO: We'd want to optimize pulling the decorations in order
					// HACK: Temporary replace char to demonstrate inline decorations
					const cellDecorations = inlineDecorations.filter(decoration => {
						// TODO: Why does Range.containsPosition and Range.strictContainsPosition not work here?
						if (y < decoration.range.startLineNumber || y > decoration.range.endLineNumber) {
							return false;
						}
						if (y === decoration.range.startLineNumber && x < decoration.range.startColumn - 1) {
							return false;
						}
						if (y === decoration.range.endLineNumber && x >= decoration.range.endColumn - 1) {
							return false;
						}
						return true;
					});

					// Only lines containing fully supported inline decorations should have made it
					// this far.
					const inlineStyles: Map<string, string> = new Map();
					for (const decoration of cellDecorations) {
						if (!decoration.options.inlineClassName) {
							throw new BugIndicatingError('Unexpected inline decoration without class name');
						}
						const rules = ViewGpuContext.decorationCssRuleExtractor.getStyleRules(this._viewGpuContext.canvas.domNode, decoration.options.inlineClassName);
						for (const rule of rules) {
							for (const r of rule.style) {
								inlineStyles.set(r, rule.styleMap.get(r)?.toString() ?? '');
							}
						}
					}

					for (const [key, value] of inlineStyles.entries()) {
						switch (key) {
							case 'text-decoration-line': {
								charMetadata |= MetadataConsts.STRIKETHROUGH_MASK;
								break;
							}
							case 'text-decoration-thickness':
							case 'text-decoration-style':
							case 'text-decoration-color': {
								// HACK: Ignore for now to avoid throwing
								break;
							}
							case 'color': {
								// TODO: This parsing/error handling should move into canRender so fallback to DOM works
								const parsedColor = Color.Format.CSS.parse(value);
								if (!parsedColor) {
									throw new Error('Invalid color format ' + value);
								}
								const rgb = parsedColor.rgba.r << 16 | parsedColor.rgba.g << 8 | parsedColor.rgba.b;
								charMetadata |= ((rgb << GpuCharMetadata.FOREGROUND_OFFSET) & GpuCharMetadata.FOREGROUND_MASK) >>> 0;
								// TODO: _foreground_ opacity should not be applied to regular opacity
								if (parsedColor.rgba.a < 1) {
									charMetadata |= ((parsedColor.rgba.a * 0xFF << GpuCharMetadata.OPACITY_OFFSET) & GpuCharMetadata.OPACITY_MASK) >>> 0;
								}
								break;
							}
							default: throw new BugIndicatingError('Unexpected inline decoration style');
						}
					}

					if (chars === ' ' || chars === '\t') {
						// Zero out glyph to ensure it doesn't get rendered
						cellIndex = ((y - 1) * this._viewGpuContext.maxGpuCols + x) * Constants.IndicesPerCell;
						cellBuffer.fill(0, cellIndex, cellIndex + CellBufferInfo.FloatsPerEntry);
						// Adjust xOffset for tab stops
						if (chars === '\t') {
							xOffset = CursorColumns.nextRenderTabStop(x + xOffset, lineData.tabSize) - x - 1;
						}
						continue;
					}

					glyph = this._viewGpuContext.atlas.getGlyph(this._glyphRasterizer.value, chars, tokenMetadata, charMetadata);

					// TODO: Support non-standard character widths
					absoluteOffsetX = Math.round((x + xOffset) * viewLineOptions.spaceWidth * dpr);
					absoluteOffsetY = (
						Math.ceil((
							// Top of line including line height
							viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] +
							// Delta to top of line after line height
							Math.floor((viewportData.lineHeight - this._context.configuration.options.get(EditorOption.fontSize)) / 2)
						) * dpr)
					);

					cellIndex = ((y - 1) * this._viewGpuContext.maxGpuCols + x) * Constants.IndicesPerCell;
					cellBuffer[cellIndex + CellBufferInfo.Offset_X] = absoluteOffsetX;
					cellBuffer[cellIndex + CellBufferInfo.Offset_Y] = absoluteOffsetY;
					cellBuffer[cellIndex + CellBufferInfo.GlyphIndex] = glyph.glyphIndex;
					cellBuffer[cellIndex + CellBufferInfo.TextureIndex] = glyph.pageIndex;
				}

				tokenStartIndex = tokenEndIndex;
			}

			// Clear to end of line
			fillStartIndex = ((y - 1) * this._viewGpuContext.maxGpuCols + tokenEndIndex) * Constants.IndicesPerCell;
			fillEndIndex = (y * this._viewGpuContext.maxGpuCols) * Constants.IndicesPerCell;
			cellBuffer.fill(0, fillStartIndex, fillEndIndex);

			upToDateLines.add(y);
		}

		const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;

		// Only write when there is changed data
		if (dirtyLineStart <= dirtyLineEnd) {
			// Write buffer and swap it out to unblock writes
			this._device.queue.writeBuffer(
				this._cellBindBuffer,
				(dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
				cellBuffer.buffer,
				(dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
				(dirtyLineEnd - dirtyLineStart + 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT
			);
		}

		this._finalRenderedLine = Math.max(this._finalRenderedLine, dirtyLineEnd);

		this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;

		this._visibleObjectCount = visibleObjectCount;
		return visibleObjectCount;
	}

	draw(pass: GPURenderPassEncoder, viewportData: ViewportData): void {
		if (this._visibleObjectCount <= 0) {
			throw new BugIndicatingError('Attempt to draw 0 objects');
		}
		pass.draw(
			quadVertices.length / 2,
			this._visibleObjectCount,
			undefined,
			(viewportData.startLineNumber - 1) * this._viewGpuContext.maxGpuCols
		);
	}

	private _queueBufferUpdate(e: QueuedBufferEvent) {
		this._queuedBufferUpdates[0].push(e);
		this._queuedBufferUpdates[1].push(e);
	}
}
