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

		type Entry = { name: string, duration: number };
		const data: Entry[] = [];
		for (const item of performance.getEntriesByType('resource')) {
			data.push({ name: item.name, duration: item.duration });
			const out = JSON.stringify(data);
			if (out.length > 5000) {
				telemetryService.publicLog2<
					{ out: string },
					{ out: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth'; } }
				>('startup.resource.perf', { out });
				data.length = 0;
			}
		}

		if (data.length > 0) {
			telemetryService.publicLog2<
				{ out: string },
				{ out: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth'; } }
			>('startup.resource.perf', { out: JSON.stringify(data) });
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourcePerformanceMarks,
	LifecyclePhase.Eventually
);
