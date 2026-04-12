/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../base/browser/dom.js';
import { Event } from '../../../base/common/event.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { ViewEventHandler } from '../../common/viewEventHandler.js';
import { GPULifecycle } from './gpuDisposable.js';
import { observeDevicePixelDimensions, quadVertices } from './gpuUtils.js';
import { createObjectCollectionBuffer } from './objectCollectionBuffer.js';
import { rectangleRendererWgsl } from './rectangleRenderer.wgsl.js';
export class RectangleRenderer extends ViewEventHandler {
    constructor(_context, _contentLeft, _devicePixelRatio, _canvas, _ctx, device) {
        super();
        this._context = _context;
        this._contentLeft = _contentLeft;
        this._devicePixelRatio = _devicePixelRatio;
        this._canvas = _canvas;
        this._ctx = _ctx;
        this._shapeBindBuffer = this._register(new MutableDisposable());
        this._initialized = false;
        this._shapeCollection = this._register(createObjectCollectionBuffer([
            { name: 'x' },
            { name: 'y' },
            { name: 'width' },
            { name: 'height' },
            { name: 'red' },
            { name: 'green' },
            { name: 'blue' },
            { name: 'alpha' },
        ], 32));
        this._context.addEventHandler(this);
        this._initWebgpu(device);
    }
    async _initWebgpu(device) {
        // #region General
        this._device = await device;
        if (this._store.isDisposed) {
            return;
        }
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this._ctx.configure({
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
            label: 'Monaco rectangle renderer render pass',
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
            const updateBufferValues = (canvasDevicePixelWidth = this._canvas.width, canvasDevicePixelHeight = this._canvas.height) => {
                bufferValues[0 /* Info.Offset_CanvasWidth____ */] = canvasDevicePixelWidth;
                bufferValues[1 /* Info.Offset_CanvasHeight___ */] = canvasDevicePixelHeight;
                bufferValues[2 /* Info.Offset_ViewportOffsetX */] = Math.ceil(this._context.configuration.options.get(165 /* EditorOption.layoutInfo */).contentLeft * getActiveWindow().devicePixelRatio);
                bufferValues[3 /* Info.Offset_ViewportOffsetY */] = 0;
                bufferValues[4 /* Info.Offset_ViewportWidth__ */] = bufferValues[0 /* Info.Offset_CanvasWidth____ */] - bufferValues[2 /* Info.Offset_ViewportOffsetX */];
                bufferValues[5 /* Info.Offset_ViewportHeight_ */] = bufferValues[1 /* Info.Offset_CanvasHeight___ */] - bufferValues[3 /* Info.Offset_ViewportOffsetY */];
                return bufferValues;
            };
            layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
                label: 'Monaco rectangle renderer uniform buffer',
                size: 24 /* Info.BytesPerEntry */,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }, () => updateBufferValues())).object;
            this._register(observeDevicePixelDimensions(this._canvas, getActiveWindow(), (w, h) => {
                this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(w, h));
            }));
        }
        const scrollOffsetBufferSize = 2;
        this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco rectangle renderer scroll offset buffer',
            size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })).object;
        this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
        // #endregion Uniforms
        // #region Storage buffers
        const createShapeBindBuffer = () => {
            return GPULifecycle.createBuffer(this._device, {
                label: 'Monaco rectangle renderer shape buffer',
                size: this._shapeCollection.buffer.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        };
        this._shapeBindBuffer.value = createShapeBindBuffer();
        this._register(Event.runAndSubscribe(this._shapeCollection.onDidChangeBuffer, () => {
            this._shapeBindBuffer.value = createShapeBindBuffer();
            if (this._pipeline) {
                this._updateBindGroup(this._pipeline, layoutInfoUniformBuffer);
            }
        }));
        // #endregion Storage buffers
        // #region Vertex buffer
        this._vertexBuffer = this._register(GPULifecycle.createBuffer(this._device, {
            label: 'Monaco rectangle renderer vertex buffer',
            size: quadVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        }, quadVertices)).object;
        // #endregion Vertex buffer
        // #region Shader module
        const module = this._device.createShaderModule({
            label: 'Monaco rectangle renderer shader module',
            code: rectangleRendererWgsl,
        });
        // #endregion Shader module
        // #region Pipeline
        this._pipeline = this._device.createRenderPipeline({
            label: 'Monaco rectangle renderer render pipeline',
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
        this._updateBindGroup(this._pipeline, layoutInfoUniformBuffer);
        // endregion Bind group
        this._initialized = true;
    }
    _updateBindGroup(pipeline, layoutInfoUniformBuffer) {
        this._bindGroup = this._device.createBindGroup({
            label: 'Monaco rectangle renderer bind group',
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0 /* RectangleRendererBindingId.Shapes */, resource: { buffer: this._shapeBindBuffer.value.object } },
                { binding: 1 /* RectangleRendererBindingId.LayoutInfoUniform */, resource: { buffer: layoutInfoUniformBuffer } },
                { binding: 2 /* RectangleRendererBindingId.ScrollOffset */, resource: { buffer: this._scrollOffsetBindBuffer } },
            ],
        });
    }
    register(x, y, width, height, red, green, blue, alpha) {
        return this._shapeCollection.createEntry({ x, y, width, height, red, green, blue, alpha });
    }
    // #region Event handlers
    onScrollChanged(e) {
        if (this._device) {
            const dpr = getActiveWindow().devicePixelRatio;
            this._scrollOffsetValueBuffer[0] = this._context.viewLayout.getCurrentScrollLeft() * dpr;
            this._scrollOffsetValueBuffer[1] = this._context.viewLayout.getCurrentScrollTop() * dpr;
            this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer);
        }
        return true;
    }
    // #endregion
    _update() {
        if (!this._device) {
            return;
        }
        const shapes = this._shapeCollection;
        if (shapes.dirtyTracker.isDirty) {
            this._device.queue.writeBuffer(this._shapeBindBuffer.value.object, 0, shapes.buffer, shapes.dirtyTracker.dataOffset, shapes.dirtyTracker.dirtySize * shapes.view.BYTES_PER_ELEMENT);
            shapes.dirtyTracker.clear();
        }
    }
    draw(viewportData) {
        if (!this._initialized) {
            return;
        }
        this._update();
        const encoder = this._device.createCommandEncoder({ label: 'Monaco rectangle renderer command encoder' });
        this._renderPassColorAttachment.view = this._ctx.getCurrentTexture().createView();
        const pass = encoder.beginRenderPass(this._renderPassDescriptor);
        pass.setPipeline(this._pipeline);
        pass.setVertexBuffer(0, this._vertexBuffer);
        pass.setBindGroup(0, this._bindGroup);
        // Only draw the content area
        const contentLeft = Math.ceil(this._contentLeft.get() * this._devicePixelRatio.get());
        pass.setScissorRect(contentLeft, 0, this._canvas.width - contentLeft, this._canvas.height);
        pass.draw(quadVertices.length / 2, this._shapeCollection.entryCount);
        pass.end();
        const commandBuffer = encoder.finish();
        this._device.queue.submit([commandBuffer]);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjdGFuZ2xlUmVuZGVyZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvcmVjdGFuZ2xlUmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQWMsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUdsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUlwRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbEQsT0FBTyxFQUFFLDRCQUE0QixFQUFFLFlBQVksRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUMzRSxPQUFPLEVBQUUsNEJBQTRCLEVBQW1FLE1BQU0sNkJBQTZCLENBQUM7QUFDNUksT0FBTyxFQUE4QixxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBYWhHLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxnQkFBZ0I7SUEyQnRELFlBQ2tCLFFBQXFCLEVBQ3JCLFlBQWlDLEVBQ2pDLGlCQUFzQyxFQUN0QyxPQUEwQixFQUMxQixJQUFzQixFQUN2QyxNQUEwQjtRQUUxQixLQUFLLEVBQUUsQ0FBQztRQVBTLGFBQVEsR0FBUixRQUFRLENBQWE7UUFDckIsaUJBQVksR0FBWixZQUFZLENBQXFCO1FBQ2pDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBcUI7UUFDdEMsWUFBTyxHQUFQLE9BQU8sQ0FBbUI7UUFDMUIsU0FBSSxHQUFKLElBQUksQ0FBa0I7UUF2QnZCLHFCQUFnQixHQUE2QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FB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