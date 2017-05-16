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


export class NodeCachedDataManager {

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
		const onNodeCachedData = (err, data) => {
			console.log('onNodeCachedDatare', err, data);
			if (err) {
				this._telemetryService.publicLog('nodeCachedData', { errorCode: err.errorCode, path: basename(err.path) });
			} else if (data) {
				this._telemetryService.publicLog('nodeCachedDataProduced', { path: basename(data.path) });
			}
		};

		// handle future and past errors
		(<any>self).require.config({ onNodeCachedData });
		delete (<any>window).MonacoEnvironment.onNodeCachedData;
		(<any[]>(<any>window).MonacoEnvironment.onNodeCachedData).forEach(args => onNodeCachedData.apply(undefined, args));

		// stop when being disposed
		this._disposables.push({
			dispose() {
				(<any>self).require.config({ onNodeCachedData: undefined }, true);
			}
		});
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
				const limit = 1000 * 60 * 60 * 24 * 30 * 3; // roughly 3 months

				const deletes = entries.map(entry => {
					const path = join(nodeCachedDataDir, entry);
					return stat(path).then(stats => {
						const diff = now - stats.mtime.getTime();
						if (diff > limit) {
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
