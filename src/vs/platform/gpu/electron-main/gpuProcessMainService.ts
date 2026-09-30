/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { App, Details, GPUFeatureStatus } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IGPUProcessExit {
	readonly reason: Details['reason'];
}

export const IGPUProcessMainService = createDecorator<IGPUProcessMainService>('gpuProcessMainService');

export interface IGPUProcessMainService {
	readonly _serviceBrand: undefined;

	/** Undefined until GPU information is available, or while the GPU process is recovering. */
	readonly featureStatus: GPUFeatureStatus | undefined;
	readonly onDidUpdateFeatureStatus: Event<GPUFeatureStatus | undefined>;
	readonly onDidExitProcess: Event<IGPUProcessExit>;
}

export class GPUProcessMainService extends Disposable implements IGPUProcessMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidUpdateFeatureStatus = this._register(new Emitter<GPUFeatureStatus | undefined>());
	readonly onDidUpdateFeatureStatus = this._onDidUpdateFeatureStatus.event;

	private readonly _onDidExitProcess = this._register(new Emitter<IGPUProcessExit>());
	readonly onDidExitProcess = this._onDidExitProcess.event;

	private _featureStatus: GPUFeatureStatus | undefined;
	get featureStatus(): GPUFeatureStatus | undefined { return this._featureStatus; }

	constructor(private readonly app: App) {
		super();

		this._register(Event.fromNodeEventEmitter(app, 'gpu-info-update')(() => this.refreshFeatureStatus()));
		this._register(Event.fromNodeEventEmitter<Details>(app, 'child-process-gone', (_event: Electron.Event, details: Details) => details)(details => {
			if (details.type === 'GPU') {
				// Electron retains the pre-exit status until the next gpu-info-update.
				this.updateFeatureStatus(undefined);
				this._onDidExitProcess.fire({ reason: details.reason });
			}
		}));
		this.refreshFeatureStatus();
	}

	private refreshFeatureStatus(): void {
		const featureStatus = this.app.getGPUFeatureStatus();
		this.updateFeatureStatus(featureStatus.gpu_compositing ? featureStatus : undefined);
	}

	private updateFeatureStatus(featureStatus: GPUFeatureStatus | undefined): void {
		if (!equals(this._featureStatus, featureStatus)) {
			this._featureStatus = featureStatus ? { ...featureStatus } : undefined;
			this._onDidUpdateFeatureStatus.fire(this._featureStatus);
		}
	}
}
