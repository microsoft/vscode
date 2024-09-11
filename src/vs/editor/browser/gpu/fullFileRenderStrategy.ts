/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { EditorOption } from '../../common/config/editorOptions.js';
import type { IViewLineTokens } from '../../common/tokens/lineTokens.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewLineRenderingData } from '../../common/viewModel.js';
import type { ViewContext } from '../../common/viewModel/viewContext.js';
import type { ViewLineOptions } from '../viewParts/lines/viewLineOptions.js';
import type { ITextureAtlasPageGlyph } from './atlas/atlas.js';
import type { TextureAtlas } from './atlas/textureAtlas.js';
import { BindingId, type IGpuRenderStrategy } from './gpu.js';
import { GPULifecycle } from './gpuDisposable.js';
import { quadVertices } from './gpuUtils.js';
import { GlyphRasterizer } from './raster/glyphRasterizer.js';


const enum Constants {
	IndicesPerCell = 6,
}

const fullFileRenderStrategyWgsl = /*wgsl*/`
struct GlyphInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct Cell {
	position: vec2f,
	unused1: vec2f,
	glyphIndex: f32,
	textureIndex: f32
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position:   vec4f,
	@location(1)       layerIndex: f32,
	@location(0)       texcoord:   vec2f,
};

// Uniforms
@group(0) @binding(${BindingId.ViewportUniform})         var<uniform>       layoutInfo:      LayoutInfo;
@group(0) @binding(${BindingId.AtlasDimensionsUniform})  var<uniform>       atlasDims:       vec2f;
@group(0) @binding(${BindingId.ScrollOffset})            var<uniform>       scrollOffset:    ScrollOffset;

// Storage buffers
@group(0) @binding(${BindingId.GlyphInfo0})              var<storage, read> glyphInfo0:      array<GlyphInfo>;
@group(0) @binding(${BindingId.GlyphInfo1})              var<storage, read> glyphInfo1:      array<GlyphInfo>;
@group(0) @binding(${BindingId.Cells})                   var<storage, read> cells:           array<Cell>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let cell = cells[instanceIndex];
	// TODO: Is there a nicer way to init this?
	var glyph = glyphInfo0[0];
	let glyphIndex = u32(cell.glyphIndex);
	if (u32(cell.textureIndex) == 0) {
		glyph = glyphInfo0[glyphIndex];
	} else {
		glyph = glyphInfo1[glyphIndex];
	}

	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		(((vert.position * vec2f(2, -2)) / layoutInfo.canvasDims)) * glyph.size + cell.position + ((glyph.origin * vec2f(2, -2)) / layoutInfo.canvasDims) + (((scrollOffset.offset + layoutInfo.viewportOffset) * 2) / layoutInfo.canvasDims),
		0.0,
		1.0
	);

	vsOut.layerIndex = cell.textureIndex;
	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Glyph offset (0-1)
		(glyph.position / atlasDims) +
		// Glyph coordinate (0-1)
		(vsOut.texcoord * (glyph.size / atlasDims))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture})        var ourTexture: texture_2d_array<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord, u32(vsOut.layerIndex));
}
`;

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

export class FullFileRenderStrategy extends Disposable implements IGpuRenderStrategy {

	private static _lineCount = 3000;
	private static _columnCount = 200;

	readonly wgsl: string = fullFileRenderStrategyWgsl;

	private readonly _glyphRasterizer: GlyphRasterizer;

	private _cellBindBuffer!: GPUBuffer;

	/**
	 * The cell value buffers, these hold the cells and their glyphs. It's double buffers such that
	 * the thread doesn't block when one is being uploaded to the GPU.
	 */
	private _cellValueBuffers!: [ArrayBuffer, ArrayBuffer];
	private _activeDoubleBufferIndex: 0 | 1 = 0;

	private readonly _upToDateLines: [Set<number>, Set<number>] = [new Set(), new Set()];
	private _visibleObjectCount: number = 0;

	private _scrollOffsetBindBuffer!: GPUBuffer;
	private _scrollOffsetValueBuffers!: [Float32Array, Float32Array];

