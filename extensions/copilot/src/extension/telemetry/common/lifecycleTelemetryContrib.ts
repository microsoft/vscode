/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IExtensionContribution } from '../../common/contributions';

export class LifecycleTelemetryContrib implements IExtensionContribution {
	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		telemetryService.sendGHTelemetryEvent('extension.activate');
	}

	dispose(): void {
		this.telemetryService.sendGHTelemetryEvent('extension.deactivate');
	}
}