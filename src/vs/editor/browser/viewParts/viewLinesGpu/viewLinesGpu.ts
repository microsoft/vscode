/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import { TextureAtlasPage } from '../../gpu/atlas/textureAtlasPage.js';
import { BindingId, type IGpuRenderStrategy } from '../../gpu/gpu.js';
import { GPULifecycle } from '../../gpu/gpuDisposable.js';
import { quadVertices } from '../../gpu/gpuUtils.js';
import { ViewGpuContext } from '../../gpu/viewGpuContext.js';
import { FloatHorizontalRange, HorizontalPosition, HorizontalRange, IViewLines, LineVisibleRanges, RenderingContext, RestrictedRenderingContext, VisibleRanges } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { ViewLineOptions } from '../viewLines/viewLineOptions.js';
import type * as viewEvents from '../../../common/viewEvents.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { TextureAtlas } from '../../gpu/atlas/textureAtlas.js';
import { createContentSegmenter, type IContentSegmenter } from '../../gpu/contentSegmenter.js';
import { ViewportRenderStrategy } from '../../gpu/renderStrategy/viewportRenderStrategy.js';
import { FullFileRenderStrategy } from '../../gpu/renderStrategy/fullFileRenderStrategy.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import type { ViewLineRenderingData } from '../../../common/viewModel.js';
import { GlyphRasterizer } from '../../gpu/raster/glyphRasterizer.js';

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

	private _initViewportData?: ViewportData[];
	private _lastViewportData?: ViewportData;
	private _lastViewLineOptions?: ViewLineOptions;

	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;

	private _glyphStorageBuffer!: GPUBuffer;
	private _atlasGpuTexture!: GPUTexture;
	private readonly _atlasGpuTextureVersions: number[] = [];

	private _initialized = false;

	private readonly _glyphRasterizer: MutableDisposable<GlyphRasterizer> = this._register(new MutableDisposable());
	private readonly _renderStrategy: MutableDisposable<IGpuRenderStrategy> = this._register(new MutableDisposable());
	private _rebuildBindGroup?: () => void;

	constructor(
		context: ViewContext,
		private readonly _viewGpuContext: ViewGpuContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(context);

		this.canvas = this._viewGpuContext.canvas.domNode;

		// Re-render the following frame after canvas device pixel dimensions change, provided a
		// new render does not occur.
		this._register(autorun(reader => {
			this._viewGpuContext.canvasDevicePixelDimensions.read(reader);
			const lastViewportData = this._lastViewportData;
			if (lastViewportData) {
				setTimeout(() => {
					if (lastViewportData === this._lastViewportData) {
						this.renderText(lastViewportData);
					}
				});
			}
		}));

		this.initWebgpu();
	}

	async initWebgpu() {
		// #region General

		this._device = ViewGpuContext.deviceSync || await ViewGpuContext.device;

		if (this._store.isDisposed) {
			return;
		}

		const atlas = ViewGpuContext.atlas;

		// Rerender when the texture atlas deletes glyphs
		this._register(atlas.onDidDeleteGlyphs(() => {
			this._atlasGpuTextureVersions.length = 0;
			this._atlasGpuTextureVersions[0] = 0;
			this._atlasGpuTextureVersions[1] = 0;
			this._renderStrategy.value!.reset();
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
			this._register(runOnChange(this._viewGpuContext.canvasDevicePixelDimensions, ({ width, height }) => {
				this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(width, height));
			}));
			this._register(runOnChange(this._viewGpuContext.contentLeft, () => {
				this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues());
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

		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
		this._glyphRasterizer.value = this._register(new GlyphRasterizer(fontSize, fontFamily, this._viewGpuContext.devicePixelRatio.get()));
		this._register(runOnChange(this._viewGpuContext.devicePixelRatio, () => {
			this._refreshGlyphRasterizer();
		}));


		this._renderStrategy.value = this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer as { value: GlyphRasterizer });
		// this._renderStrategy.value = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device);

		this._glyphStorageBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco glyph storage buffer',
			size: TextureAtlas.maximumPageCount * (TextureAtlasPage.maximumGlyphCount * GlyphStorageBufferInfo.BytesPerEntry),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;
		this._atlasGpuTextureVersions[0] = 0;
		this._atlasGpuTextureVersions[1] = 0;
		this._atlasGpuTexture = this._register(GPULifecycle.createTexture(this._device, {
			label: 'Monaco atlas texture',
			format: 'rgba8unorm',
			size: { width: atlas.pageSize, height: atlas.pageSize, depthOrArrayLayers: TextureAtlas.maximumPageCount },
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
			code: this._renderStrategy.value!.wgsl,
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

		this._rebuildBindGroup = () => {
			this._bindGroup = this._device.createBindGroup({
				label: 'Monaco bind group',
				layout: this._pipeline.getBindGroupLayout(0),
				entries: [
					// TODO: Pass in generically as array?
					{ binding: BindingId.GlyphInfo, resource: { buffer: this._glyphStorageBuffer } },
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
					...this._renderStrategy.value!.bindGroupEntries
				],
			});
		};
		this._rebuildBindGroup();

		// endregion Bind group

		this._initialized = true;

		// Render the initial viewport immediately after initialization
		if (this._initViewportData) {
			// HACK: Rendering multiple times in the same frame like this isn't ideal, but there
			//       isn't an easy way to merge viewport data
			for (const viewportData of this._initViewportData) {
				this.renderText(viewportData);
			}
			this._initViewportData = undefined;
		}
	}

	private _refreshRenderStrategy(viewportData: ViewportData) {
		if (this._renderStrategy.value?.type === 'viewport') {
			return;
		}
		if (viewportData.endLineNumber < FullFileRenderStrategy.maxSupportedLines && this._viewportMaxColumn(viewportData) < FullFileRenderStrategy.maxSupportedColumns) {
			return;
		}
		this._logService.trace(`File is larger than ${FullFileRenderStrategy.maxSupportedLines} lines or ${FullFileRenderStrategy.maxSupportedColumns} columns, switching to viewport render strategy`);
		const viewportRenderStrategy = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer as { value: GlyphRasterizer });
		this._renderStrategy.value = viewportRenderStrategy;
		this._register(viewportRenderStrategy.onDidChangeBindGroupEntries(() => this._rebuildBindGroup?.()));
		this._rebuildBindGroup?.();
	}

	private _viewportMaxColumn(viewportData: ViewportData): number {
		let maxColumn = 0;
		let lineData: ViewLineRenderingData;
		for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
			lineData = viewportData.getViewLineRenderingData(i);
			maxColumn = Math.max(maxColumn, lineData.maxColumn);
		}
		return maxColumn;
	}

	private _updateAtlasStorageBufferAndTexture() {
		for (const [layerIndex, page] of ViewGpuContext.atlas.pages.entries()) {
			if (layerIndex >= TextureAtlas.maximumPageCount) {
				console.log(`Attempt to upload atlas page [${layerIndex}], only ${TextureAtlas.maximumPageCount} are supported currently`);
				continue;
			}

			// Skip the update if it's already the latest version
			if (page.version === this._atlasGpuTextureVersions[layerIndex]) {
				continue;
			}

			this._logService.trace('Updating atlas page[', layerIndex, '] from version ', this._atlasGpuTextureVersions[layerIndex], ' to version ', page.version);

			const entryCount = GlyphStorageBufferInfo.FloatsPerEntry * TextureAtlasPage.maximumGlyphCount;
			const values = new Float32Array(entryCount);
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
			this._device.queue.writeBuffer(
				this._glyphStorageBuffer,
				layerIndex * GlyphStorageBufferInfo.FloatsPerEntry * TextureAtlasPage.maximumGlyphCount * Float32Array.BYTES_PER_ELEMENT,
				values,
				0,
				GlyphStorageBufferInfo.FloatsPerEntry * TextureAtlasPage.maximumGlyphCount
			);
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
						width: page.usedArea.right - page.usedArea.left + 1,
						height: page.usedArea.bottom - page.usedArea.top + 1
					},
				);
			}
			this._atlasGpuTextureVersions[layerIndex] = page.version;
		}
	}

	public prepareRender(ctx: RenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	public override render(ctx: RestrictedRenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	// #region Event handlers

	// Since ViewLinesGpu currently coordinates rendering to the canvas, it must listen to all
	// changed events that any GPU part listens to. This is because any drawing to the canvas will
	// clear it for that frame, so all parts must be rendered every time.
	//
	// Additionally, since this is intrinsically linked to ViewLines, it must also listen to events
	// from that side. Luckily rendering is cheap, it's only when uploaded data changes does it
	// start to cost.

	override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._refreshGlyphRasterizer();
		return true;
	}
	override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean { return true; }
	override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean { return true; }
	override onFlushed(e: viewEvents.ViewFlushedEvent): boolean { return true; }

	override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean { return true; }
	override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean { return true; }
	override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean { return true; }
	override onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean { return true; }
	override onRevealRangeRequest(e: viewEvents.ViewRevealRangeRequestEvent): boolean { return true; }
	override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean { return true; }
	override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean { return true; }
	override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean { return true; }

	// #endregion

	private _refreshGlyphRasterizer() {
		const glyphRasterizer = this._glyphRasterizer.value;
		if (!glyphRasterizer) {
			return;
		}
		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
		const devicePixelRatio = this._viewGpuContext.devicePixelRatio.get();
		if (
			glyphRasterizer.fontFamily !== fontFamily ||
			glyphRasterizer.fontSize !== fontSize ||
			glyphRasterizer.devicePixelRatio !== devicePixelRatio
		) {
			this._glyphRasterizer.value = new GlyphRasterizer(fontSize, fontFamily, devicePixelRatio);
		}
	}

	public renderText(viewportData: ViewportData): void {
		if (this._initialized) {
			this._refreshRenderStrategy(viewportData);
			return this._renderText(viewportData);
		} else {
			this._initViewportData = this._initViewportData ?? [];
			this._initViewportData.push(viewportData);
		}
	}

	private _renderText(viewportData: ViewportData): void {
		this._viewGpuContext.rectangleRenderer.draw(viewportData);

		const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);

		this._renderStrategy.value!.update(viewportData, options);

		this._updateAtlasStorageBufferAndTexture();

		const encoder = this._device.createCommandEncoder({ label: 'Monaco command encoder' });

		this._renderPassColorAttachment.view = this._viewGpuContext.ctx.getCurrentTexture().createView({ label: 'Monaco canvas texture view' });
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);

		// Only draw the content area
		const contentLeft = Math.ceil(this._viewGpuContext.contentLeft.get() * this._viewGpuContext.devicePixelRatio.get());
		pass.setScissorRect(contentLeft, 0, this.canvas.width - contentLeft, this.canvas.height);

		pass.setBindGroup(0, this._bindGroup);

		this._renderStrategy.value!.draw(pass, viewportData);

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);

		this._lastViewportData = viewportData;
		this._lastViewLineOptions = options;
	}

	linesVisibleRangesForRange(_range: Range, includeNewLines: boolean): LineVisibleRanges[] | null {
		if (!this._lastViewportData) {
			return null;
		}
		const originalEndLineNumber = _range.endLineNumber;
		const range = Range.intersectRanges(_range, this._lastViewportData.visibleRange);
		if (!range) {
			return null;
		}

		const rendStartLineNumber = this._lastViewportData.startLineNumber;
		const rendEndLineNumber = this._lastViewportData.endLineNumber;

		const viewportData = this._lastViewportData;
		const viewLineOptions = this._lastViewLineOptions;

		if (!viewportData || !viewLineOptions) {
			return null;
		}

		const visibleRanges: LineVisibleRanges[] = [];

		let nextLineModelLineNumber: number = 0;
		if (includeNewLines) {
			nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
		}

		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {

			if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
				continue;
			}
			const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			const continuesInNextLine = lineNumber !== range.endLineNumber;
			const endColumn = continuesInNextLine ? this._context.viewModel.getLineMaxColumn(lineNumber) : range.endColumn;

			const visibleRangesForLine = this._visibleRangesForLineRange(lineNumber, startColumn, endColumn);

			if (!visibleRangesForLine) {
				continue;
			}

			if (includeNewLines && lineNumber < originalEndLineNumber) {
				const currentLineModelLineNumber = nextLineModelLineNumber;
				nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;

				if (currentLineModelLineNumber !== nextLineModelLineNumber) {
					visibleRangesForLine.ranges[visibleRangesForLine.ranges.length - 1].width += viewLineOptions.spaceWidth;
				}
			}

			visibleRanges.push(new LineVisibleRanges(visibleRangesForLine.outsideRenderedLine, lineNumber, HorizontalRange.from(visibleRangesForLine.ranges), continuesInNextLine));
		}

		if (visibleRanges.length === 0) {
			return null;
		}

		return visibleRanges;
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

		// Resolve tab widths for this line
		const lineData = viewportData.getViewLineRenderingData(lineNumber);
		const content = lineData.content;

		let contentSegmenter: IContentSegmenter | undefined;
		if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
			contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
		}

		let chars: string | undefined = '';

		let resolvedStartColumn = 0;
		let resolvedStartCssPixelOffset = 0;
		for (let x = 0; x < startColumn - 1; x++) {
			if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
				chars = content.charAt(x);
			} else {
				chars = contentSegmenter!.getSegmentAtIndex(x);
				if (chars === undefined) {
					continue;
				}
				resolvedStartCssPixelOffset += (this._renderStrategy.value!.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio) - viewLineOptions.spaceWidth;
			}
			if (chars === '\t') {
				resolvedStartColumn = CursorColumns.nextRenderTabStop(resolvedStartColumn, lineData.tabSize);
			} else {
				resolvedStartColumn++;
			}
		}
		let resolvedEndColumn = resolvedStartColumn;
		let resolvedEndCssPixelOffset = 0;
		for (let x = startColumn - 1; x < endColumn - 1; x++) {
			if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
				chars = content.charAt(x);
			} else {
				chars = contentSegmenter!.getSegmentAtIndex(x);
				if (chars === undefined) {
					continue;
				}
				resolvedEndCssPixelOffset += (this._renderStrategy.value!.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio) - viewLineOptions.spaceWidth;
			}
			if (chars === '\t') {
				resolvedEndColumn = CursorColumns.nextRenderTabStop(resolvedEndColumn, lineData.tabSize);
			} else {
				resolvedEndColumn++;
			}
		}

		// Visible horizontal range in _scaled_ pixels
		const result = new VisibleRanges(false, [new FloatHorizontalRange(
			resolvedStartColumn * viewLineOptions.spaceWidth + resolvedStartCssPixelOffset,
			(resolvedEndColumn - resolvedStartColumn) * viewLineOptions.spaceWidth + resolvedEndCssPixelOffset)
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

	getLineWidth(lineNumber: number): number | undefined {
		if (!this._lastViewportData || !this._lastViewLineOptions) {
			return undefined;
		}
		if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
			return undefined;
		}

		const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
		const lineRange = this._visibleRangesForLineRange(lineNumber, 1, lineData.maxColumn);
		const lastRange = lineRange?.ranges.at(-1);
		if (lastRange) {
			return lastRange.width;
		}

		return undefined;
	}

	getPositionAtCoordinate(lineNumber: number, mouseContentHorizontalOffset: number): Position | undefined {
		if (!this._lastViewportData || !this._lastViewLineOptions) {
			return undefined;
		}
		if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
			return undefined;
		}
		const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
		const content = lineData.content;
		const dpr = getActiveWindow().devicePixelRatio;
		const mouseContentHorizontalOffsetDevicePixels = mouseContentHorizontalOffset * dpr;
		const spaceWidthDevicePixels = this._lastViewLineOptions.spaceWidth * dpr;
		const contentSegmenter = createContentSegmenter(lineData, this._lastViewLineOptions);

		let widthSoFar = 0;
		let charWidth = 0;
		let tabXOffset = 0;
		let column = 0;
		for (let x = 0; x < content.length; x++) {
			const chars = contentSegmenter.getSegmentAtIndex(x);

			// Part of an earlier segment
			if (chars === undefined) {
				column++;
				continue;
			}

			// Get the width of the character
			if (chars === '\t') {
				// Find the pixel offset between the current position and the next tab stop
				const offsetBefore = x + tabXOffset;
				tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
				charWidth = spaceWidthDevicePixels * (tabXOffset - offsetBefore);
				// Convert back to offset excluding x and the current character
				tabXOffset -= x + 1;
			} else if (lineData.isBasicASCII && this._lastViewLineOptions.useMonospaceOptimizations) {
				charWidth = spaceWidthDevicePixels;
			} else {
				charWidth = this._renderStrategy.value!.glyphRasterizer.getTextMetrics(chars).width;
			}

			if (mouseContentHorizontalOffsetDevicePixels < widthSoFar + charWidth / 2) {
				break;
			}

			widthSoFar += charWidth;
			column++;
		}

		return new Position(lineNumber, column + 1);
	}
}
