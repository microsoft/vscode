/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { HeartbeatConstants, IHeartbeatService } from 'vs/platform/terminal/common/terminal';

export class HeartbeatService extends Disposable implements IHeartbeatService {
	private readonly _onBeat = this._register(new Emitter<void>());
	readonly onBeat = this._onBeat.event;

	constructor() {
		super();

		const interval = setInterval(() => {
			this._onBeat.fire();
		}, HeartbeatConstants.BeatInterval);
		this._register(toDisposable(() => clearInterval(interval)));
	}
}
