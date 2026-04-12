/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { TextureAtlasPage } from '../../gpu/atlas/textureAtlasPage.js';
import { GPULifecycle } from '../../gpu/gpuDisposable.js';
import { quadVertices } from '../../gpu/gpuUtils.js';
import { ViewGpuContext } from '../../gpu/viewGpuContext.js';
import { FloatHorizontalRange, HorizontalPosition, HorizontalRange, LineVisibleRanges, VisibleRanges } from '../../view/renderingContext.js';
import { ViewPart } from '../../view/viewPart.js';
import { ViewLineOptions } from '../viewLines/viewLineOptions.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { TextureAtlas } from '../../gpu/atlas/textureAtlas.js';
import { createContentSegmenter } from '../../gpu/contentSegmenter.js';
import { ViewportRenderStrategy } from '../../gpu/renderStrategy/viewportRenderStrategy.js';
import { FullFileRenderStrategy } from '../../gpu/renderStrategy/fullFileRenderStrategy.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { GlyphRasterizer } from '../../gpu/raster/glyphRasterizer.js';
var GlyphStorageBufferInfo;
(function (GlyphStorageBufferInfo) {
    GlyphStorageBufferInfo[GlyphStorageBufferInfo["FloatsPerEntry"] = 6] = "FloatsPerEntry";
    GlyphStorageBufferInfo[GlyphStorageBufferInfo["BytesPerEntry"] = 24] = "BytesPerEntry";
    GlyphStorageBufferInfo[GlyphStorageBufferInfo["Offset_TexturePosition"] = 0] = "Offset_TexturePosition";
    GlyphStorageBufferInfo[GlyphStorageBufferInfo["Offset_TextureSize"] = 2] = "Offset_TextureSize";
    GlyphStorageBufferInfo[GlyphStorageBufferInfo["Offset_OriginPosition"] = 4] = "Offset_OriginPosition";
})(GlyphStorageBufferInfo || (GlyphStorageBufferInfo = {}));
/**
 * The GPU implementation of the ViewLines part.
 */
