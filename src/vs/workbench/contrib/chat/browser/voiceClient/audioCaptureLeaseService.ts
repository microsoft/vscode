/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IAudioCaptureLeaseService = createDecorator<IAudioCaptureLeaseService>('audioCaptureLeaseService');

export interface IAudioCaptureLeaseService {
	readonly _serviceBrand: undefined;
	acquire(owner: string): IDisposable | undefined;
}

export class AudioCaptureLeaseService implements IAudioCaptureLeaseService {
	declare readonly _serviceBrand: undefined;

	private _owner: string | undefined;

	acquire(owner: string): IDisposable | undefined {
		if (this._owner) {
			return undefined;
		}
		this._owner = owner;
		return toDisposable(() => {
			if (this._owner === owner) {
				this._owner = undefined;
			}
		});
	}
}
