/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullTelemetryServiceShape } from '../../common/telemetryUtils.js';

/** Records the treatments of the `experimentTrigger` events logged through it. */
export class TestExperimentTriggerTelemetryService extends NullTelemetryServiceShape {
	readonly triggers: string[] = [];

	override publicLog2(eventName?: string, data?: object): void {
		const treatmentName = eventName === 'experimentTrigger' && data ? Object.entries(data).find(([key]) => key === 'treatmentName')?.[1] : undefined;
		if (typeof treatmentName === 'string') {
			this.triggers.push(treatmentName);
		}
	}
}
