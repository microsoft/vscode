/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetryReporter } from '../experimentTelemetryReporter';

export interface TelemetryProperties {
	readonly [prop: string]: string | number | boolean | undefined;
}

export interface TelemetryReporter {
	logTelemetry(eventName: string, properties?: TelemetryProperties): void;
	logTraceEvent(tracePoint: string, correlationId: string, command?: string): void;
}

export class VSCodeTelemetryReporter implements TelemetryReporter {
	constructor(
		private readonly reporter: IExperimentationTelemetryReporter | undefined,
		private readonly clientVersionDelegate: () => string
	) { }

	public logTelemetry(eventName: string, properties: { [prop: string]: string } = {}) {
		const reporter = this.reporter;
		if (!reporter) {
			return;
		}

		/* __GDPR__FRAGMENT__
			"TypeScriptCommonProperties" : {
				"version" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		properties['version'] = this.clientVersionDelegate();

		reporter.postEventObj(eventName, properties);
	}

	public logTraceEvent(point: string, id: string, data?: string): void {
		const event: { point: string; id: string; data?: string | undefined } = {
			point,
			id
		};
		if (data) {
			event.data = data;
		}

		/* __GDPR__
			"typeScriptExtension.trace" : {
				"owner": "dirkb",
				"${include}": [
					"${TypeScriptCommonProperties}"
				],
				"point" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The trace point." },
				"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The traceId is used to correlate the request with other trace points." },
				"data": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Additional data" }
			}
		*/
		this.logTelemetry('typeScriptExtension.trace', event);
	}
}
