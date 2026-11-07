/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual, throws } from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GpuAtlasStorage } from '../../../../browser/gpu/atlas/gpuAtlasStorage.js';

suite('GpuAtlasStorage', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('allocates only needed pages, reuses capacity and releases replaced storage', () => {
		const textureSizes: GPUExtent3D[] = [];
		const bufferSizes: number[] = [];
		let destroyedTextures = 0;
		let destroyedBuffers = 0;
		const device = new class extends mock<GPUDevice>() {
			override createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
				textureSizes.push(descriptor.size);
				return new class extends mock<GPUTexture>() {
					override destroy(): undefined { destroyedTextures++; }
				};
			}
			override createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
				bufferSizes.push(descriptor.size);
				return new class extends mock<GPUBuffer>() {
					override destroy(): undefined { destroyedBuffers++; }
				};
			}
		};
		const storage = store.add(new GpuAtlasStorage(device));
		const changes = [1, 2, 3, 4, 1].map(count => storage.setPageCount(2048, count));
		deepStrictEqual({ changes, textureSizes, bufferSizes, destroyedTextures, destroyedBuffers }, {
			changes: [true, true, true, false, true],
			textureSizes: [1, 2, 4, 1].map(depthOrArrayLayers => ({ width: 2048, height: 2048, depthOrArrayLayers })),
			bufferSizes: [bufferSizes[0], bufferSizes[0] * 2, bufferSizes[0] * 4, bufferSizes[0]],
			destroyedTextures: 3,
			destroyedBuffers: 3,
		});
		storage.dispose();
		deepStrictEqual([destroyedTextures, destroyedBuffers], [4, 4]);
	});

	test('reallocates when page dimensions change and rejects invalid page counts', () => {
		const device = new class extends mock<GPUDevice>() {
			override createTexture(): GPUTexture { return new class extends mock<GPUTexture>() { override destroy(): undefined { } }; }
			override createBuffer(): GPUBuffer { return new class extends mock<GPUBuffer>() { override destroy(): undefined { } }; }
		};
		const storage = store.add(new GpuAtlasStorage(device));
		storage.setPageCount(1024, 1);
		strictEqual(storage.setPageCount(2048, 1), true);
		for (const pageCount of [0, 17]) {
			throws(() => storage.setPageCount(2048, pageCount));
		}
	});
});
