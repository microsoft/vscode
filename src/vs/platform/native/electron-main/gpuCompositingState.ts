/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IGPUProcessMainService } from '../../gpu/electron-main/gpuProcessMainService.js';

export class GPUCompositingState extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<boolean>());
	readonly onDidChange = this._onDidChange.event;

	private _enabled: boolean;
	get enabled(): boolean {
		return this._enabled;
	}

	constructor(@IGPUProcessMainService gpuProcessMainService: IGPUProcessMainService) {
		super();

		this._enabled = gpuProcessMainService.featureStatus?.gpu_compositing === 'enabled';
		this._register(gpuProcessMainService.onDidUpdateFeatureStatus(status => {
			const enabled = status?.gpu_compositing === 'enabled';
			if (this._enabled !== enabled) {
				this._enabled = enabled;
				this._onDidChange.fire(enabled);
			}
		}));
	}
}
