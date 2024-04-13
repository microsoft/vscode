/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveDocument, getActiveWindow } from 'vs/base/browser/dom';
import { debounce } from 'vs/base/common/decorators';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { TextureAtlas, type ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/textureAtlas';
import type { IVisibleLine, IVisibleLinesHost } from 'vs/editor/browser/view/viewLayer';
import type { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import type { ViewLineRenderingData } from 'vs/editor/common/viewModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';

interface IRendererContext<T extends IVisibleLine> {
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
}

const enum Constants {
	IndicesPerCell = 6
}

const enum SpriteInfoStorageBufferInfo {
	Size = 2 + 2 + 2,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
	Offset_OriginPosition = 4,
}
const spriteInfoStorageBufferByteSize = SpriteInfoStorageBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT;

const enum BindingId {
	// TODO: Improve names
	SpriteInfo = 0,
	DynamicUnitInfo = 1,
	TextureSampler = 2,
	Texture = 3,
	Uniforms = 4,
	TextureInfoUniform = 5,
	ScrollOffset = 6,
}

export class GpuViewLayerRenderer<T extends IVisibleLine> {

	readonly domNode: HTMLCanvasElement;
	host: IVisibleLinesHost<T>;
	viewportData: ViewportData;

	private readonly _gpuCtx!: GPUCanvasContext;

	private _adapter!: GPUAdapter;
	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;


	private _vertexBuffer!: GPUBuffer;
	private _squareVertices!: { vertexData: Float32Array; numVertices: number };

	private static _textureAtlas: TextureAtlas;
	private _spriteInfoStorageBuffer!: GPUBuffer;
	private _textureAtlasGpuTexture!: GPUTexture;

	private _initialized = false;



	private static _testCanvas: HTMLCanvasElement;
	private static _testCtx: CanvasRenderingContext2D;

	private _renderStrategy!: IRenderStrategy<T>;


	constructor(
		domNode: HTMLCanvasElement,
		host: IVisibleLinesHost<T>,
		viewportData: ViewportData,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		this.domNode = domNode;
		this.host = host;
		this.viewportData = viewportData;

		this._gpuCtx = this.domNode.getContext('webgpu')!;
		this.initWebgpu();
	}

	async initWebgpu() {
		if (!navigator.gpu) {
			throw new Error('this browser does not support WebGPU');
		}

		this._adapter = (await navigator.gpu.requestAdapter())!;
		if (!this._adapter) {
			throw new Error('this browser supports webgpu but it appears disabled');
		}

		this._device = await this._adapter.requestDevice();

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this._gpuCtx.configure({
			device: this._device,
			format: presentationFormat,
		});


		// Create texture atlas
		if (!GpuViewLayerRenderer._textureAtlas) {
			GpuViewLayerRenderer._textureAtlas = this._instantiationService.createInstance(TextureAtlas, this.domNode, this._device.limits.maxTextureDimension2D);

			GpuViewLayerRenderer._testCanvas = document.createElement('canvas');
			GpuViewLayerRenderer._testCanvas.width = this._device.limits.maxTextureDimension2D;
			GpuViewLayerRenderer._testCanvas.height = this._device.limits.maxTextureDimension2D;
			GpuViewLayerRenderer._testCanvas.style.width = `${this._device.limits.maxTextureDimension2D / getActiveWindow().devicePixelRatio}px`;
			GpuViewLayerRenderer._testCanvas.style.height = `${this._device.limits.maxTextureDimension2D / getActiveWindow().devicePixelRatio}px`;
			GpuViewLayerRenderer._testCanvas.style.position = 'absolute';
			GpuViewLayerRenderer._testCanvas.style.top = '2px';
			GpuViewLayerRenderer._testCanvas.style.left = '2px';
			GpuViewLayerRenderer._testCanvas.style.zIndex = '10000';
			GpuViewLayerRenderer._testCanvas.style.pointerEvents = 'none';
			GpuViewLayerRenderer._testCtx = ensureNonNullable(GpuViewLayerRenderer._testCanvas.getContext('2d'));
			getActiveDocument().body.appendChild(GpuViewLayerRenderer._testCanvas);
		}
		const textureAtlas = GpuViewLayerRenderer._textureAtlas;


		// this._renderStrategy = new NaiveViewportRenderStrategy(this._device, this.domNode, this.viewportData, GpuViewLayerRenderer._textureAtlas);
		this._renderStrategy = this._instantiationService.createInstance(FullFileRenderStrategy, this._device, this.domNode, this.viewportData, GpuViewLayerRenderer._textureAtlas);

		const module = this._device.createShaderModule({
			label: 'ViewLayer shader module',
			code: this._renderStrategy.wgsl,
		});

		this._pipeline = this._device.createRenderPipeline({
			label: 'ViewLayer render pipeline',
			layout: 'auto',
			vertex: {
				module,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats, 4 bytes each
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
						],
					}
				]
			},
			fragment: {
				module,
				entryPoint: 'fs',
				targets: [
					{
						format: presentationFormat,
						blend: {
							color: {
								srcFactor: 'src-alpha',
								dstFactor: 'one-minus-src-alpha'
							},
							alpha: {
								srcFactor: 'src-alpha',
								dstFactor: 'one-minus-src-alpha'
							},
						},
					}
				],
			},
		});



		// Write standard uniforms
		const enum UniformBufferInfo {
			Size = 2, // 2x 32 bit floats
			OffsetCanvasWidth = 0,
			OffsetCanvasHeight = 1
		}
		const uniformBuffer = this._device.createBuffer({
			size: UniformBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(UniformBufferInfo.Size);
			// TODO: Update on canvas resize
			uniformValues[UniformBufferInfo.OffsetCanvasWidth] = this.domNode.width;
			uniformValues[UniformBufferInfo.OffsetCanvasHeight] = this.domNode.height;
			this._device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
		}



		const enum TextureInfoUniformBufferInfo {
			Size = 2,
			SpriteSheetSize = 0,
		}
		const textureInfoUniformBufferSize = TextureInfoUniformBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT;
		const textureInfoUniformBuffer = this._device.createBuffer({
			size: textureInfoUniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(TextureInfoUniformBufferInfo.Size);
			// TODO: Update on canvas resize
			uniformValues[TextureInfoUniformBufferInfo.SpriteSheetSize] = textureAtlas.source.width;
			uniformValues[TextureInfoUniformBufferInfo.SpriteSheetSize + 1] = textureAtlas.source.height;
			this._device.queue.writeBuffer(textureInfoUniformBuffer, 0, uniformValues);
		}


		const maxRenderedObjects = 10000;

		///////////////////
		// Static buffer //
		///////////////////
		this._spriteInfoStorageBuffer = this._device.createBuffer({
			label: 'Entity static info buffer',
			size: spriteInfoStorageBufferByteSize * maxRenderedObjects,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});

		// Upload texture bitmap from atlas
		this._textureAtlasGpuTexture = this._device.createTexture({
			format: 'rgba8unorm',
			size: { width: textureAtlas.source.width, height: textureAtlas.source.height },
			usage: GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});


		this._updateTextureAtlas();



		this._renderStrategy.initBuffers();

		this._updateSquareVertices();



		const sampler = this._device.createSampler({
			magFilter: 'nearest',
			minFilter: 'nearest',
		});
		this._bindGroup = this._device.createBindGroup({
			label: 'ViewLayer bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: BindingId.SpriteInfo, resource: { buffer: this._spriteInfoStorageBuffer } },
				{ binding: BindingId.TextureSampler, resource: sampler },
				{ binding: BindingId.Texture, resource: this._textureAtlasGpuTexture.createView() },
				{ binding: BindingId.Uniforms, resource: { buffer: uniformBuffer } },
				{ binding: BindingId.TextureInfoUniform, resource: { buffer: textureInfoUniformBuffer } },
				...this._renderStrategy.bindGroupEntries
			],
		});

		this._renderPassDescriptor = {
			label: 'ViewLayer render pass',
			colorAttachments: [
				(
					{
						// view: <- to be filled out when we render
						loadValue: [0, 0, 0, 0],
						loadOp: 'load',
						storeOp: 'store',
					} as Omit<GPURenderPassColorAttachment, 'view'>
				) as any as GPURenderPassColorAttachment,
			] as any as Iterable<GPURenderPassColorAttachment>,
		};


		this._initialized = true;
	}

	private _updateSquareVertices() {
		this._squareVertices = {
			vertexData: new Float32Array([
				1, 0,
				1, 1,
				0, 1,
				0, 0,
				0, 1,
				1, 0,
			]),
			numVertices: 6
		};
		const { vertexData } = this._squareVertices;

		this._vertexBuffer = this._device.createBuffer({
			label: 'vertex buffer vertices',
			size: vertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this._device.queue.writeBuffer(this._vertexBuffer, 0, vertexData);
	}

	update(viewportData: ViewportData) {
		this.viewportData = viewportData;
	}

	private _updateTextureAtlas() {
		if (!GpuViewLayerRenderer._textureAtlas.hasChanges) {
			return;
		}
		GpuViewLayerRenderer._textureAtlas.hasChanges = false;
		// TODO: Dynamically set buffer size
		const bufferSize = spriteInfoStorageBufferByteSize * 10000;
		const values = new Float32Array(bufferSize / 4);
		let entryOffset = 0;
		for (const glyph of GpuViewLayerRenderer._textureAtlas.glyphs) {
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition] = glyph.x;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition + 1] = glyph.y;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize] = glyph.w;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize + 1] = glyph.h;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_OriginPosition] = glyph.originOffsetX;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_OriginPosition + 1] = glyph.originOffsetY;
			entryOffset += SpriteInfoStorageBufferInfo.Size;
		}
		this._device.queue.writeBuffer(this._spriteInfoStorageBuffer, 0, values);

		this._device.queue.copyExternalImageToTexture(
			{ source: GpuViewLayerRenderer._textureAtlas.source },
			{ texture: this._textureAtlasGpuTexture },
			{ width: GpuViewLayerRenderer._textureAtlas.source.width, height: GpuViewLayerRenderer._textureAtlas.source.height },
		);


		GpuViewLayerRenderer._drawToTextureAtlas();
	}

	@debounce(500)
	private static _drawToTextureAtlas() {
		GpuViewLayerRenderer._testCtx.clearRect(0, 0, GpuViewLayerRenderer._textureAtlas.source.width, GpuViewLayerRenderer._textureAtlas.source.height);
		GpuViewLayerRenderer._testCtx.drawImage(GpuViewLayerRenderer._textureAtlas.source, 0, 0);
	}

	public render(inContext: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {
		const ctx: IRendererContext<T> = {
			rendLineNumberStart: inContext.rendLineNumberStart,
			lines: inContext.lines.slice(0),
			linesLength: inContext.linesLength
		};

		if (!this._initialized) {
			return ctx;
		}
		return this._render(ctx, startLineNumber, stopLineNumber, deltaTop);
	}

	private _render(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {
		const visibleObjectCount = this._renderStrategy.update(ctx, startLineNumber, stopLineNumber, deltaTop);

		// TODO: Only do this when needed
		this._updateTextureAtlas();

		const encoder = this._device.createCommandEncoder();

		(this._renderPassDescriptor.colorAttachments as any)[0].view = this._gpuCtx.getCurrentTexture().createView();
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);

		pass.setBindGroup(0, this._bindGroup);
		// TODO: Draws could be split by chunk, this would help minimize moving data around in arrays

		if (this._renderStrategy?.draw) {
			this._renderStrategy.draw(pass, ctx, startLineNumber, stopLineNumber, deltaTop);
		} else {
			pass.draw(this._squareVertices.numVertices, visibleObjectCount);
		}

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);

		return ctx;
	}
}


