/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import {TPromise} from 'vs/base/common/winjs.base';
import {mixin} from 'vs/base/common/objects';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {AIAdapter, IAIAdapter} from 'vs/base/node/aiAdapter';
import winreg = require('winreg');
import os = require('os');

export namespace StorageKeys {
	export const sqmUserId: string = 'telemetry.sqm.userId';
	export const sqmMachineId: string = 'telemetry.sqm.machineId';
	export const lastSessionDate: string = 'telemetry.lastSessionDate';
	export const firstSessionDate: string = 'telemetry.firstSessionDate';
}

export class AppInsightsAppender implements ITelemetryAppender {

	private static EVENT_NAME_PREFIX: string = 'monacoworkbench';
	private static SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';

	private appInsights: IAIAdapter;
	private appInsightsVortex: IAIAdapter;
	private _additionalProperties: TPromise<{ [key: string]: any }>;

	constructor(
		@IStorageService storageService: IStorageService,
		config: {key: string; asimovKey: string},
		_testing_client?: IAIAdapter
	) {
		let {key, asimovKey} = config;
		if (_testing_client) {
			// for test
			this.appInsights = _testing_client;
			if (asimovKey) {
				this.appInsightsVortex = _testing_client;
			}
		} else {
			if (key) {
				this.appInsights = new AIAdapter(AppInsightsAppender.EVENT_NAME_PREFIX, undefined, key);
			}
			if (asimovKey) {
				this.appInsightsVortex = new AIAdapter(AppInsightsAppender.EVENT_NAME_PREFIX, undefined, asimovKey);
			}
		}

		this._additionalProperties = AppInsightsAppender._loadAddtionalProperties(storageService);
	}

	private static _loadAddtionalProperties(storageService: IStorageService): TPromise<{ [key: string]: any }> {

		const result: { [key: string]: any } = Object.create(null);
		let promises: TPromise<any>[] = [];

		// add shell & render version
		if (process.versions) {
			result['common.version.shell'] = (<any>process).versions['electron'];
			result['common.version.renderer'] = (<any>process).versions['chrome'];
		}

		// add SQM data for windows machines
		if (process.platform === 'win32') {
			var sqmUserId = storageService.get(StorageKeys.sqmUserId);
			if (sqmUserId) {
				result['common.sqm.userid'] = sqmUserId;
			} else {
				promises.push(AppInsightsAppender._getWinRegKeyData(AppInsightsAppender.SQM_KEY, 'UserId', winreg.HKCU).then(result => {
					if (result) {
						result['common.sqm.userid'] = result;
						storageService.store(StorageKeys.sqmUserId, result);
					}
				}));
			}

			var sqmMachineId = storageService.get(StorageKeys.sqmMachineId);
			if (sqmMachineId) {
				result['common.sqm.machineid'] = sqmMachineId;
			}
			else {
				promises.push(AppInsightsAppender._getWinRegKeyData(AppInsightsAppender.SQM_KEY, 'MachineId', winreg.HKLM).then(result => {
					if (result) {
						result['common.sqm.machineid'] = result;
						storageService.store(StorageKeys.sqmMachineId, result);
					}
				}));
			}
		}

		var firstSessionDate = storageService.get(StorageKeys.firstSessionDate);
		if (!firstSessionDate) {
			firstSessionDate = (new Date()).toUTCString();
			storageService.store(StorageKeys.firstSessionDate, firstSessionDate);
		}
		result['common.firstSessionDate'] = firstSessionDate;

		//report last session date and isNewSession flag
		var lastSessionDate = storageService.get(StorageKeys.lastSessionDate);
		if (!lastSessionDate) {
			result['common.isNewSession'] = 1;
		} else {
			result['common.isNewSession'] = 0;
			result['common.lastSessionDate'] = lastSessionDate;
		}

		storageService.store(StorageKeys.lastSessionDate, (new Date()).toUTCString());

		if (os) {
			result['common.osVersion'] = os.release();
		}

		return TPromise.join(promises).then(() => result, () => result);
	}

	private static _getWinRegKeyData(key: string, name: string, hive: string): TPromise<string> {
		return new TPromise<string>((resolve, reject) => {
			if (process.platform === 'win32') {
				try {
					var reg = new winreg({ hive, key });
					reg.get(name, (e, result) => {
						if (e || !result) {
							reject(null);
						} else {
							resolve(result.value);
						}
					});
				} catch (err) {
					errors.onUnexpectedError(err);
					reject(err);
				}
			} else {
				resolve(null);
			}
		}).then(undefined, err => {
			// we only want success
			return undefined;
		});
	}

	public log(eventName: string, data?: any): TPromise<any> {
		return this._additionalProperties.then(additionalProperties => {
			data = mixin(data, additionalProperties);
			if (this.appInsights) {
				this.appInsights.log(eventName, data);
			}
			if (this.appInsightsVortex) {
				this.appInsightsVortex.log(eventName, data);
			}
		});
	}

	public dispose(): void {
		if (this.appInsights) {
			this.appInsights.dispose();
		}
		if (this.appInsightsVortex) {
			this.appInsightsVortex.dispose();
		}
		this.appInsights = null;
		this.appInsightsVortex = null;
	}
}