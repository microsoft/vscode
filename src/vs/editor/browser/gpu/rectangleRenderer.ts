/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { Event } from '../../../base/common/event.js';
import { IReference, MutableDisposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import { EditorOption } from '../../common/config/editorOptions.js';
import { ViewEventHandler } from '../../common/viewEventHandler.js';
import type { ViewScrollChangedEvent } from '../../common/viewEvents.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewContext } from '../../common/viewModel/viewContext.js';
import { GPULifecycle } from './gpuDisposable.js';
import { observeDevicePixelDimensions, quadVertices } from './gpuUtils.js';
import { createObjectCollectionBuffer, type IObjectCollectionBuffer, type IObjectCollectionBufferEntry } from './objectCollectionBuffer.js';
import { RectangleRendererBindingId, rectangleRendererWgsl } from './rectangleRenderer.wgsl.js';

export type RectangleRendererEntrySpec = [
	{ name: 'x' },
	{ name: 'y' },
	{ name: 'width' },
	{ name: 'height' },
	{ name: 'red' },
	{ name: 'green' },
	{ name: 'blue' },
	{ name: 'alpha' },
];

export class RectangleRenderer extends ViewEventHandler {

	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;
	private readonly _shapeBindBuffer: MutableDisposable<IReference<GPUBuffer>> = this._register(new MutableDisposable());

	private _scrollOffsetBindBuffer!: GPUBuffer;
	private _scrollOffsetValueBuffer!: Float32Array;

	private _initialized: boolean = false;

	private readonly _shapeCollection: IObjectCollectionBuffer<RectangleRendererEntrySpec> = this._register(createObjectCollectionBuffer([
		{ name: 'x' },
		{ name: 'y' },
		{ name: 'width' },
		{ name: 'height' },
		{ name: 'red' },
		{ name: 'green' },
		{ name: 'blue' },
		{ name: 'alpha' },
	], 32));

	constructor(
		private readonly _context: ViewContext,
		private readonly _contentLeft: IObservable<number>,
		private readonly _devicePixelRatio: IObservable<number>,
		private readonly _canvas: HTMLCanvasElement,
		private readonly _ctx: GPUCanvasContext,
		device: Promise<GPUDevice>,
	) {
		super();

		this._context.addEventHandler(this);

		this._initWebgpu(device);
	}

	private async _initWebgpu(device: Promise<GPUDevice>) {

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
			view: null!, // Will be filled at render time
			loadOp: 'load',
			storeOp: 'store',
		};
		this._renderPassDescriptor = {
			label: 'Monaco rectangle renderer render pass',
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
			const updateBufferValues = (canvasDevicePixelWidth: number = this._canvas.width, canvasDevicePixelHeight: number = this._canvas.height) => {
				bufferValues[Info.Offset_CanvasWidth____] = canvasDevicePixelWidth;
				bufferValues[Info.Offset_CanvasHeight___] = canvasDevicePixelHeight;
				bufferValues[Info.Offset_ViewportOffsetX] = Math.ceil(this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft * getActiveWindow().devicePixelRatio);
				bufferValues[Info.Offset_ViewportOffsetY] = 0;
				bufferValues[Info.Offset_ViewportWidth__] = bufferValues[Info.Offset_CanvasWidth____] - bufferValues[Info.Offset_ViewportOffsetX];
				bufferValues[Info.Offset_ViewportHeight_] = bufferValues[Info.Offset_CanvasHeight___] - bufferValues[Info.Offset_ViewportOffsetY];
				return bufferValues;
			};
			layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
				label: 'Monaco rectangle renderer uniform buffer',
				size: Info.BytesPerEntry,
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

		this._updateBindGroup(this._pipeline, layoutInfoUniformBuffer);

		// endregion Bind group

		this._initialized = true;
	}

	private _updateBindGroup(pipeline: GPURenderPipeline, layoutInfoUniformBuffer: GPUBuffer) {
		this._bindGroup = this._device.createBindGroup({
			label: 'Monaco rectangle renderer bind group',
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: RectangleRendererBindingId.Shapes, resource: { buffer: this._shapeBindBuffer.value!.object } },
				{ binding: RectangleRendererBindingId.LayoutInfoUniform, resource: { buffer: layoutInfoUniformBuffer } },
				{ binding: RectangleRendererBindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } },
			],
		});
	}

	register(x: number, y: number, width: number, height: number, red: number, green: number, blue: number, alpha: number): IObjectCollectionBufferEntry<RectangleRendererEntrySpec> {
		return this._shapeCollection.createEntry({ x, y, width, height, red, green, blue, alpha });
	}

	// #region Event handlers

	public override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		if (this._device) {
			const dpr = getActiveWindow().devicePixelRatio;
			this._scrollOffsetValueBuffer[0] = this._context.viewLayout.getCurrentScrollLeft() * dpr;
			this._scrollOffsetValueBuffer[1] = this._context.viewLayout.getCurrentScrollTop() * dpr;
			this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer as Float32Array<ArrayBuffer>);
		}
		return true;
	}

	// #endregion

	private _update() {
		if (!this._device) {
			return;
		}
		const shapes = this._shapeCollection;
		if (shapes.dirtyTracker.isDirty) {
			this._device.queue.writeBuffer(this._shapeBindBuffer.value!.object, 0, shapes.buffer, shapes.dirtyTracker.dataOffset, shapes.dirtyTracker.dirtySize! * shapes.view.BYTES_PER_ELEMENT);
			shapes.dirtyTracker.clear();
		}
	}

	draw(viewportData: ViewportData) {
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
