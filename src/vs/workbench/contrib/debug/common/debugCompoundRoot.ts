/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugCompoundRoot } from 'vs/workbench/contrib/debug/common/debug';
import { Emitter } from 'vs/base/common/event';

export class DebugCompoundRoot implements IDebugCompoundRoot {
	private stopped = false;
	private stopEmitter = new Emitter<void>();

	onShouldSessionsStop = this.stopEmitter.event;

	didStop(): void {
		if (!this.stopped) { // avoid sending extranous terminate events
			this.stopped = true;
			this.stopEmitter.fire();
		}
	}
}

export const stubCompoundRoot: IDebugCompoundRoot = {
	onShouldSessionsStop: new Emitter<void>().event,
	didStop: () => undefined,
};
