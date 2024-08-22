/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/atlas/textureAtlas';
import { BindingId, type IGpuRenderStrategy } from 'vs/editor/browser/view/gpu/gpu';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewLinesChangedEvent, ViewScrollChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { ViewLineOptions } from '../lines/viewLineOptions';
import { ensureNonNullable, observeDevicePixelDimensions, quadVertices } from 'vs/editor/browser/view/gpu/gpuUtils';
import { getActiveWindow } from 'vs/base/browser/dom';
import { GPULifecycle } from 'vs/editor/browser/view/gpu/gpuDisposable';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { FullFileRenderStrategy } from 'vs/editor/browser/view/gpu/fullFileRenderStrategy';
import { TextureAtlasPage } from 'vs/editor/browser/view/gpu/atlas/textureAtlasPage';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export const disableNonGpuRendering = false;

const enum GlyphStorageBufferInfo {
	FloatsPerEntry = 2 + 2 + 2,
	BytesPerEntry = GlyphStorageBufferInfo.FloatsPerEntry * 4,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
	Offset_OriginPosition = 4,
}

export class ViewLinesGpu extends ViewPart {

	private readonly _gpuCtx!: GPUCanvasContext;

	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;

	static atlas: TextureAtlas;

	private readonly _glyphStorageBuffer: GPUBuffer[] = [];
	private _atlasGpuTexture!: GPUTexture;
	private readonly _atlasGpuTextureVersions: number[] = [];

	private _initialized = false;

	private _renderStrategy!: IGpuRenderStrategy;

	constructor(
		context: ViewContext,
		private readonly canvas: HTMLCanvasElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(context);

		// TODO: Add canvas device pixel resize event to gpu context
		const win = getActiveWindow();
		this.canvas.width = this.canvas.clientWidth * win.devicePixelRatio;
		this.canvas.height = this.canvas.clientHeight * win.devicePixelRatio;
		this._register(observeDevicePixelDimensions(canvas, getActiveWindow(), (w, h) => {
			this.canvas.width = w;
			this.canvas.height = h;
			// TODO: Request render, should this just call renderText with the last viewportData
		}));

		this._gpuCtx = ensureNonNullable(canvas.getContext('webgpu'));

		// TODO: It would be nice if the async part of this (requesting device) was done before
		//       ViewLinesGpu was constructed
		this.initWebgpu();
	}