let ViewLinesGpu = class ViewLinesGpu extends ViewPart {
    constructor(context, _viewGpuContext, _instantiationService, _logService) {
        super(context);
        this._viewGpuContext = _viewGpuContext;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        /**
         * Tracks the maximum line width seen so far for horizontal scrollbar sizing.
         * This is needed because GPU-rendered lines don't have DOM nodes to measure.
         */
        this._maxLineWidth = 0;
        this._atlasGpuTextureVersions = [];
        this._initialized = false;
        this._glyphRasterizer = this._register(new MutableDisposable());
        this._renderStrategy = this._register(new MutableDisposable());
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
            this._renderStrategy.value.reset();
        }));
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this._viewGpuContext.ctx.configure({
            device: this._device,
            format: presentationFormat,
            alphaMode: 'premultiplied',
        });
        this._renderPassColorAttachment = {
            view: null, // Will be filled at render time
            loadOp: 'load',
            storeOp: 'store',
        };
        this._renderPassDescriptor = {
            label: 'Monaco render pass',
            colorAttachments: [this._renderPassColorAttachment],
        };
        // #endregion General
        // #region Uniforms
        let layoutInfoUniformBuffer;
        {
            let Info;
            (function (Info) {
                Info[Info["FloatsPerEntry"] = 6] = "FloatsPerEntry";
                Info[Info["BytesPerEntry"] = 24] = "BytesPerEntry";
                Info[Info["Offset_CanvasWidth____"] = 0] = "Offset_CanvasWidth____";
                Info[Info["Offset_CanvasHeight___"] = 1] = "Offset_CanvasHeight___";
                Info[Info["Offset_ViewportOffsetX"] = 2] = "Offset_ViewportOffsetX";
                Info[Info["Offset_ViewportOffsetY"] = 3] = "Offset_ViewportOffsetY";
                Info[Info["Offset_ViewportWidth__"] = 4] = "Offset_ViewportWidth__";
                Info[Info["Offset_ViewportHeight_"] = 5] = "Offset_ViewportHeight_";
            })(Info || (Info = {}));
            const bufferValues = new Float32Array(6 /* Info.FloatsPerEntry */);
            const updateBufferValues = (canvasDevicePixelWidth = this.canvas.width, canvasDevicePixelHeight = this.canvas.height) => {
                bufferValues[0 /* Info.Offset_CanvasWidth____ */] = canvasDevicePixelWidth;
                bufferValues[1 /* Info.Offset_CanvasHeight___ */] = canvasDevicePixelHeight;
                bufferValues[2 /* Info.Offset_ViewportOffsetX */] = Math.ceil(this._context.configuration.options.get(165 /* EditorOption.layoutInfo */).contentLeft * getActiveWindow().devicePixelRatio);
                bufferValues[3 /* Info.Offset_ViewportOffsetY */] = 0;
                bufferValues[4 /* Info.Offset_ViewportWidth__ */] = bufferValues[0 /* Info.Offset_CanvasWidth____ */] - bufferValues[2 /* Info.Offset_ViewportOffsetX */];
                bufferValues[5 /* Info.Offset_ViewportHeight_ */] = bufferValues[1 /* Info.Offset_CanvasHeight___ */] - bufferValues[3 /* Info.Offset_ViewportOffsetY */];
                return bufferValues;
            };
            layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
                label: 'Monaco uniform buffer',
                size: 24 /* Info.BytesPerEntry */,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }, () => updateBufferValues())).object;
            this._register(runOnChange(this._viewGpuContext.canvasDevicePixelDimensions, ({ width, height }) => {
                this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(width, height));
            }));
            this._register(runOnChange(this._viewGpuContext.contentLeft, () => {
                this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues());
            }));
        }
        let atlasInfoUniformBuffer;
        {
            let Info;
            (function (Info) {
                Info[Info["FloatsPerEntry"] = 2] = "FloatsPerEntry";
                Info[Info["BytesPerEntry"] = 8] = "BytesPerEntry";
                Info[Info["Offset_Width_"] = 0] = "Offset_Width_";
                Info[Info["Offset_Height"] = 1] = "Offset_Height";
            })(Info || (Info = {}));
            atlasInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
                label: 'Monaco atlas info uniform buffer',
                size: 8 /* Info.BytesPerEntry */,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }, () => {
                const values = new Float32Array(2 /* Info.FloatsPerEntry */);
                values[0 /* Info.Offset_Width_ */] = atlas.pageSize;
                values[1 /* Info.Offset_Height */] = atlas.pageSize;
                return values;
            })).object;
        }
        // #endregion Uniforms
        // #region Storage buffers
        const fontFamily = this._context.configuration.options.get(58 /* EditorOption.fontFamily */);
        const fontSize = this._context.configuration.options.get(61 /* EditorOption.fontSize */);
        this._glyphRasterizer.value = this._register(new GlyphRasterizer(fontSize, fontFamily, this._viewGpuContext.devicePixelRatio.get(), ViewGpuContext.decorationStyleCache));
        this._register(runOnChange(this._viewGpuContext.devicePixelRatio, () => {
            this._refreshGlyphRasterizer();
        }));
        this._renderStrategy.value = this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
        // this._renderStrategy.value = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device);
        this._glyphStorageBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco glyph storage buffer',
            size: TextureAtlas.maximumPageCount * (TextureAtlasPage.maximumGlyphCount * 24 /* GlyphStorageBufferInfo.BytesPerEntry */),
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
            code: this._renderStrategy.value.wgsl,
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
                            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
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
                    { binding: 0 /* BindingId.GlyphInfo */, resource: { buffer: this._glyphStorageBuffer } },
                    {
                        binding: 2 /* BindingId.TextureSampler */, resource: this._device.createSampler({
                            label: 'Monaco atlas sampler',
                            magFilter: 'nearest',
                            minFilter: 'nearest',
                        })
                    },
                    { binding: 3 /* BindingId.Texture */, resource: this._atlasGpuTexture.createView() },
                    { binding: 4 /* BindingId.LayoutInfoUniform */, resource: { buffer: layoutInfoUniformBuffer } },
                    { binding: 5 /* BindingId.AtlasDimensionsUniform */, resource: { buffer: atlasInfoUniformBuffer } },
                    ...this._renderStrategy.value.bindGroupEntries
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
    _refreshRenderStrategy(viewportData) {
        if (this._renderStrategy.value?.type === 'viewport') {
            return;
        }
        if (viewportData.endLineNumber < FullFileRenderStrategy.maxSupportedLines && this._viewportMaxColumn(viewportData) < FullFileRenderStrategy.maxSupportedColumns) {
            return;
        }
        this._logService.trace(`File is larger than ${FullFileRenderStrategy.maxSupportedLines} lines or ${FullFileRenderStrategy.maxSupportedColumns} columns, switching to viewport render strategy`);
        const viewportRenderStrategy = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
        this._renderStrategy.value = viewportRenderStrategy;
        this._register(viewportRenderStrategy.onDidChangeBindGroupEntries(() => this._rebuildBindGroup?.()));
        this._rebuildBindGroup?.();
    }
    _viewportMaxColumn(viewportData) {
        let maxColumn = 0;
        let lineData;
        for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
            lineData = viewportData.getViewLineRenderingData(i);
            maxColumn = Math.max(maxColumn, lineData.maxColumn);
        }
        return maxColumn;
    }
    _updateAtlasStorageBufferAndTexture() {
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
            const entryCount = 6 /* GlyphStorageBufferInfo.FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount;
            const values = new Float32Array(entryCount);
            let entryOffset = 0;
            for (const glyph of page.glyphs) {
                values[entryOffset + 0 /* GlyphStorageBufferInfo.Offset_TexturePosition */] = glyph.x;
                values[entryOffset + 0 /* GlyphStorageBufferInfo.Offset_TexturePosition */ + 1] = glyph.y;
                values[entryOffset + 2 /* GlyphStorageBufferInfo.Offset_TextureSize */] = glyph.w;
                values[entryOffset + 2 /* GlyphStorageBufferInfo.Offset_TextureSize */ + 1] = glyph.h;
                values[entryOffset + 4 /* GlyphStorageBufferInfo.Offset_OriginPosition */] = glyph.originOffsetX;
                values[entryOffset + 4 /* GlyphStorageBufferInfo.Offset_OriginPosition */ + 1] = glyph.originOffsetY;
                entryOffset += 6 /* GlyphStorageBufferInfo.FloatsPerEntry */;
            }
            if (entryOffset / 6 /* GlyphStorageBufferInfo.FloatsPerEntry */ > TextureAtlasPage.maximumGlyphCount) {
                throw new Error(`Attempting to write more glyphs (${entryOffset / 6 /* GlyphStorageBufferInfo.FloatsPerEntry */}) than the GPUBuffer can hold (${TextureAtlasPage.maximumGlyphCount})`);
            }
            this._device.queue.writeBuffer(this._glyphStorageBuffer, layerIndex * 6 /* GlyphStorageBufferInfo.FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount * Float32Array.BYTES_PER_ELEMENT, values, 0, 6 /* GlyphStorageBufferInfo.FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount);
            if (page.usedArea.right - page.usedArea.left > 0 && page.usedArea.bottom - page.usedArea.top > 0) {
                this._device.queue.copyExternalImageToTexture({ source: page.source }, {
                    texture: this._atlasGpuTexture,
                    origin: {
                        x: page.usedArea.left,
                        y: page.usedArea.top,
                        z: layerIndex
                    }
                }, {
                    width: page.usedArea.right - page.usedArea.left + 1,
                    height: page.usedArea.bottom - page.usedArea.top + 1
                });
            }
            this._atlasGpuTextureVersions[layerIndex] = page.version;
        }
    }
    prepareRender(ctx) {
        throw new BugIndicatingError('Should not be called');
    }
    render(ctx) {
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
    onConfigurationChanged(e) {
        this._refreshGlyphRasterizer();
        this._maxLineWidth = 0;
        return true;
    }
    onCursorStateChanged(e) { return true; }
    onDecorationsChanged(e) { return true; }
    onFlushed(e) {
        this._maxLineWidth = 0;
        return true;
    }
    onLinesChanged(e) { return true; }
    onLinesDeleted(e) {
        this._maxLineWidth = 0;
        return true;
    }
    onLinesInserted(e) { return true; }
    onLineMappingChanged(e) { return true; }
    onRevealRangeRequest(e) { return true; }
    onScrollChanged(e) { return true; }
    onThemeChanged(e) { return true; }
    onZonesChanged(e) { return true; }
    // #endregion
    _refreshGlyphRasterizer() {
        const glyphRasterizer = this._glyphRasterizer.value;
        if (!glyphRasterizer) {
            return;
        }
        const fontFamily = this._context.configuration.options.get(58 /* EditorOption.fontFamily */);
        const fontSize = this._context.configuration.options.get(61 /* EditorOption.fontSize */);
        const devicePixelRatio = this._viewGpuContext.devicePixelRatio.get();
        if (glyphRasterizer.fontFamily !== fontFamily ||
            glyphRasterizer.fontSize !== fontSize ||
            glyphRasterizer.devicePixelRatio !== devicePixelRatio) {
            this._glyphRasterizer.value = new GlyphRasterizer(fontSize, fontFamily, devicePixelRatio, ViewGpuContext.decorationStyleCache);
        }
    }
    renderText(viewportData) {
        if (this._initialized) {
            this._refreshRenderStrategy(viewportData);
            return this._renderText(viewportData);
        }
        else {
            this._initViewportData = this._initViewportData ?? [];
            this._initViewportData.push(viewportData);
        }
    }
    _renderText(viewportData) {
        this._viewGpuContext.rectangleRenderer.draw(viewportData);
        const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);
        this._renderStrategy.value.update(viewportData, options);
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
        this._renderStrategy.value.draw(pass, viewportData);
        pass.end();
        const commandBuffer = encoder.finish();
        this._device.queue.submit([commandBuffer]);
        this._lastViewportData = viewportData;
        this._lastViewLineOptions = options;
        // Update max line width for horizontal scrollbar
        this._updateMaxLineWidth(viewportData, options);
    }
    /**
     * Update the max line width based on GPU-rendered lines.
     * This is needed because GPU-rendered lines don't have DOM nodes to measure.
     */
    _updateMaxLineWidth(viewportData, viewLineOptions) {
        const dpr = getActiveWindow().devicePixelRatio;
        let localMaxLineWidth = 0;
        for (let lineNumber = viewportData.startLineNumber; lineNumber <= viewportData.endLineNumber; lineNumber++) {
            if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, lineNumber)) {
                continue;
            }
            const lineData = viewportData.getViewLineRenderingData(lineNumber);
            const lineWidth = this._computeLineWidth(lineData, viewLineOptions, dpr);
            localMaxLineWidth = Math.max(localMaxLineWidth, lineWidth);
        }
        // Only update if we found a larger width (use ceil to match DOM behavior)
        const iLineWidth = Math.ceil(localMaxLineWidth);
        if (iLineWidth > this._maxLineWidth) {
            this._maxLineWidth = iLineWidth;
            this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
        }
    }
    /**
     * Compute the width of a line in CSS pixels.
     */
    _computeLineWidth(lineData, viewLineOptions, dpr) {
        const content = lineData.content;
        let contentSegmenter;
        if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
            contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
        }
        let width = 0;
        let tabXOffset = 0;
        for (let x = 0; x < content.length; x++) {
            let chars;
            if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
                chars = content.charAt(x);
            }
            else {
                const segment = contentSegmenter.getSegmentAtIndex(x);
                if (segment === undefined) {
                    continue;
                }
                chars = segment;
            }
            if (chars === '\t') {
                const offsetBefore = x + tabXOffset;
                tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
                width += viewLineOptions.spaceWidth * (tabXOffset - offsetBefore);
                tabXOffset -= x + 1;
            }
            else if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
                width += viewLineOptions.spaceWidth;
            }
            else {
                width += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / dpr;
            }
        }
        return width;
    }
    linesVisibleRangesForRange(_range, includeNewLines) {
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
        const visibleRanges = [];
        let nextLineModelLineNumber = 0;
        if (includeNewLines) {
            nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
        }
        for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
            if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
                continue;
            }
            const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
            const continuesInNextLine = lineNumber !== originalEndLineNumber;
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
    _visibleRangesForLineRange(lineNumber, startColumn, endColumn) {
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
        let contentSegmenter;
        if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
            contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
        }
        let chars = '';
        let resolvedStartColumn = 0;
        let resolvedStartCssPixelOffset = 0;
        for (let x = 0; x < startColumn - 1; x++) {
            if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
                chars = content.charAt(x);
            }
            else {
                chars = contentSegmenter.getSegmentAtIndex(x);
                if (chars === undefined) {
                    continue;
                }
                resolvedStartCssPixelOffset += (this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio) - viewLineOptions.spaceWidth;
            }
            if (chars === '\t') {
                resolvedStartColumn = CursorColumns.nextRenderTabStop(resolvedStartColumn, lineData.tabSize);
            }
            else {
                resolvedStartColumn++;
            }
        }
        let resolvedEndColumn = resolvedStartColumn;
        let resolvedEndCssPixelOffset = 0;
        for (let x = startColumn - 1; x < endColumn - 1; x++) {
            if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
                chars = content.charAt(x);
            }
            else {
                chars = contentSegmenter.getSegmentAtIndex(x);
                if (chars === undefined) {
                    continue;
                }
                resolvedEndCssPixelOffset += (this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio) - viewLineOptions.spaceWidth;
            }
            if (chars === '\t') {
                resolvedEndColumn = CursorColumns.nextRenderTabStop(resolvedEndColumn, lineData.tabSize);
            }
            else {
                resolvedEndColumn++;
            }
        }
        // Visible horizontal range in _scaled_ pixels
        const result = new VisibleRanges(false, [new FloatHorizontalRange(resolvedStartColumn * viewLineOptions.spaceWidth + resolvedStartCssPixelOffset, (resolvedEndColumn - resolvedStartColumn) * viewLineOptions.spaceWidth + resolvedEndCssPixelOffset)
        ]);
        return result;
    }
    visibleRangeForPosition(position) {
        const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
        if (!visibleRanges) {
            return null;
        }
        return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
    }
    getLineWidth(lineNumber) {
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
            // Total line width is the left offset plus width of the last range
            return lastRange.left + lastRange.width;
        }
        return undefined;
    }
    getPositionAtCoordinate(lineNumber, mouseContentHorizontalOffset) {
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
            }
            else if (lineData.isBasicASCII && this._lastViewLineOptions.useMonospaceOptimizations) {
                charWidth = spaceWidthDevicePixels;
            }
            else {
                charWidth = this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width;
            }
            if (mouseContentHorizontalOffsetDevicePixels < widthSoFar + charWidth / 2) {
                break;
            }
            widthSoFar += charWidth;
            column++;
        }
        return new Position(lineNumber, column + 1);
    }
};
ViewLinesGpu = __decorate([
    __param(2, IInstantiationService),
    __param(3, ILogService)
], ViewLinesGpu);
export { ViewLinesGpu };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0xpbmVzR3B1LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL3ZpZXdMaW5lc0dwdS92aWV3TGluZXNHcHUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFdkUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzFELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBYyxpQkFBaUIsRUFBZ0QsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDdk0sT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsYUFBYSxFQUFF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