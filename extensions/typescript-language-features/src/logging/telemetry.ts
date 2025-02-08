/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExperimentationTelemetryReporter } from '../experimentTelemetryReporter';

export interface TelemetryProperties {
	readonly [prop: string]: string | number | boolean | undefined;
}

export interface TelemetryReporter {
	logTelemetry(eventName: string, properties?: TelemetryProperties): void;
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
}