interface IRenderStrategy<T extends IVisibleLine> {
	readonly wgsl: string;
	readonly bindGroupEntries: GPUBindGroupEntry[];

	initBuffers(): void;
	update(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): number;
	draw?(pass: GPURenderPassEncoder, ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): void;
}

// #region Full file render strategy

const fullFileRenderStrategyWgsl = `
struct Uniforms {
	canvasDimensions: vec2f,
};

struct TextureInfoUniform {
	spriteSheetSize: vec2f,
}

struct SpriteInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct DynamicUnitInfo {
	position: vec2f,
	unused1: vec2f,
	textureIndex: f32,
	unused2: f32
};

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(0) texcoord: vec2f,
};

@group(0) @binding(${BindingId.Uniforms}) var<uniform> uniforms: Uniforms;
@group(0) @binding(${BindingId.TextureInfoUniform}) var<uniform> textureInfoUniform: TextureInfoUniform;

@group(0) @binding(${BindingId.SpriteInfo}) var<storage, read> spriteInfo: array<SpriteInfo>;
@group(0) @binding(${BindingId.DynamicUnitInfo}) var<storage, read> dynamicUnitInfoStructs: array<DynamicUnitInfo>;
@group(0) @binding(${BindingId.ScrollOffset}) var<uniform> scrollOffset: ScrollOffset;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let dynamicUnitInfo = dynamicUnitInfoStructs[instanceIndex];
	let spriteInfo = spriteInfo[u32(dynamicUnitInfo.textureIndex)];

	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		(((vert.position * vec2f(2, -2)) / uniforms.canvasDimensions)) * spriteInfo.size + dynamicUnitInfo.position + ((spriteInfo.origin * vec2f(2, -2)) / uniforms.canvasDimensions) + ((scrollOffset.offset * 2) / uniforms.canvasDimensions),
		0.0,
		1.0
	);

	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Sprite offset (0-1)
		(spriteInfo.position / textureInfoUniform.spriteSheetSize) +
		// Sprite coordinate (0-1)
		(vsOut.texcoord * (spriteInfo.size / textureInfoUniform.spriteSheetSize))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture}) var ourTexture: texture_2d<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord);
}
`;

