/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { basename } from 'path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

declare type OnNodeCachedDataArgs = [{ errorCode: string, path: string, detail?: string }, { path: string, length: number }];
declare const MonacoEnvironment: { onNodeCachedData: OnNodeCachedDataArgs[] };

export class NodeCachedDataManager implements IWorkbenchContribution {

	private readonly _telemetryService: ITelemetryService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this._telemetryService = telemetryService;
		this._handleCachedDataInfo();
	}

	private _handleCachedDataInfo(): void {

		let didRejectCachedData = false;
		let didProduceCachedData = false;
		for (const [err, data] of MonacoEnvironment.onNodeCachedData) {
			// build summary
			didRejectCachedData = didRejectCachedData || Boolean(err);
			didProduceCachedData = didProduceCachedData || Boolean(data);

			// log each failure separately
			if (err) {
				/* __GDPR__
					"cachedDataError" : {
						"errorCode" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
						"path": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
					}
				*/
				this._telemetryService.publicLog('cachedDataError', {
					errorCode: err.errorCode,
					path: basename(err.path)
				});
			}
		}

		// log summary
		/* __GDPR__
			"cachedDataInfo" : {
				"didRequestCachedData" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"didRejectCachedData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"didProduceCachedData": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		this._telemetryService.publicLog('cachedDataInfo', {
			didRequestCachedData: Boolean((<any>global).require.getConfig().nodeCachedDataDir),
			didRejectCachedData,
			didProduceCachedData
		});

		(<any>global).require.config({ onNodeCachedData: undefined });
		delete MonacoEnvironment.onNodeCachedData;
	}
}
