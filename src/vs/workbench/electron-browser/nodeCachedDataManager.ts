/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { join, basename } from 'path';
import { readdir, rimraf, stat } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import product from 'vs/platform/node/product';

declare type OnNodeCachedDataArgs = [{ errorCode: string, path: string, detail?: string }, { path: string, length: number }];
declare const MonacoEnvironment: { onNodeCachedData: OnNodeCachedDataArgs[] };

export class NodeCachedDataManager {

	private static _DataMaxAge = product.nameLong.indexOf('Insiders') >= 0
		? 1000 * 60 * 60 * 24 * 7 // roughly 1 week
		: 1000 * 60 * 60 * 24 * 30 * 3; // roughly 3 months

	private _telemetryService: ITelemetryService;
	private _environmentService: IEnvironmentService;
	private _disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		this._telemetryService = telemetryService;
		this._environmentService = environmentService;

		this._handleCachedDataInfo();
		this._manageCachedDataSoon();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
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

	private _manageCachedDataSoon(): void {
		// Cached data is stored as user data and we run a cleanup task everytime
		// the editor starts. The strategy is to delete all files that are older than
		// 3 months

		const { nodeCachedDataDir } = this._environmentService;
		if (!nodeCachedDataDir) {
			return;
		}

		let handle = setTimeout(() => {
			handle = undefined;

			readdir(nodeCachedDataDir).then(entries => {

				const now = Date.now();
				const deletes = entries.map(entry => {
					const path = join(nodeCachedDataDir, entry);
					return stat(path).then(stats => {
						const diff = now - stats.mtime.getTime();
						if (diff > NodeCachedDataManager._DataMaxAge) {
							return rimraf(path);
						}
						return undefined;
					});
				});

				return TPromise.join(deletes);

			}).done(undefined, onUnexpectedError);

		}, 30 * 1000);

		this._disposables.push({
			dispose() { clearTimeout(handle); }
		});
	}
}