class FullFileRenderStrategy<T extends IVisibleLine> implements IRenderStrategy<T> {

	private static _lineCount = 3000;
	private static _columnCount = 200;

	readonly wgsl: string = fullFileRenderStrategyWgsl;

	private _cellBindBuffer!: GPUBuffer;
	private _cellValueBuffers!: [ArrayBuffer, ArrayBuffer];
	private _activeDoubleBufferIndex: 0 | 1 = 0;

	private readonly _upToDateLines: [Set<number>, Set<number>] = [new Set(), new Set()];

	private _scrollOffsetBindBuffer!: GPUBuffer;
	private _scrollOffsetValueBuffers!: [Float32Array, Float32Array];

	get bindGroupEntries(): GPUBindGroupEntry[] {
		return [
			{ binding: BindingId.DynamicUnitInfo, resource: { buffer: this._cellBindBuffer } },
			{ binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
		];
	}

	constructor(
		private readonly _device: GPUDevice,
		private readonly _canvas: HTMLCanvasElement,
		private readonly _viewportData: ViewportData,
		private readonly _textureAtlas: TextureAtlas,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		// TODO: Detect when lines have been tokenized and clear _upToDateLines
		const colorMap = this._themeService.getColorTheme().tokenColorMap;
		console.log('colorMap', colorMap);
	}

	initBuffers(): void {
		const bufferSize = FullFileRenderStrategy._lineCount * FullFileRenderStrategy._columnCount * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._cellBindBuffer = this._device.createBuffer({
			label: 'Full file cell buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._cellValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];

		const scrollOffsetBufferSize = 2;
		this._scrollOffsetBindBuffer = this._device.createBuffer({
			label: 'Scroll offset buffer',
			size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this._scrollOffsetValueBuffers = [
			new Float32Array(scrollOffsetBufferSize),
			new Float32Array(scrollOffsetBufferSize),
		];
	}

	update(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): number {
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
		let glyph: ITextureAtlasGlyph;
		let cellIndex = 0;
		let tokenStartIndex = 0;
		let tokenEndIndex = 0;
		let tokenFg = 0;
		let lineData: ViewLineRenderingData;
		let content: string = '';
		let fillStartIndex = 0;
		let fillEndIndex = 0;

		let tokens: IViewLineTokens;

		const activeWindow = getActiveWindow();

		// Update scroll offset
		// TODO: Get at ViewModel in a safe way
		const scrollTop = (this._viewportData as any)._model.viewLayout.getCurrentScrollTop() * activeWindow.devicePixelRatio;
		const scrollOffsetBuffer = this._scrollOffsetValueBuffers[this._activeDoubleBufferIndex];
		scrollOffsetBuffer[1] = scrollTop;
		this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, scrollOffsetBuffer);

		// Update cell data
		const viewportData = this._viewportData;
		const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
		const lineIndexCount = FullFileRenderStrategy._columnCount * Constants.IndicesPerCell;

		const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
		let dirtyLineStart = Number.MAX_SAFE_INTEGER;
		let dirtyLineEnd = 0;

		// const theme = this._themeService.getColorTheme() as ColorThemeData;
		// const tokenStyle = theme.getTokenStyleMetadata(type, modifiers, defaultLanguage, true, definitions);

		for (y = startLineNumber; y <= stopLineNumber; y++) {
			// TODO: Update on dirty lines; is this known by line before rendering?
			// if (upToDateLines.has(y)) {
			// 	continue;
			// }
			dirtyLineStart = Math.min(dirtyLineStart, y);
			dirtyLineEnd = Math.max(dirtyLineEnd, y);

			lineData = viewportData.getViewLineRenderingData(y);
			content = lineData.content;
			xOffset = 0;

			// TODO: Handle colors via viewLineRenderingData.tokens
			// console.log(lineData.tokens);
			// console.log('fg');
			// for (let i = 0; i < lineData.tokens.getCount(); i++) {
			// 	console.log(`  ${lineData.tokens.getForeground(i)}`);
			// }

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
				tokenFg = tokens.getForeground(tokenIndex);
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

					glyph = this._textureAtlas.getGlyph(chars, tokenFg);

					screenAbsoluteX = Math.round((x + xOffset) * 7 * activeWindow.devicePixelRatio);
					screenAbsoluteY = Math.round(deltaTop[y - startLineNumber] * activeWindow.devicePixelRatio);
					zeroToOneX = screenAbsoluteX / this._canvas.width;
					zeroToOneY = screenAbsoluteY / this._canvas.height;
					wgslX = zeroToOneX * 2 - 1;
					wgslY = zeroToOneY * 2 - 1;

					cellIndex = ((y - 1) * FullFileRenderStrategy._columnCount + (x + xOffset)) * Constants.IndicesPerCell;
					cellBuffer[cellIndex + 0] = wgslX;       // x
					cellBuffer[cellIndex + 1] = -wgslY;      // y
					cellBuffer[cellIndex + 2] = 0;
					cellBuffer[cellIndex + 3] = 0;
					cellBuffer[cellIndex + 4] = glyph.index; // textureIndex
					cellBuffer[cellIndex + 5] = 0;
				}

				tokenStartIndex = tokenEndIndex;
			}

			// Clear to end of line
			fillStartIndex = ((y - 1) * FullFileRenderStrategy._columnCount + (tokenEndIndex + xOffset)) * Constants.IndicesPerCell;
			fillEndIndex = (y * FullFileRenderStrategy._columnCount) * Constants.IndicesPerCell;
			cellBuffer.fill(0, fillStartIndex, fillEndIndex);

			upToDateLines.add(y);
		}

		const visibleObjectCount = (stopLineNumber - startLineNumber + 1) * lineIndexCount;

		// Only write when there is changed data
		if (dirtyLineStart <= dirtyLineEnd) {
			// Write buffer and swap it out to unblock writes
			this._device.queue.writeBuffer(
				this._cellBindBuffer,
				(dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
				// TODO: this cell buffer actually only needs to be the size of the viewport if we are only uploading a range
				//       at the maximum each frame
				cellBuffer.buffer,
				(dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
				(dirtyLineEnd - dirtyLineStart + 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT
			);
		}
		// HACK: Replace entire buffer for testing purposes
		// this._device.queue.writeBuffer(
		// 	this._cellBindBuffer,
		// 	0,
		// 	cellBuffer
		// );

		this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;

		return visibleObjectCount;
	}

	draw(pass: GPURenderPassEncoder, ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): void {
		const visibleObjectCount = (stopLineNumber - startLineNumber + 1) * FullFileRenderStrategy._columnCount * Constants.IndicesPerCell;

		if (visibleObjectCount <= 0) {
			console.error('Attempt to draw 0 objects');
		} else {
			pass.draw(
				6, // square verticies
				visibleObjectCount,
				undefined,
				(startLineNumber - 1) * FullFileRenderStrategy._columnCount
			);
		}
	}
}

// #endregion Full file render strategy
