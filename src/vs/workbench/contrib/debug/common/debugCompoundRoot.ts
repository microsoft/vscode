/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';

export class DebugCompoundRoot {
	private stopped = false;
	private stopEmitter = new Emitter<void>();

	onDidSessionStop = this.stopEmitter.event;

	sessionStopped(): void {
		if (!this.stopped) { // avoid sending extranous terminate events
			this.stopped = true;
			this.stopEmitter.fire();
		}
	}
}