	get bindGroupEntries(): GPUBindGroupEntry[] {
		return [
			{ binding: BindingId.Cells, resource: { buffer: this._cellBindBuffer } },
			{ binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
		];
	}

	constructor(
		private readonly _context: ViewContext,
		private readonly _device: GPUDevice,
		private readonly _canvas: HTMLCanvasElement,
		private readonly _atlas: TextureAtlas,
	) {
		super();

		// TODO: Detect when lines have been tokenized and clear _upToDateLines
		const activeWindow = getActiveWindow();
		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = Math.ceil(this._context.configuration.options.get(EditorOption.fontSize) * activeWindow.devicePixelRatio);

		this._glyphRasterizer = this._register(new GlyphRasterizer(fontSize, fontFamily));

		const bufferSize = FullFileRenderStrategy._lineCount * FullFileRenderStrategy._columnCount * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
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
		this._scrollOffsetValueBuffers = [
			new Float32Array(scrollOffsetBufferSize),
			new Float32Array(scrollOffsetBufferSize),
		];
	}

	update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number {
		// Pre-allocate variables to be shared within the loop - don't trust the JIT compiler to do
		// this optimization to avoid additional blocking time in garbage collector
		let chars = '';
		let y = 0;
		let x = 0;
		let screenAbsoluteX = 0;
		let screenAbsoluteY = 0;
		let zeroToOneX = 0;
		let zeroToOneY = 0;
		let wgslX = 0;
		let wgslY = 0;
		let xOffset = 0;
		let glyph: Readonly<ITextureAtlasPageGlyph>;
		let cellIndex = 0;

		let tokenStartIndex = 0;
		let tokenEndIndex = 0;
		let tokenMetadata = 0;

		let lineData: ViewLineRenderingData;
		let content: string = '';
		let fillStartIndex = 0;
		let fillEndIndex = 0;

		let tokens: IViewLineTokens;

		const activeWindow = getActiveWindow();

		// Update scroll offset
		const scrollTop = this._context.viewLayout.getCurrentScrollTop() * activeWindow.devicePixelRatio;
		const scrollOffsetBuffer = this._scrollOffsetValueBuffers[this._activeDoubleBufferIndex];
		scrollOffsetBuffer[1] = scrollTop;
		this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, scrollOffsetBuffer);

		// Update cell data
		const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
		const lineIndexCount = FullFileRenderStrategy._columnCount * Constants.IndicesPerCell;

		const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
		let dirtyLineStart = Number.MAX_SAFE_INTEGER;
		let dirtyLineEnd = 0;

		for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
			// TODO: Update on dirty lines; is this known by line before rendering?
			// if (upToDateLines.has(y)) {
			// 	continue;
			// }
			dirtyLineStart = Math.min(dirtyLineStart, y);
			dirtyLineEnd = Math.max(dirtyLineEnd, y);

			lineData = viewportData.getViewLineRenderingData(y);
			content = lineData.content;
			xOffset = 0;

			// See ViewLine#renderLine
			// const renderLineInput = new RenderLineInput(
			// 	options.useMonospaceOptimizations,
			// 	options.canUseHalfwidthRightwardsArrow,
			// 	lineData.content,
			// 	lineData.continuesWithWrappedLine,
			// 	lineData.isBasicASCII,
			// 	lineData.containsRTL,
			// 	lineData.minColumn - 1,
			// 	lineData.tokens,
			// 	actualInlineDecorations,
			// 	lineData.tabSize,
			// 	lineData.startVisibleColumn,
			// 	options.spaceWidth,
			// 	options.middotWidth,
			// 	options.wsmiddotWidth,
			// 	options.stopRenderingLineAfter,
			// 	options.renderWhitespace,
			// 	options.renderControlCharacters,
			// 	options.fontLigatures !== EditorFontLigatures.OFF,
			// 	selectionsOnLine
			// );

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

				// console.log(`token: start=${tokenStartIndex}, end=${tokenEndIndex}, fg=${colorMap[tokenFg]}`);


				for (x = tokenStartIndex; x < tokenEndIndex; x++) {
					// HACK: Prevent rendering past the end of the render buffer
					// TODO: This needs to move to a dynamic long line rendering strategy
					if (x > FullFileRenderStrategy._columnCount) {
						break;
					}
					chars = content.charAt(x);
					if (chars === ' ') {
						continue;
					}
					if (chars === '\t') {
						// TODO: Pull actual tab size
						xOffset += 3;
						continue;
					}

					glyph = this._atlas.getGlyph(this._glyphRasterizer, chars, tokenMetadata);

					// TODO: Support non-standard character widths
					screenAbsoluteX = Math.round((x + xOffset) * viewLineOptions.spaceWidth * activeWindow.devicePixelRatio);
					screenAbsoluteY = (
						Math.ceil((
							// Top of line including line height
							viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] +
							// Delta to top of line after line height
							Math.floor((viewportData.lineHeight - this._context.configuration.options.get(EditorOption.fontSize)) / 2)
						) * activeWindow.devicePixelRatio)
					);
					zeroToOneX = screenAbsoluteX / this._canvas.width;
					zeroToOneY = screenAbsoluteY / this._canvas.height;
					wgslX = zeroToOneX * 2 - 1;
					wgslY = zeroToOneY * 2 - 1;

					cellIndex = ((y - 1) * FullFileRenderStrategy._columnCount + (x + xOffset)) * Constants.IndicesPerCell;
					cellBuffer[cellIndex + CellBufferInfo.Offset_X] = wgslX;
					cellBuffer[cellIndex + CellBufferInfo.Offset_Y] = -wgslY;
					cellBuffer[cellIndex + CellBufferInfo.GlyphIndex] = glyph.glyphIndex;
					cellBuffer[cellIndex + CellBufferInfo.TextureIndex] = glyph.pageIndex;
				}

				tokenStartIndex = tokenEndIndex;
			}

			// Clear to end of line
			fillStartIndex = ((y - 1) * FullFileRenderStrategy._columnCount + (tokenEndIndex + xOffset)) * Constants.IndicesPerCell;
			fillEndIndex = (y * FullFileRenderStrategy._columnCount) * Constants.IndicesPerCell;
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
			(viewportData.startLineNumber - 1) * FullFileRenderStrategy._columnCount
		);
	}
}
