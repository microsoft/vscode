/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullTelemetryServiceShape } from '../../common/telemetryUtils.js';

export class TestTelemetryService extends NullTelemetryServiceShape {
	constructor(readonly events: { readonly name: string; readonly data: unknown }[] = []) {
		super();
	}

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}
