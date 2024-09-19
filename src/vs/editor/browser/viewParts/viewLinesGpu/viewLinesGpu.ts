/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { autorun } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import type { Position } from '../../../common/core/position.js';
import type { Range } from '../../../common/core/range.js';
import type { ViewLinesChangedEvent, ViewScrollChangedEvent } from '../../../common/viewEvents.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import { TextureAtlasPage } from '../../gpu/atlas/textureAtlasPage.js';
import { FullFileRenderStrategy } from '../../gpu/fullFileRenderStrategy.js';
import { BindingId, type IGpuRenderStrategy } from '../../gpu/gpu.js';
import { GPULifecycle } from '../../gpu/gpuDisposable.js';
import { observeDevicePixelDimensions, quadVertices } from '../../gpu/gpuUtils.js';
import { ViewGpuContext } from '../../gpu/viewGpuContext.js';
import { FloatHorizontalRange, HorizontalPosition, IViewLines, LineVisibleRanges, RenderingContext, RestrictedRenderingContext, VisibleRanges } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { ViewLineOptions } from '../viewLines/viewLineOptions.js';


const enum GlyphStorageBufferInfo {
	FloatsPerEntry = 2 + 2 + 2,
	BytesPerEntry = GlyphStorageBufferInfo.FloatsPerEntry * 4,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
	Offset_OriginPosition = 4,
}

/**
 * The GPU implementation of the ViewLines part.
 */
export class ViewLinesGpu extends ViewPart implements IViewLines {

	private readonly canvas: HTMLCanvasElement;

	private _lastViewportData?: ViewportData;
	private _lastViewLineOptions?: ViewLineOptions;

	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;

	private readonly _glyphStorageBuffer: GPUBuffer[] = [];
	private _atlasGpuTexture!: GPUTexture;
	private readonly _atlasGpuTextureVersions: number[] = [];

	private _initialized = false;

	private _renderStrategy!: IGpuRenderStrategy;

	constructor(
		context: ViewContext,
		private readonly _viewGpuContext: ViewGpuContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(context);

		this.canvas = this._viewGpuContext.canvas.domNode;

		this._register(autorun(reader => {
			/*const dims = */this._viewGpuContext.canvasDevicePixelDimensions.read(reader);
			// TODO: Request render, should this just call renderText with the last viewportData
		}));

		this.initWebgpu();
	}

	async initWebgpu() {
		// #region General

		this._device = await this._viewGpuContext.device;

		if (this._store.isDisposed) {
			return;
		}

		const atlas = ViewGpuContext.atlas;

		// Rerender when the texture atlas deletes glyphs
		this._register(atlas.onDidDeleteGlyphs(() => {
			this._atlasGpuTextureVersions.length = 0;
			this._atlasGpuTextureVersions[0] = 0;
			this._atlasGpuTextureVersions[1] = 0;
			this._renderStrategy.reset();
		}));

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this._viewGpuContext.ctx.configure({
			device: this._device,
			format: presentationFormat,
			alphaMode: 'premultiplied',
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

		this._renderStrategy = this._register(this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._device, this.canvas, atlas));

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
				{ binding: BindingId.LayoutInfoUniform, resource: { buffer: layoutInfoUniformBuffer } },
				{ binding: BindingId.AtlasDimensionsUniform, resource: { buffer: atlasInfoUniformBuffer } },
				...this._renderStrategy.bindGroupEntries
			],
		});

		// endregion Bind group

		this._initialized = true;
	}

	private _updateAtlasStorageBufferAndTexture() {
		for (const [layerIndex, page] of ViewGpuContext.atlas.pages.entries()) {
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

	public prepareRender(ctx: RenderingContext): void {
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
		if (this._initialized) {
			return this._renderText(viewportData);
		}
	}

	private _renderText(viewportData: ViewportData): void {
		this._viewGpuContext.rectangleRenderer.draw(viewportData);

		const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);

		const visibleObjectCount = this._renderStrategy.update(viewportData, options);

		this._updateAtlasStorageBufferAndTexture();

		const encoder = this._device.createCommandEncoder({ label: 'Monaco command encoder' });

		this._renderPassColorAttachment.view = this._viewGpuContext.ctx.getCurrentTexture().createView({ label: 'Monaco canvas texture view' });
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

		this._lastViewportData = viewportData;
		this._lastViewLineOptions = options;
	}

	linesVisibleRangesForRange(range: Range, includeNewLines: boolean): LineVisibleRanges[] | null {
		return null;
	}

	private _visibleRangesForLineRange(lineNumber: number, startColumn: number, endColumn: number): VisibleRanges | null {
		if (this.shouldRender()) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		const viewportData = this._lastViewportData;
		const viewLineOptions = this._lastViewLineOptions;

		if (!viewportData || !viewLineOptions || lineNumber < viewportData.startLineNumber || lineNumber > viewportData.endLineNumber) {
			return null;
		}

		// Visible horizontal range in _scaled_ pixels
		const result = new VisibleRanges(false, [new FloatHorizontalRange(
			(startColumn - 1) * viewLineOptions.spaceWidth,
			(endColumn - startColumn - 1) * viewLineOptions.spaceWidth)
		]);

		return result;
	}

	visibleRangeForPosition(position: Position): HorizontalPosition | null {
		const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
		if (!visibleRanges) {
			return null;
		}
		return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
	}
}
