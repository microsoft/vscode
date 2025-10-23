/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugModel, IDebugSession, AdapterEndEvent } from './debug.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Debugger } from './debugger.js';

export class DebugTelemetry {

	constructor(
		private readonly model: IDebugModel,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	logDebugSessionStart(dbgr: Debugger, launchJsonExists: boolean) {
		const extension = dbgr.getMainExtensionDescriptor();
		/* __GDPR__
			"debugSessionStart" : {
				"owner": "connor4312",
				"type": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"exceptionBreakpoints": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"extensionName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true},
				"launchJsonExists": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('debugSessionStart', {
			type: dbgr.type,
			breakpointCount: this.model.getBreakpoints().length,
			exceptionBreakpoints: this.model.getExceptionBreakpoints(),
			watchExpressionsCount: this.model.getWatchExpressions().length,
			extensionName: extension.identifier.value,
			isBuiltin: extension.isBuiltin,
			launchJsonExists
		});
	}

	logDebugSessionStop(session: IDebugSession, adapterExitEvent: AdapterEndEvent) {

		const breakpoints = this.model.getBreakpoints();

		/* __GDPR__
			"debugSessionStop" : {
				"owner": "connor4312",
				"type" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"sessionLengthInSeconds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"breakpointCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"watchExpressionsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('debugSessionStop', {
			type: session && session.configuration.type,
			success: adapterExitEvent.emittedStopped || breakpoints.length === 0,
			sessionLengthInSeconds: adapterExitEvent.sessionLengthInSeconds,
			breakpointCount: breakpoints.length,
			watchExpressionsCount: this.model.getWatchExpressions().length
		});
	}
}
