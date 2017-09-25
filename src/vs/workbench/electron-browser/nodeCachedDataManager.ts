/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { basename } from 'path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

declare type OnNodeCachedDataArgs = [{ errorCode: string, path: string, detail?: string }, { path: string, length: number }];
declare const MonacoEnvironment: { onNodeCachedData: OnNodeCachedDataArgs[] };

export class NodeCachedDataManager {

	private readonly _telemetryService: ITelemetryService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
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
				this._telemetryService.publicLog('cachedDataError', {
					errorCode: err.errorCode,
					path: basename(err.path)
				});
			}
		}

		// log summary
		this._telemetryService.publicLog('cachedDataInfo', {
			didRequestCachedData: Boolean(global.require.getConfig().nodeCachedDataDir),
			didRejectCachedData,
			didProduceCachedData
		});

		global.require.config({ onNodeCachedData: undefined });
		delete MonacoEnvironment.onNodeCachedData;
	}
}
