/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

class ResourcePerformanceMarks {

	constructor(@ITelemetryService telemetryService: ITelemetryService) {

		type Entry = { name: string; duration: number };
		type EntryClassifify = {
			owner: 'jrieken';
			comment: 'Resource performance numbers';
			name: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Resource name' };
			duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Resource duration' };
		};
		for (const item of performance.getEntriesByType('resource')) {
			telemetryService.publicLog2<Entry, EntryClassifify>('startup.resource.perf', {
				name: item.name,
				duration: item.duration
			});
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourcePerformanceMarks,
	'ResourcePerformanceMarks',
	LifecyclePhase.Eventually
);