	async initWebgpu() {
		// #region General

		this._device = this._register(await GPULifecycle.requestDevice()).object;

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this._gpuCtx.configure({
			device: this._device,
			format: presentationFormat,
			alphaMode: 'premultiplied',
		});

		// TODO: Should the texture atlas (shared across all editors) should be part of the gpu context (shared across view parts of this editor)?
		// Create texture atlas
		if (!ViewLinesGpu.atlas) {
			ViewLinesGpu.atlas = this._instantiationService.createInstance(TextureAtlas, this._device.limits.maxTextureDimension2D, undefined);
		}
		const atlas = ViewLinesGpu.atlas;

		this._renderPassColorAttachment = {
			view: null!, // Will be filled at render time
			loadOp: 'load',
			storeOp: 'store',
		};
		this._renderPassDescriptor = {
			label: 'Monaco render pass',
			colorAttachments: [this._renderPassColorAttachment],
		};

		// #endregion General

		// #region Uniforms

		let layoutInfoUniformBuffer: GPUBuffer;
		{
			const enum Info {
				FloatsPerEntry = 6,
				BytesPerEntry = Info.FloatsPerEntry * 4,
				Offset_CanvasWidth____ = 0,
				Offset_CanvasHeight___ = 1,
				Offset_ViewportOffsetX = 2,
				Offset_ViewportOffsetY = 3,
				Offset_ViewportWidth__ = 4,
				Offset_ViewportHeight_ = 5,
			}
			const bufferValues = new Float32Array(Info.FloatsPerEntry);
			const updateBufferValues = (canvasDevicePixelWidth: number = this.canvas.width, canvasDevicePixelHeight: number = this.canvas.height) => {
				bufferValues[Info.Offset_CanvasWidth____] = canvasDevicePixelWidth;
				bufferValues[Info.Offset_CanvasHeight___] = canvasDevicePixelHeight;
				bufferValues[Info.Offset_ViewportOffsetX] = Math.ceil(this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft * getActiveWindow().devicePixelRatio);
				bufferValues[Info.Offset_ViewportOffsetY] = 0;
				bufferValues[Info.Offset_ViewportWidth__] = bufferValues[Info.Offset_CanvasWidth____] - bufferValues[Info.Offset_ViewportOffsetX];
				bufferValues[Info.Offset_ViewportHeight_] = bufferValues[Info.Offset_CanvasHeight___] - bufferValues[Info.Offset_ViewportOffsetY];
				return bufferValues;
			};
			layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
				label: 'Monaco uniform buffer',
				size: Info.BytesPerEntry,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}, () => updateBufferValues())).object;
			this._register(observeDevicePixelDimensions(this.canvas, getActiveWindow(), (w, h) => {
				this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(w, h));
			}));
		}

		let atlasInfoUniformBuffer: GPUBuffer;
		{
			const enum Info {
				FloatsPerEntry = 2,
				BytesPerEntry = Info.FloatsPerEntry * 4,
				Offset_Width_ = 0,
				Offset_Height = 1,
			}
			atlasInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
				label: 'Monaco atlas info uniform buffer',
				size: Info.BytesPerEntry,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			}, () => {
				const values = new Float32Array(Info.FloatsPerEntry);
				values[Info.Offset_Width_] = atlas.pageSize;
				values[Info.Offset_Height] = atlas.pageSize;
				return values;
			})).object;
		}

		// #endregion Uniforms

		// #region Storage buffers

		this._renderStrategy = this._register(this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._device, this.canvas, ViewLinesGpu.atlas));

		this._glyphStorageBuffer[0] = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco glyph storage buffer',
			size: GlyphStorageBufferInfo.BytesPerEntry * TextureAtlasPage.maximumGlyphCount,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;
		this._glyphStorageBuffer[1] = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco glyph storage buffer',
			size: GlyphStorageBufferInfo.BytesPerEntry * TextureAtlasPage.maximumGlyphCount,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;
		this._atlasGpuTextureVersions[0] = 0;
		this._atlasGpuTextureVersions[1] = 0;
		this._atlasGpuTexture = this._register(GPULifecycle.createTexture(this._device, {
			label: 'Monaco atlas texture',
			format: 'rgba8unorm',
			// TODO: Dynamically grow/shrink layer count
			size: { width: atlas.pageSize, height: atlas.pageSize, depthOrArrayLayers: 2 },
			dimension: '2d',
			usage: GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		})).object;

		this._updateAtlasStorageBufferAndTexture();

		// #endregion Storage buffers

		// #region Vertex buffer

		this._vertexBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco vertex buffer',
			size: quadVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		}, quadVertices)).object;

		// #endregion Vertex buffer

		// #region Shader module

		const module = this._device.createShaderModule({
			label: 'Monaco shader module',
			code: this._renderStrategy.wgsl,
		});

		// #endregion Shader module

		// #region Pipeline

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

		// #endregion Pipeline

		// #region Bind group

		this._bindGroup = this._device.createBindGroup({
			label: 'Monaco bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				// TODO: Pass in generically as array?
				{ binding: BindingId.GlyphInfo0, resource: { buffer: this._glyphStorageBuffer[0] } },
				{ binding: BindingId.GlyphInfo1, resource: { buffer: this._glyphStorageBuffer[1] } },
				{
					binding: BindingId.TextureSampler, resource: this._device.createSampler({
						label: 'Monaco atlas sampler',
						magFilter: 'nearest',
						minFilter: 'nearest',
					})
				},
				{ binding: BindingId.Texture, resource: this._atlasGpuTexture.createView() },
				{ binding: BindingId.ViewportUniform, resource: { buffer: layoutInfoUniformBuffer } },
				{ binding: BindingId.AtlasDimensionsUniform, resource: { buffer: atlasInfoUniformBuffer } },
				...this._renderStrategy.bindGroupEntries
			],
		});

		// endregion Bind group

		this._initialized = true;
	}

	private _updateAtlasStorageBufferAndTexture() {
		const atlas = ViewLinesGpu.atlas;

		for (const [layerIndex, page] of atlas.pages.entries()) {
			// Skip the update if it's already the latest version
			if (page.version === this._atlasGpuTextureVersions[layerIndex]) {
				continue;
			}

			this._logService.trace('Updating atlas page[', layerIndex, '] from version ', this._atlasGpuTextureVersions[layerIndex], ' to version ', page.version);

			// TODO: Reuse buffer instead of reconstructing each time
			// TODO: Dynamically set buffer size
			const values = new Float32Array(GlyphStorageBufferInfo.FloatsPerEntry * TextureAtlasPage.maximumGlyphCount);
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
			if (entryOffset / GlyphStorageBufferInfo.FloatsPerEntry > TextureAtlasPage.maximumGlyphCount) {
				throw new Error(`Attempting to write more glyphs (${entryOffset / GlyphStorageBufferInfo.FloatsPerEntry}) than the GPUBuffer can hold (${TextureAtlasPage.maximumGlyphCount})`);
			}
			this._device.queue.writeBuffer(this._glyphStorageBuffer[layerIndex], 0, values);
			if (page.usedArea.right - page.usedArea.left > 0 && page.usedArea.bottom - page.usedArea.top > 0) {
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
			}
			this._atlasGpuTextureVersions[layerIndex] = page.version;
		}
	}

	public static canRender(options: ViewLineOptions, viewportData: ViewportData, lineNumber: number): boolean {
		const d = viewportData.getViewLineRenderingData(lineNumber);
		// TODO
		return d.content.indexOf('e') !== -1;
	}

	public override prepareRender(ctx: RenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	public override render(ctx: RestrictedRenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		return true;
	}

	override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		return true;
	}

	// subscribe to more events

	public renderText(viewportData: ViewportData): void {
		// TODO: Remove this simple canvas rendering when webgpu stuff is hooked up
		// const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);

		// const ctxSimple = this.canvas.getContext('2d')!;
		// ctxSimple.clearRect(0, 0, this.canvas.width, this.canvas.height);
		// ctxSimple.strokeStyle = 'black';
		// const vp = this._context.viewLayout.getCurrentViewport();
		// const left = this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft;
		// this.canvas.width = vp.width;
		// this.canvas.height = vp.height;
		// ctxSimple.font = `${this._context.configuration.options.get(EditorOption.fontSize)}px monospace`;

		// for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
		// 	if (!ViewLinesGpu.canRender(options, viewportData, i)) {
		// 		continue;
		// 	}
		// 	const line = viewportData.getViewLineRenderingData(i);

		// 	ctxSimple.strokeText(line.content, left, viewportData.relativeVerticalOffset[i - viewportData.startLineNumber] + viewportData.lineHeight - this._context.viewLayout.getCurrentScrollTop());
		// }



		if (this._initialized) {
			return this._renderText(viewportData);
		}
	}

	private _renderText(viewportData: ViewportData): void {
		const visibleObjectCount = this._renderStrategy.update(viewportData);

		this._updateAtlasStorageBufferAndTexture();

		const encoder = this._device.createCommandEncoder({ label: 'Monaco command encoder' });

		this._renderPassColorAttachment.view = this._gpuCtx.getCurrentTexture().createView({ label: 'Monaco canvas texture view' });
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);

		pass.setBindGroup(0, this._bindGroup);

		if (this._renderStrategy?.draw) {
			// TODO: Don't draw lines if ViewLinesGpu.canRender is false
			this._renderStrategy.draw(pass, viewportData);
		} else {
			pass.draw(quadVertices.length / 2, visibleObjectCount);
		}

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);
	}
}
