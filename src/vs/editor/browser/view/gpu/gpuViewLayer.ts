/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveDocument, getActiveWindow } from 'vs/base/browser/dom';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/textureAtlas';
import type { IVisibleLine, IVisibleLinesHost } from 'vs/editor/browser/view/viewLayer';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

interface IRendererContext<T extends IVisibleLine> {
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
}

const enum Constants {
	IndicesPerCell = 6
}

const enum SpriteInfoStorageBufferInfo {
	Size = 2 + 2,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
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
}

const wgsl = `
struct Uniforms {
	canvasDimensions: vec2f,
};

struct TextureInfoUniform {
	spriteSheetSize: vec2f,
}

struct SpriteInfo {
	position: vec2f,
	size: vec2f,
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

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(0) texcoord: vec2f,
};

@group(0) @binding(${BindingId.Uniforms}) var<uniform> uniforms: Uniforms;
@group(0) @binding(${BindingId.TextureInfoUniform}) var<uniform> textureInfoUniform: TextureInfoUniform;

@group(0) @binding(${BindingId.SpriteInfo}) var<storage, read> spriteInfo: array<SpriteInfo>;
@group(0) @binding(${BindingId.DynamicUnitInfo}) var<storage, read> dynamicUnitInfoStructs: array<DynamicUnitInfo>;

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
		(((vert.position * vec2f(2, -2)) / uniforms.canvasDimensions)) * spriteInfo.size + dynamicUnitInfo.position,
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

	private _dataBindBuffer!: GPUBuffer;
	private _dataValueBuffers!: ArrayBuffer[];
	private _dataValuesBufferActiveIndex: number = 0;

	private _vertexBuffer!: GPUBuffer;
	private _squareVertices!: { vertexData: Float32Array; numVertices: number };

	private _textureAtlas!: TextureAtlas;
	private _spriteInfoStorageBuffer!: GPUBuffer;
	private _textureAtlasGpuTexture!: GPUTexture;

	private _initialized = false;



	private readonly _testCanvas: HTMLCanvasElement;
	private readonly _testCtx: CanvasRenderingContext2D;


	constructor(domNode: HTMLCanvasElement, host: IVisibleLinesHost<T>, viewportData: ViewportData) {
		this.domNode = domNode;
		this.host = host;
		this.viewportData = viewportData;

		this._gpuCtx = this.domNode.getContext('webgpu')!;
		this.initWebgpu();



		this._testCanvas = document.createElement('canvas');
		this._testCanvas.width = 2048;
		this._testCanvas.height = 2048;
		this._testCanvas.style.position = 'absolute';
		this._testCanvas.style.top = '0';
		this._testCanvas.style.left = '0';
		this._testCanvas.style.zIndex = '10000';
		this._testCanvas.style.pointerEvents = 'none';
		this._testCtx = ensureNonNullable(this._testCanvas.getContext('2d'));
		getActiveDocument().body.appendChild(this._testCanvas);
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

		const module = this._device.createShaderModule({
			label: 'ViewLayer shader module',
			code: wgsl,
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


		// Create texture atlas
		const textureAtlas = this._textureAtlas = new TextureAtlas(this.domNode, this._device.limits.maxTextureDimension2D);



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









		// TODO: Grow/shrink buffer size dynamically
		const cellCount = 10000;
		const bufferSize = cellCount * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._dataBindBuffer = this._device.createBuffer({
			label: 'Entity dynamic info buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._dataValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];
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
				{ binding: BindingId.DynamicUnitInfo, resource: { buffer: this._dataBindBuffer } },
				{ binding: BindingId.TextureSampler, resource: sampler },
				{ binding: BindingId.Texture, resource: this._textureAtlasGpuTexture.createView() },
				{ binding: BindingId.Uniforms, resource: { buffer: uniformBuffer } },
				{ binding: BindingId.TextureInfoUniform, resource: { buffer: textureInfoUniformBuffer } },
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
		// TODO: Dynamically set buffer size
		const bufferSize = spriteInfoStorageBufferByteSize * 10000;
		const values = new Float32Array(bufferSize / 4);
		let entryOffset = 0;
		for (const glyph of this._textureAtlas.glyphs) {
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition] = glyph.x;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition + 1] = glyph.y;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize] = glyph.w;
			values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize + 1] = glyph.h;
			entryOffset += SpriteInfoStorageBufferInfo.Size;
		}
		this._device.queue.writeBuffer(this._spriteInfoStorageBuffer, 0, values);

		this._device.queue.copyExternalImageToTexture(
			{ source: this._textureAtlas.source },
			{ texture: this._textureAtlasGpuTexture },
			{ width: this._textureAtlas.source.width, height: this._textureAtlas.source.height },
		);


		this._testCtx.drawImage(this._textureAtlas.source, 0, 0);
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
		return this._renderWebgpu(ctx, startLineNumber, stopLineNumber, deltaTop);
	}

	private _renderWebgpu(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {
		// TODO: Improve "data" name
		const dataBuffer = new Float32Array(this._dataValueBuffers[this._dataValuesBufferActiveIndex]);
		const visibleObjectCount = this._updateDataBuffer(dataBuffer, ctx, startLineNumber, stopLineNumber, deltaTop);

		// Write buffer and swap it out to unblock writes
		this._device.queue.writeBuffer(this._dataBindBuffer, 0, dataBuffer, 0, visibleObjectCount * Constants.IndicesPerCell);

		this._dataValuesBufferActiveIndex = (this._dataValuesBufferActiveIndex + 1) % 2;

		// TODO: Only do this when needed
		this._updateTextureAtlas();

		const encoder = this._device.createCommandEncoder();

		(this._renderPassDescriptor.colorAttachments as any)[0].view = this._gpuCtx.getCurrentTexture().createView();
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);

		pass.setBindGroup(0, this._bindGroup);
		// TODO: Draws could be split by chunk, this would help minimize moving data around in arrays
		pass.draw(this._squareVertices.numVertices, visibleObjectCount);

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);

		return ctx;
	}

	// TODO: This update could be moved to an arbitrary task thread if expensive?
	private _updateDataBuffer(dataBuffer: Float32Array, ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): number {
		// let chars: string = '';
		let screenAbsoluteX: number = 0;
		let screenAbsoluteY: number = 0;
		let zeroToOneX: number = 0;
		let zeroToOneY: number = 0;
		let wgslX: number = 0;
		let wgslY: number = 0;

		const activeWindow = getActiveWindow();
		let charCount = 0;
		let scrollTop = parseInt(this.domNode.parentElement!.getAttribute('data-adjusted-scroll-top')!);
		if (Number.isNaN(scrollTop)) {
			scrollTop = 0;
		}
		for (let lineNumber = startLineNumber; lineNumber <= stopLineNumber; lineNumber++) {
			const y = Math.round((-scrollTop + deltaTop[lineNumber - startLineNumber]));
			// Offscreen
			if (y < 0) {
				continue;
			}
			const content = this.viewportData.getViewLineRenderingData(lineNumber).content;
			// console.log(content, 0, y);
			for (let x = 0; x < content.length; x++) {
				if (content.charAt(x) === ' ') {
					continue;
				}
				// TODO: Handle tab

				// chars = content[x];
				const glyph = this._textureAtlas.getGlyph(content, x);

				// TODO: Move math to gpu
				// TODO: Render using a line offset for partial line scrolling
				// TODO: Sub-pixel rendering
				screenAbsoluteX = x * 7 * activeWindow.devicePixelRatio;
				// TODO: This +10 is because the glyph is being rendered in the wrong position
				screenAbsoluteY = Math.round(y * activeWindow.devicePixelRatio);
				zeroToOneX = screenAbsoluteX / this.domNode.width;
				zeroToOneY = screenAbsoluteY / this.domNode.height;
				wgslX = zeroToOneX * 2 - 1;
				wgslY = zeroToOneY * 2 - 1;

				dataBuffer[charCount * Constants.IndicesPerCell + 0] = wgslX; // x
				dataBuffer[charCount * Constants.IndicesPerCell + 1] = -wgslY; // y
				dataBuffer[charCount * Constants.IndicesPerCell + 2] = 0;
				dataBuffer[charCount * Constants.IndicesPerCell + 3] = 0;
				dataBuffer[charCount * Constants.IndicesPerCell + 4] = glyph.index;     // textureIndex
				dataBuffer[charCount * Constants.IndicesPerCell + 5] = 0;

				charCount++;
			}
		}
		// console.log('charCount: ' + charCount);
		return charCount;
	}
}
