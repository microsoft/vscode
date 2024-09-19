/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IReference } from '../../../base/common/lifecycle.js';
import { isFunction } from '../../../base/common/types.js';

export namespace GPULifecycle {
	export async function requestDevice(fallback?: (message: string) => void): Promise<IReference<GPUDevice>> {
		try {
			if (!navigator.gpu) {
				throw new Error('This browser does not support WebGPU');
			}
			const adapter = (await navigator.gpu.requestAdapter())!;
			if (!adapter) {
				throw new Error('This browser supports WebGPU but it appears to be disabled');
			}
			return wrapDestroyableInDisposable(await adapter.requestDevice());
		} catch (e) {
			if (fallback) {
				fallback(e.message);
			}
			throw e;
		}
	}

	export function createBuffer(device: GPUDevice, descriptor: GPUBufferDescriptor, initialValues?: Float32Array | (() => Float32Array)): IReference<GPUBuffer> {
		const buffer = device.createBuffer(descriptor);
		if (initialValues) {
			device.queue.writeBuffer(buffer, 0, isFunction(initialValues) ? initialValues() : initialValues);
		}
		return wrapDestroyableInDisposable(buffer);
	}

	export function createTexture(device: GPUDevice, descriptor: GPUTextureDescriptor): IReference<GPUTexture> {
		return wrapDestroyableInDisposable(device.createTexture(descriptor));
	}
}

function wrapDestroyableInDisposable<T extends { destroy(): void }>(value: T): IReference<T> {
	return {
		object: value,
		dispose: () => value.destroy()
	};
}
