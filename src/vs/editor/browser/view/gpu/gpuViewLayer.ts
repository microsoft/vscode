/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { VSBuffer } from 'vs/base/common/buffer';
import { debounce } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import type { ITextureAtlasGlyph } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/atlas/textureAtlas';
import { ensureNonNullable, observeDevicePixelDimensions } from 'vs/editor/browser/view/gpu/gpuUtils';
import { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
import type { IVisibleLine, IVisibleLinesHost } from 'vs/editor/browser/view/viewLayer';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import type { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import type { ViewLineRenderingData } from 'vs/editor/common/viewModel';
import type { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export const disableNonGpuRendering = true;

interface IRendererContext<T extends IVisibleLine> {
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
}

const enum Constants {
	IndicesPerCell = 6,

	MaxAtlasPageGlyphCount = 10_000,
}

const enum GlyphStorageBufferInfo {
	FloatsPerEntry = 2 + 2 + 2,
	BytesPerEntry = GlyphStorageBufferInfo.FloatsPerEntry * 4,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
	Offset_OriginPosition = 4,
}

const enum BindingId {
	GlyphInfo0,
	GlyphInfo1,
	Cells,
	TextureSampler,
	Texture,
	Uniforms,
	AtlasDimensionsUniform,
	ScrollOffset,
}

export class GpuViewLayerRenderer<T extends IVisibleLine> {

	readonly domNode: HTMLCanvasElement;
	host: IVisibleLinesHost<T>;
	viewportData: ViewportData;

	private readonly _gpuCtx!: GPUCanvasContext;

	private _adapter!: GPUAdapter;
	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;
	private _squareVertices!: { vertexData: Float32Array; numVertices: number };

	private static _atlas: TextureAtlas;

	private readonly _glyphStorageBuffer: GPUBuffer[] = [];
	private _atlasGpuTexture!: GPUTexture;
	private readonly _atlasGpuTextureVersions: number[] = [];

	private _initialized = false;

	private _renderStrategy!: IRenderStrategy<T>;

	constructor(
		domNode: HTMLCanvasElement,
		private readonly _context: ViewContext,
		host: IVisibleLinesHost<T>,
		viewportData: ViewportData,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		this.domNode = domNode;
		this.host = host;
		this.viewportData = viewportData;

		this._gpuCtx = ensureNonNullable(this.domNode.getContext('webgpu'));
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
			alphaMode: 'premultiplied',
		});


		// Create texture atlas
		if (!GpuViewLayerRenderer._atlas) {
			GpuViewLayerRenderer._atlas = this._instantiationService.createInstance(TextureAtlas, this._device.limits.maxTextureDimension2D);
		}
		const atlas = GpuViewLayerRenderer._atlas;


		this._renderStrategy = this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._device, this.domNode, this.viewportData, GpuViewLayerRenderer._atlas);

		const module = this._device.createShaderModule({
			label: 'Monaco shader module',
			code: this._renderStrategy.wgsl,
		});

		this._pipeline = this._device.createRenderPipeline({
			label: 'Monaco render pipeline',
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
			FloatsPerEntry = 2,
			BytesPerEntry = UniformBufferInfo.FloatsPerEntry * 4,
			Offset_CanvasWidth = 0,
			Offset_CanvasHeight = 1
		}
		const uniformBuffer = this._device.createBuffer({
			label: 'Monaco uniform buffer',
			size: UniformBufferInfo.BytesPerEntry,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(UniformBufferInfo.FloatsPerEntry);
			// TODO: Update on canvas resize
			uniformValues[UniformBufferInfo.Offset_CanvasWidth] = this.domNode.width;
			uniformValues[UniformBufferInfo.Offset_CanvasHeight] = this.domNode.height;
			this._device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

			// TODO: Track disposable
			observeDevicePixelDimensions(this.domNode, getActiveWindow(), (w, h) => {
				this.domNode.width = w;
				this.domNode.height = h;
				uniformValues[UniformBufferInfo.Offset_CanvasWidth] = this.domNode.width;
				uniformValues[UniformBufferInfo.Offset_CanvasHeight] = this.domNode.height;
				this._device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
				// TODO: Request render
			});
		}



		const enum AtlasInfoUniformBufferInfo {
			FloatsPerEntry = 2,
			BytesPerEntry = AtlasInfoUniformBufferInfo.FloatsPerEntry * 4,
			Offset_Width = 0,
			Offset_Height = 1,
		}
		const atlasInfoUniformBuffer = this._device.createBuffer({
			label: 'Monaco atlas info uniform buffer',
			size: AtlasInfoUniformBufferInfo.BytesPerEntry,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(AtlasInfoUniformBufferInfo.FloatsPerEntry);
			uniformValues[AtlasInfoUniformBufferInfo.Offset_Width] = atlas.pageSize;
			uniformValues[AtlasInfoUniformBufferInfo.Offset_Height] = atlas.pageSize;
			this._device.queue.writeBuffer(atlasInfoUniformBuffer, 0, uniformValues);
		}


		///////////////////
		// Static buffer //
		///////////////////
		this._glyphStorageBuffer[0] = this._device.createBuffer({
			label: 'Monaco glyph storage buffer',
			size: GlyphStorageBufferInfo.BytesPerEntry * Constants.MaxAtlasPageGlyphCount,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._glyphStorageBuffer[1] = this._device.createBuffer({
			label: 'Monaco glyph storage buffer',
			size: GlyphStorageBufferInfo.BytesPerEntry * Constants.MaxAtlasPageGlyphCount,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._atlasGpuTextureVersions[0] = 0;
		this._atlasGpuTextureVersions[1] = 0;
		this._atlasGpuTexture = this._device.createTexture({
			label: 'Monaco atlas texture',
			format: 'rgba8unorm',
			// TODO: Dynamically grow/shrink layer count
			size: { width: atlas.pageSize, height: atlas.pageSize, depthOrArrayLayers: 2 },
			dimension: '2d',
			usage: GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});


		this._updateAtlas();



		this._renderStrategy.initBuffers();

		this._updateSquareVertices();



		const sampler = this._device.createSampler({
			label: 'Monaco atlas sampler',
			magFilter: 'nearest',
			minFilter: 'nearest',
		});
		this._bindGroup = this._device.createBindGroup({
			label: 'Monaco bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				// TODO: Pass in generically as array?
				{ binding: BindingId.GlyphInfo0, resource: { buffer: this._glyphStorageBuffer[0] } },
				{ binding: BindingId.GlyphInfo1, resource: { buffer: this._glyphStorageBuffer[1] } },
				{ binding: BindingId.TextureSampler, resource: sampler },
				{ binding: BindingId.Texture, resource: this._atlasGpuTexture.createView() },
				{ binding: BindingId.Uniforms, resource: { buffer: uniformBuffer } },
				{ binding: BindingId.AtlasDimensionsUniform, resource: { buffer: atlasInfoUniformBuffer } },
				...this._renderStrategy.bindGroupEntries
			],
		});

		this._renderPassColorAttachment = {
			view: null!, // Will be filled at render time
			loadOp: 'load',
			storeOp: 'store',
		};
		this._renderPassDescriptor = {
			label: 'Monaco render pass',
			colorAttachments: [this._renderPassColorAttachment],
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
			label: 'Monaco quad vertex buffer',
			size: vertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this._device.queue.writeBuffer(this._vertexBuffer, 0, vertexData);
	}

	update(viewportData: ViewportData) {
		this.viewportData = viewportData;
	}

	private _updateAtlas() {
		const atlas = GpuViewLayerRenderer._atlas;

		for (const [layerIndex, page] of atlas.pages.entries()) {
			// Skip the update if it's already the latest version
			if (page.version === this._atlasGpuTextureVersions[layerIndex]) {
				continue;
			}

			// TODO: Dynamically set buffer size
			const bufferSize = GlyphStorageBufferInfo.FloatsPerEntry * Constants.MaxAtlasPageGlyphCount;
			const values = new Float32Array(bufferSize / 4);
			let entryOffset = 0;
			for (const glyph of page.glyphs) {
				values[entryOffset + GlyphStorageBufferInfo.Offset_TexturePosition] = glyph.x;
				values[entryOffset + GlyphStorageBufferInfo.Offset_TexturePosition + 1] = glyph.y;
				values[entryOffset + GlyphStorageBufferInfo.Offset_TextureSize] = glyph.w;
				values[entryOffset + GlyphStorageBufferInfo.Offset_TextureSize + 1] = glyph.h;
				values[entryOffset + GlyphStorageBufferInfo.Offset_OriginPosition] = glyph.originOffsetX;
				values[entryOffset + GlyphStorageBufferInfo.Offset_OriginPosition + 1] = glyph.originOffsetY;
				entryOffset += GlyphStorageBufferInfo.FloatsPerEntry;
			}
			this._device.queue.writeBuffer(this._glyphStorageBuffer[layerIndex], 0, values);
			this._device.queue.copyExternalImageToTexture(
				{ source: page.source },
				{
					texture: this._atlasGpuTexture,
					origin: {
						x: page.usedArea.left,
						y: page.usedArea.top,
						z: layerIndex
					}
				},
				{
					width: page.usedArea.right - page.usedArea.left,
					height: page.usedArea.bottom - page.usedArea.top
				},
			);
			this._atlasGpuTextureVersions[layerIndex] = page.version;
		}

		GpuViewLayerRenderer._drawToAtlas(this._fileService, this._workspaceContextService);
	}

	@debounce(500)
	private static async _drawToAtlas(fileService: IFileService, workspaceContextService: IWorkspaceContextService) {
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const atlas = GpuViewLayerRenderer._atlas;
			const promises = [];
			for (const [layerIndex, page] of atlas.pages.entries()) {
				promises.push(...[
					fileService.writeFile(
						URI.joinPath(folders[0].uri, `atlasPage${layerIndex}_usage.png`),
						VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))
					),
					fileService.writeFile(
						URI.joinPath(folders[0].uri, `atlasPage${layerIndex}_actual.png`),
						VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))
					),
				]);
			}
			await promises;
		}
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

		this._updateAtlas();

		const encoder = this._device.createCommandEncoder({ label: 'Monaco command encoder' });

		this._renderPassColorAttachment.view = this._gpuCtx.getCurrentTexture().createView({ label: 'Monaco canvas texture view' });
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

struct AtlasDimensionsUniform {
	size: vec2f,
}

struct GlyphInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct Cells {
	position: vec2f,
	unused1: vec2f,
	glyphIndex: f32,
	textureIndex: f32
};

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position:   vec4f,
	@location(1)       layerIndex: f32,
	@location(0)       texcoord:   vec2f,
};

// Uniforms
@group(0) @binding(${BindingId.Uniforms})               var<uniform>       uniforms:        Uniforms;
@group(0) @binding(${BindingId.AtlasDimensionsUniform}) var<uniform>       atlasDims:       AtlasDimensionsUniform;
@group(0) @binding(${BindingId.ScrollOffset})           var<uniform>       scrollOffset:    ScrollOffset;

// Storage buffers
@group(0) @binding(${BindingId.GlyphInfo0})             var<storage, read> glyphInfo0:      array<GlyphInfo>;
@group(0) @binding(${BindingId.GlyphInfo1})             var<storage, read> glyphInfo1:      array<GlyphInfo>;
@group(0) @binding(${BindingId.Cells})                  var<storage, read> cells:           array<Cells>;

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
		(((vert.position * vec2f(2, -2)) / uniforms.canvasDimensions)) * glyph.size + cell.position + ((glyph.origin * vec2f(2, -2)) / uniforms.canvasDimensions) + ((scrollOffset.offset * 2) / uniforms.canvasDimensions),
		0.0,
		1.0
	);

	vsOut.layerIndex = cell.textureIndex;
	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Glyph offset (0-1)
		(glyph.position / atlasDims.size) +
		// Glyph coordinate (0-1)
		(vsOut.texcoord * (glyph.size / atlasDims.size))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture})        var ourTexture: texture_2d_array<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord, u32(vsOut.layerIndex));
}
`;

class FullFileRenderStrategy<T extends IVisibleLine> implements IRenderStrategy<T> {

	private static _lineCount = 3000;
	private static _columnCount = 200;

	readonly wgsl: string = fullFileRenderStrategyWgsl;

	private readonly _glyphRasterizer: GlyphRasterizer;

	private _cellBindBuffer!: GPUBuffer;
	private _cellValueBuffers!: [ArrayBuffer, ArrayBuffer];
	private _activeDoubleBufferIndex: 0 | 1 = 0;

	private readonly _upToDateLines: [Set<number>, Set<number>] = [new Set(), new Set()];

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
		private readonly _viewportData: ViewportData,
		private readonly _atlas: TextureAtlas,
	) {
		// TODO: Detect when lines have been tokenized and clear _upToDateLines
		const activeWindow = getActiveWindow();
		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = Math.ceil(this._context.configuration.options.get(EditorOption.fontSize) * activeWindow.devicePixelRatio);

		// TODO: Register this
		this._glyphRasterizer = new GlyphRasterizer(fontSize, fontFamily);
	}

	initBuffers(): void {
		const bufferSize = FullFileRenderStrategy._lineCount * FullFileRenderStrategy._columnCount * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._cellBindBuffer = this._device.createBuffer({
			label: 'Monaco full file cell buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._cellValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];

		const scrollOffsetBufferSize = 2;
		this._scrollOffsetBindBuffer = this._device.createBuffer({
			label: 'Monaco scroll offset buffer',
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
		let glyph: Readonly<ITextureAtlasGlyph>;
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
					cellBuffer[cellIndex + 4] = glyph.index; // glyphIndex
					cellBuffer[cellIndex + 5] = glyph.textureIndex; // textureIndex
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
