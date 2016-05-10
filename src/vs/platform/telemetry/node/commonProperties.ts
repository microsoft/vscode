/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as getmac from 'getmac';
import * as crypto from 'crypto';
import * as winreg from 'winreg';
import * as Platform from 'vs/base/common/platform';
import * as os from 'os';
import {TPromise} from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as uuid from 'vs/base/common/uuid';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';


namespace StorageKeys {
	export const MachineId = 'telemetry.machineId';
	export const InstanceId = 'telemetry.instanceId';
	export const sqmUserId: string = 'telemetry.sqm.userId';
	export const sqmMachineId: string = 'telemetry.sqm.machineId';
	export const lastSessionDate: string = 'telemetry.lastSessionDate';
	export const firstSessionDate: string = 'telemetry.firstSessionDate';
	export const SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';
}

export function resolveCommonProperties(storageService: IStorageService, contextService: IWorkspaceContextService): TPromise<{ [name: string]: string }> {

	let result: { [name: string]: any } = Object.create(null);

	result['sessionID'] = uuid.generateUuid() + Date.now();
	result['commitHash'] = contextService.getConfiguration().env.commitHash;

	// add shell & render version
	result['version'] = contextService.getConfiguration().env.version;
	result['common.version.shell'] = process.versions && (<any>process).versions['electron'];
	result['common.version.renderer'] = process.versions && (<any>process).versions['chrome'];
	result['common.osVersion'] = os.release();

	// session dates, first, last, isNewSession
	const lastSessionDate = storageService.get(StorageKeys.lastSessionDate);
	const firstSessionDate = storageService.get(StorageKeys.firstSessionDate) || new Date().toUTCString();
	storageService.store(StorageKeys.firstSessionDate, firstSessionDate);
	storageService.store(StorageKeys.lastSessionDate, new Date().toUTCString());
	result['common.firstSessionDate'] = firstSessionDate;
	result['common.lastSessionDate'] = lastSessionDate;
	result['common.isNewSession'] = !lastSessionDate ? 1 : 0;

	// dynamic properties which value differs on each call
	let seq = 0;
	const startTime = Date.now();
	Object.defineProperties(result, {
		'timestamp': {
			get: () => new Date(),
			enumerable: true
		},
		'common.timesincesessionstart': {
			get: () => Date.now() - startTime,
			enumerable: true
		},
		'common.platform': {
			get: () => Platform.Platform[Platform.platform],
			enumerable: true
		},
		'common.sequence': {
			get: () => seq++,
			enumerable: true
		}
	});

	// promise based properties
	let promises: TPromise<any>[] = [];
	promises.push(getOrCreateInstanceId(storageService).then(value => result['common.instanceId'] = value));
	promises.push(getOrCreateMachineId(storageService).then(value => result['common.machineId'] = value));
	if (process.platform === 'win32') {
		promises.push(getSqmUserId(storageService).then(value => result['common.sqm.userid']= value));
		promises.push(getSqmMachineId(storageService).then(value => result['common.sqm.machineid']= value));
	}

	return TPromise.join(promises).then(_ => result);
}

function getOrCreateInstanceId( storageService: IStorageService): TPromise<string> {
	let result = storageService.get(StorageKeys.InstanceId) || uuid.generateUuid();
	storageService.store(StorageKeys.InstanceId, result);
	return TPromise.as(result);
}

function getOrCreateMachineId(storageService: IStorageService): TPromise<string> {
	return new TPromise<string>(resolve => {
		let result = storageService.get(StorageKeys.MachineId);
		if (result) {
			return resolve(result);
		}
		// add a unique machine id as a hash of the macAddress
		try {
			getmac.getMac((error, macAddress) => {
				if (!error) {
					// crypt machine id
					result = crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex');
				} else {
					result = uuid.generateUuid(); // fallback, generate a UUID
				}
				resolve(result);
			});
		} catch (err) {
			errors.onUnexpectedError(err);
			resolve(uuid.generateUuid()); // fallback, generate a UUID
		}
	}).then(result => {
		storageService.store(StorageKeys.MachineId, result);
		return result;
	});
}

function getSqmUserId(storageService: IStorageService): TPromise<string> {
	var sqmUserId = storageService.get(StorageKeys.sqmUserId);
	if (sqmUserId) {
		return TPromise.as(sqmUserId);
	}
	return getWinRegKeyData(StorageKeys.SQM_KEY, 'UserId', winreg.HKCU).then(result => {
		if (result) {
			storageService.store(StorageKeys.sqmUserId, result);
			return result;
		}
	});
}

function getSqmMachineId(storageService: IStorageService): TPromise<string> {
	let sqmMachineId = storageService.get(StorageKeys.sqmMachineId);
	if (sqmMachineId) {
		return TPromise.as(sqmMachineId);
	}
	return getWinRegKeyData(StorageKeys.SQM_KEY, 'MachineId', winreg.HKLM).then(result => {
		if (result) {
			storageService.store(StorageKeys.sqmMachineId, result);
			return result;
		}
	});
}

function getWinRegKeyData(key: string, name: string, hive: string): TPromise<string> {
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
