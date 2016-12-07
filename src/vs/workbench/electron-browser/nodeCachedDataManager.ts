/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { dirname, basename, join } from 'vs/base/common/paths';
import { readdir, rimraf } from 'vs/base/node/pfs';
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

		this._handleCachedDataErrors();
		this._manageCachedDataSoon();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	private _handleCachedDataErrors(): void {
		const onNodeCachedDataError = (err) => {
			this._telemetryService.publicLog('nodeCachedData', { errorCode: err.errorCode, path: err.path });
		};

		// handle future and past errors
		(<any>self).require.config({ onNodeCachedDataError }, true);
		(<any[]>(<any>window).MonacoEnvironment.nodeCachedDataErrors).forEach(onNodeCachedDataError);
		delete (<any>window).MonacoEnvironment.nodeCachedDataErrors;

		// stop when being disposed
		this._disposables.push({
			dispose() {
				(<any>self).require.config({ onNodeCachedDataError: undefined }, true);
			}
		});
	}

	private _manageCachedDataSoon(): void {
		// Cached data is stored as user data in directories like `CachedData/1.8.0`.
		// This function makes sure to delete cached data from previous versions,
		// like `CachedData/1.7.2`.

		const {nodeCachedDataDir} = this._environmentService;
		if (!nodeCachedDataDir) {
			return;
		}

		let handle = setTimeout(() => {
			handle = undefined;

			const nodeCachedDataDirname = dirname(nodeCachedDataDir);
			const nodeCachedDataBasename = basename(nodeCachedDataDir);

			readdir(nodeCachedDataDirname).then(entries => {

				const deletes = entries.map(entry => {
					if (entry !== nodeCachedDataBasename) {
						return rimraf(join(nodeCachedDataDirname, entry));
					}
				});

				return TPromise.join(deletes);

			}).done(undefined, onUnexpectedError);

		}, 30 * 1000);

		this._disposables.push({
			dispose() { clearTimeout(handle); }
		});
	}
}
