/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';

type NesActivationStatusEvent = {
	activated: boolean;
	timestamp: number;
	context: string;
};

type NesActivationStatusClassification = {
	owner: 'copilot';
	comment: 'Tracks the activation status of Neural Edit Synthesis (NES) feature';
	activated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether NES was activated.' };
	timestamp: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'When the activation occurred.' };
	context: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The context in which activation occurred.' };
};

export class NesActivationStatusTelemetryContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		telemetryService: ITelemetryService,
	) {
		super();
		this.telemetryService = telemetryService;
		this.reportActivationStatus();
	}

	private readonly telemetryService: ITelemetryService;

	private reportActivationStatus(): void {
		// Fixed: Using publicLog2 for feature insight telemetry
		this.telemetryService.publicLog2<NesActivationStatusEvent, NesActivationStatusClassification>('nesActivationStatus', {
			activated: true,
			timestamp: Date.now(),
			context: 'initialization'
		});
	}
}