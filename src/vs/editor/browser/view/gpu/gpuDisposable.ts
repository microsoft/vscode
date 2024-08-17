/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IDisposable } from 'vs/base/common/lifecycle';
import { isFunction } from 'vs/base/common/types';

export namespace GpuLifecycle {
	export function createBuffer(device: GPUDevice, descriptor: GPUBufferDescriptor, initialValues?: Float32Array | (() => Float32Array)): { buffer: GPUBuffer } & IDisposable {
		const buffer = device.createBuffer(descriptor);
		if (initialValues) {
			device.queue.writeBuffer(buffer, 0, isFunction(initialValues) ? initialValues() : initialValues);
		}
		return {
			buffer,
			dispose: () => buffer.destroy()
		};
	}
}
