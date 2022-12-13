/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { posix } from 'vs/base/common/path';
import { hash } from 'vs/base/common/hash';

class ResourcePerformanceMarks {

	constructor(@ITelemetryService telemetryService: ITelemetryService) {

		type Entry = {
			hosthash: string;
			name: string;
			duration: number;
		};
		type EntryClassifify = {
			owner: 'jrieken';
			comment: 'Resource performance numbers';
			hosthash: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Hash of the hostname' };
			name: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Resource basename' };
			duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Resource duration' };
		};
		for (const item of performance.getEntriesByType('resource')) {

			try {
				const url = new URL(item.name);
				const name = posix.basename(url.pathname);

				telemetryService.publicLog2<Entry, EntryClassifify>('startup.resource.perf', {
					hosthash: `H${hash(url.host).toString(16)}`,
					name,
					duration: item.duration
				});
			} catch {
				// ignore
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	ResourcePerformanceMarks,
	LifecyclePhase.Eventually
);
