/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
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
	{ name: 'alpha' }
];

export class RectangleRenderer extends Disposable {

	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _vertexBuffer!: GPUBuffer;
	private _shapeBindBuffer!: GPUBuffer;

	private _initialized: boolean = false;

	private readonly _shapeCollection: IObjectCollectionBuffer<RectangleRendererEntrySpec> = this._register(createObjectCollectionBuffer([
		{ name: 'x' },
		{ name: 'y' },
		{ name: 'width' },
		{ name: 'height' },
		{ name: 'red' },
		{ name: 'green' },
		{ name: 'blue' },
		{ name: 'alpha' }
	], 32));

	constructor(
		private readonly _canvas: HTMLCanvasElement,
		private readonly _ctx: GPUCanvasContext,
		device: Promise<GPUDevice>,
	) {
		super();

		// TODO: Add color
		this._shapeCollection.createEntry({ x: 200, y: 100, width: 100, height: 25, red: 0, green: 1, blue: 0, alpha: 1 });

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
				// TODO: Set viewport offset
				bufferValues[Info.Offset_ViewportOffsetX] = 0; // Math.ceil(this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft * getActiveWindow().devicePixelRatio);
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

		// #endregion Uniforms

		// #region Storage buffers

		this._shapeBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco rectangle renderer shape buffer',
			size: this._shapeCollection.buffer.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).object;

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

		this._bindGroup = this._device.createBindGroup({
			label: 'Monaco rectangle renderer bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: RectangleRendererBindingId.Shapes, resource: { buffer: this._shapeBindBuffer } },
				{ binding: RectangleRendererBindingId.LayoutInfoUniform, resource: { buffer: layoutInfoUniformBuffer } },
			],
		});

		// endregion Bind group

		this._initialized = true;
	}

	register(x: number, y: number, width: number, height: number, red: number, green: number, blue: number, alpha: number): IObjectCollectionBufferEntry<RectangleRendererEntrySpec> {
		// TODO: Expand buffer if needed
		return this._shapeCollection.createEntry({ x, y, width, height, red, green, blue, alpha });
	}

	private _update(): number {
		// TODO: Only write dirty range
		this._device.queue.writeBuffer(this._shapeBindBuffer, 0, this._shapeCollection.buffer);
		return this._shapeCollection.entryCount;
	}

	draw(viewportData: ViewportData) {
		if (!this._initialized) {
			return;
		}

		const visibleObjectCount = this._update();
		console.log('draw rectangle count', visibleObjectCount);

		const encoder = this._device.createCommandEncoder({ label: 'our encoder' });

		this._renderPassColorAttachment.view = this._ctx.getCurrentTexture().createView();
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);
		pass.setBindGroup(0, this._bindGroup);

		pass.draw(quadVertices.length / 2, visibleObjectCount);
		pass.end();

		const commandBuffer = encoder.finish();
		this._device.queue.submit([commandBuffer]);
	}
}
