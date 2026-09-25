/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { App, Details, GPUFeatureStatus } from 'electron';
import { EventEmitter } from 'events';
import { mock } from '../../../../base/test/common/mock.js';

export function createFeatureStatus(): GPUFeatureStatus {
	return {
		'2d_canvas': 'enabled',
		flash_3d: 'disabled_off',
		flash_stage3d: 'disabled_off',
		flash_stage3d_baseline: 'disabled_off',
		gpu_compositing: 'enabled',
		multiple_raster_threads: 'enabled',
		native_gpu_memory_buffers: 'enabled',
		rasterization: 'enabled',
		video_decode: 'enabled',
		video_encode: 'enabled',
		vpx_decode: 'enabled',
		webgl: 'enabled',
		webgl2: 'enabled',
	};
}

export class TestApp extends mock<App>() {
	readonly events = new EventEmitter();
	reads = 0;

	constructor(public status = createFeatureStatus()) {
		super();
	}

	override getGPUFeatureStatus(): GPUFeatureStatus {
		this.reads++;
		return this.status;
	}

	override on(event: string, listener: Parameters<EventEmitter['on']>[1]): this {
		this.events.on(event, listener);
		return this;
	}

	override removeListener(event: string, listener: Parameters<EventEmitter['removeListener']>[1]): this {
		this.events.removeListener(event, listener);
		return this;
	}

	update(status = this.status): void {
		this.status = status;
		this.events.emit('gpu-info-update');
	}

	emitProcessExit(reason: Details['reason'], type: Details['type'] = 'GPU'): void {
		this.events.emit('child-process-gone', undefined, { type, reason, exitCode: 1 } satisfies Details);
	}
}
