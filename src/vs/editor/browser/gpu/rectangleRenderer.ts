/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import { GPULifecycle } from './gpuDisposable.js';
import { quadVertices } from './gpuUtils.js';
import { createObjectCollectionBuffer, type IObjectCollectionBuffer, type IObjectCollectionBufferEntry } from './objectCollectionBuffer.js';
import { RectangleRendererBindingId, rectangleRendererWgsl } from './rectangleRenderer.wgsl.js';

export type RectangleRendererEntrySpec = [
	{ name: 'x' },
	{ name: 'y' },
	{ name: 'width' },
	{ name: 'height' }
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
		{ name: 'height' }
	], 32));

	constructor(
		private readonly _ctx: GPUCanvasContext,
		device: Promise<GPUDevice>,
	) {
		super();

		// TODO: Add color
		this._shapeCollection.createEntry({ x: -0.2, y: 0.1, width: 0.25, height: -0.5 });

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
			],
		});

		// endregion Bind group

		this._initialized = true;
	}

	register(x: number, y: number, width: number, height: number): IObjectCollectionBufferEntry<RectangleRendererEntrySpec> {
		// TODO: Expand buffer if needed
		return this._shapeCollection.createEntry({ x, y, width, height });
	}

	private _update(): number {
		this._device.queue.writeBuffer(this._shapeBindBuffer, 0, this._shapeCollection.buffer);

		// TODO: Expose entry size on collection
		return this._shapeCollection.viewUsedSize / 4;
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
