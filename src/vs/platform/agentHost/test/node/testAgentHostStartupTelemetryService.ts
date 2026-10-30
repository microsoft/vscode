/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../base/test/common/mock.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';

export class TestAgentHostStartupTelemetryService extends mock<ITelemetryService>() {
	override telemetryLevel = TelemetryLevel.USAGE;
	readonly events: { eventName: string; data: ITelemetryData | undefined }[] = [];
	readonly commonProperties = new Map<string, string | boolean>();

	override publicLog2(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	override setCommonProperty(name: string, value: string | boolean | undefined): void {
		if (value === undefined) {
			this.commonProperties.delete(name);
		} else {
			this.commonProperties.set(name, value);
		}
	}
}
