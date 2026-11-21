/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GpuAtlasStorage } from '../../../browser/gpu/atlas/gpuAtlasStorage.js';
import { TextureAtlasPage } from '../../../browser/gpu/atlas/textureAtlasPage.js';
import { BindingId } from '../../../browser/gpu/gpu.js';
import { GPULifecycle } from '../../../browser/gpu/gpuDisposable.js';
import { premultipliedAlphaBlend, quadVertices } from '../../../browser/gpu/gpuUtils.js';
import { fullFileRenderStrategyWgsl } from '../../../browser/gpu/renderStrategy/fullFileRenderStrategy.wgsl.js';

suite('GPU rendering', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let device: GPUDevice;

	setup(async function () {
		const adapter = await navigator.gpu?.requestAdapter();
		if (!adapter) {
			this.skip();
		}
		device = await adapter.requestDevice();
		store.add(toDisposable(() => device.destroy()));
	});

	test('preserves glyph alpha and draws after atlas growth and shrink', async () => {
		device.pushErrorScope('validation');
		const atlas = store.add(new GpuAtlasStorage(device));
		const module = device.createShaderModule({ code: fullFileRenderStrategyWgsl });
		const pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module,
				buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }],
			},
			fragment: { module, targets: [{ format: 'rgba8unorm', blend: premultipliedAlphaBlend }] },
		});
		const buffer = (values: Float32Array<ArrayBuffer>, usage: GPUBufferUsageFlags) => store.add(GPULifecycle.createBuffer(device, { size: values.byteLength, usage: usage | GPUBufferUsage.COPY_DST }, values)).object;
		const vertices = buffer(quadVertices, GPUBufferUsage.VERTEX);
		const layout = buffer(new Float32Array([1, 1, 0, 0, 1, 1]), GPUBufferUsage.UNIFORM);
		const dimensions = buffer(new Float32Array([4, 4]), GPUBufferUsage.UNIFORM);
		const scroll = buffer(new Float32Array([0, 0]), GPUBufferUsage.UNIFORM);
		const cells = buffer(new Float32Array(6), GPUBufferUsage.STORAGE);
		const output = store.add(GPULifecycle.createTexture(device, { size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })).object;
		const readback = store.add(GPULifecycle.createBuffer(device, { size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })).object;
		const pixels: number[][] = [];

		for (const pageCount of [1, 3, 1]) {
			atlas.setPageCount(4, pageCount);
			const layer = pageCount - 1;
			device.queue.writeBuffer(atlas.glyphBuffer, layer * TextureAtlasPage.maximumGlyphCount * 24, new Float32Array([0, 0, 1, 1, 0, 0]));
			device.queue.writeBuffer(cells, 0, new Float32Array([0, 0, 0, 0, 0, layer]));
			device.queue.writeTexture({ texture: atlas.texture, origin: [0, 0, layer] }, new Uint8Array([255, 0, 0, 128]), {}, [1, 1]);
			const bindGroup = device.createBindGroup({
				layout: pipeline.getBindGroupLayout(0),
				entries: [
					{ binding: BindingId.GlyphInfo, resource: { buffer: atlas.glyphBuffer } },
					{ binding: BindingId.TextureSampler, resource: device.createSampler() },
					{ binding: BindingId.Texture, resource: atlas.texture.createView({ dimension: '2d-array' }) },
					{ binding: BindingId.LayoutInfoUniform, resource: { buffer: layout } },
					{ binding: BindingId.AtlasDimensionsUniform, resource: { buffer: dimensions } },
					{ binding: BindingId.ScrollOffset, resource: { buffer: scroll } },
					{ binding: BindingId.Cells, resource: { buffer: cells } },
				],
			});
			const encoder = device.createCommandEncoder();
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
			pass.setPipeline(pipeline);
			pass.setVertexBuffer(0, vertices);
			pass.setBindGroup(0, bindGroup);
			pass.draw(6, 1);
			pass.end();
			encoder.copyTextureToBuffer({ texture: output }, { buffer: readback, bytesPerRow: 256 }, [1, 1]);
			device.queue.submit([encoder.finish()]);
			await readback.mapAsync(GPUMapMode.READ);
			pixels.push(Array.from(new Uint8Array(readback.getMappedRange()).slice(0, 4)));
			readback.unmap();
		}
		strictEqual(await device.popErrorScope(), null);
		deepStrictEqual(pixels, [[128, 0, 0, 128], [128, 0, 0, 128], [128, 0, 0, 128]]);
	});
});
