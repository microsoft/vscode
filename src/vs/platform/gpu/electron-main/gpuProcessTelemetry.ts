/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GPUFeatureStatus } from 'electron';
import { Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IGPULogMessage } from '../../diagnostics/common/diagnostics.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IGPUProcessMainService } from './gpuProcessMainService.js';

export class GPUProcessTelemetry extends Disposable {

	constructor(
		private readonly getGPULogMessages: () => readonly IGPULogMessage[],
		@IGPUProcessMainService gpuProcessMainService: IGPUProcessMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		const gpuInfoUpdate = Event.filter<undefined, GPUFeatureStatus>(gpuProcessMainService.onDidUpdateFeatureStatus, (status): status is GPUFeatureStatus => status !== undefined, this._store);
		const isGraphiteEnabled = (status: (GPUFeatureStatus & { skia_graphite?: string }) | undefined) => status?.skia_graphite === 'enabled' || status?.skia_graphite === 'enabled_on';
		const registerCrashListener = () => {
			const pendingGpuInfoListener = this._register(new MutableDisposable());
			this._register(gpuProcessMainService.onDidExitProcess(({ reason }) => {
				if (reason === 'crashed') {
					pendingGpuInfoListener.value = Event.once(gpuInfoUpdate)(status => this.reportFallback(status));
				}
			}));
		};
		if (isGraphiteEnabled(gpuProcessMainService.featureStatus)) {
			registerCrashListener();
		} else {
			// Initial feature status can report Graphite disabled before GPU initialization completes.
			this._register(Event.onceIf(gpuInfoUpdate, isGraphiteEnabled)(registerCrashListener));
		}
	}

	private reportFallback(gpuFeatureStatus: GPUFeatureStatus): void {
		if (gpuFeatureStatus.rasterization === 'enabled') {
			return;
		}

		const gpuLogMessages = this.getGPULogMessages().slice(-10).map(log => log.message);
		type GpuCrashEvent = {
			readonly gpuFeatureStatus: string;
			readonly gpuLogMessages: string;
		};
		type GpuCrashClassification = {
			gpuFeatureStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Current GPU feature status.' };
			gpuLogMessages: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Last 10 GPU log messages collected after the crash and GPU process restart.' };
			owner: 'deepak1556';
			comment: 'Tracks GPU process crashes that would result in fallback mode.';
		};

		this.telemetryService.publicLog2<GpuCrashEvent, GpuCrashClassification>('gpu.crash.fallback', {
			gpuFeatureStatus: JSON.stringify(gpuFeatureStatus),
			gpuLogMessages: JSON.stringify(gpuLogMessages)
		});
	}
}
