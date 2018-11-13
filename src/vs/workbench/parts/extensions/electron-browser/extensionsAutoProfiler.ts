/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService, IResponsiveStateChangeEvent, ICpuProfilerTarget, IExtensionHostProfile } from 'vs/workbench/services/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Disposable } from 'vs/base/common/lifecycle';
import { timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ILogService } from 'vs/platform/log/common/log';

export class ExtensionsAutoProfiler extends Disposable implements IWorkbenchContribution {

	private readonly _session = new Map<ICpuProfilerTarget, boolean>();

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(extensionService.onDidChangeResponsiveChange(this._onDidChangeResponsiveChange, this));
	}

	private _onDidChangeResponsiveChange(event: IResponsiveStateChangeEvent): void {
		const { target } = event;

		if (!target.canProfileExtensionHost()) {
			return;
		}

		if (!this._session.has(target)) {
			this._session.set(target, true);
			this._profileNSeconds(target).then(profile => {
				this._processCpuProfile(profile);
				this._session.delete(target);
			}).catch(err => {
				onUnexpectedError(err);
				this._session.delete(target);
			});
		}
	}

	private _profileNSeconds(target: ICpuProfilerTarget, seconds: number = 5): Promise<IExtensionHostProfile> {
		return target.startExtensionHostProfile().then(session => {
			return timeout(seconds * 1000).then(() => session.stop());
		});
	}

	private _processCpuProfile(profile: IExtensionHostProfile) {

		interface NamedSlice {
			id: string;
			total: number;
			percentage: number;
		}

		let data: NamedSlice[] = [];
		for (let i = 0; i < profile.ids.length; i++) {
			let id = profile.ids[i];
			let total = profile.deltas[i];
			data.push({ id, total, percentage: 0 });
		}

		// merge data by identifier
		let anchor = 0;
		data.sort((a, b) => a.id.localeCompare(b.id));
		for (let i = 1; i < data.length; i++) {
			if (data[anchor].id === data[i].id) {
				data[anchor].total += data[i].total;
			} else {
				anchor += 1;
				data[anchor] = data[i];
			}
		}
		data = data.slice(0, anchor + 1);

		const duration = profile.endTime - profile.startTime;
		const percentage = duration / 100;
		let top: NamedSlice | undefined;
		for (const slice of data) {
			slice.percentage = Math.round(slice.total / percentage);
			if (!top || top.percentage < slice.percentage) {
				top = slice;
			}
		}

		this._logService.warn(`UNRESPONSIVE extension host, '${top ? top.id : 'unknown'}' took ${top ? top.percentage : 'unknown'}% of ${duration / 1e3}ms`, data);

		/* __GDPR__
			"exthostunresponsive" : {
				"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"data": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		*/
		this._telemetryService.publicLog('exthostunresponsive', {
			duration: duration / 1e3,
			data
		});
	}
}
