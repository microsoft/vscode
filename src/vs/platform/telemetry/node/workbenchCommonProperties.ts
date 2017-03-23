/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as winreg from 'winreg';
import * as os from 'os';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as uuid from 'vs/base/common/uuid';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { getMachineId, virtualMachineHint } from 'vs/base/node/id';
import { resolveCommonProperties, machineIdStorageKey } from '../node/commonProperties';

const SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';

export function resolveWorkbenchCommonProperties(storageService: IStorageService, commit: string, version: string): TPromise<{ [name: string]: string }> {
	return resolveCommonProperties(commit, version).then(result => {
		result['common.version.shell'] = process.versions && (<any>process).versions['electron'];
		result['common.version.renderer'] = process.versions && (<any>process).versions['chrome'];
		result['common.osVersion'] = os.release();
		result['common.virtualMachineHint'] = virtualMachineHint.value().toString();

		const lastSessionDate = storageService.get('telemetry.lastSessionDate');
		const firstSessionDate = storageService.get('telemetry.firstSessionDate') || new Date().toUTCString();
		storageService.store('telemetry.firstSessionDate', firstSessionDate);
		storageService.store('telemetry.lastSessionDate', new Date().toUTCString());

		result['common.firstSessionDate'] = firstSessionDate;
		result['common.lastSessionDate'] = lastSessionDate;
		result['common.isNewSession'] = !lastSessionDate ? '1' : '0';

		const promises: TPromise<any>[] = [];
		promises.push(getOrCreateInstanceId(storageService).then(value => result['common.instanceId'] = value));
		promises.push(getOrCreateMachineId(storageService).then(value => result['common.machineId'] = value));

		if (process.platform === 'win32') {
			promises.push(getSqmUserId(storageService).then(value => result['common.sqm.userid'] = value));
			promises.push(getSqmMachineId(storageService).then(value => result['common.sqm.machineid'] = value));
		}

		return TPromise.join(promises).then(() => result);
	});
}

function getOrCreateInstanceId(storageService: IStorageService): TPromise<string> {
	let result = storageService.get('telemetry.instanceId') || uuid.generateUuid();
	storageService.store('telemetry.instanceId', result);
	return TPromise.as(result);
}

export function getOrCreateMachineId(storageService: IStorageService): TPromise<string> {
	let result = storageService.get(machineIdStorageKey);

	if (result) {
		return TPromise.as(result);
	}

	return getMachineId().then(result => {
		storageService.store(machineIdStorageKey, result);
		return result;
	});
}

function getSqmUserId(storageService: IStorageService): TPromise<string> {
	var sqmUserId = storageService.get('telemetry.sqm.userId');
	if (sqmUserId) {
		return TPromise.as(sqmUserId);
	}
	return getWinRegKeyData(SQM_KEY, 'UserId', winreg.HKCU).then(result => {
		if (result) {
			storageService.store('telemetry.sqm.userId', result);
			return result;
		}
		return undefined;
	});
}

function getSqmMachineId(storageService: IStorageService): TPromise<string> {
	let sqmMachineId = storageService.get('telemetry.sqm.machineId');
	if (sqmMachineId) {
		return TPromise.as(sqmMachineId);
	}
	return getWinRegKeyData(SQM_KEY, 'MachineId', winreg.HKLM).then(result => {
		if (result) {
			storageService.store('telemetry.sqm.machineId', result);
			return result;
		}
		return undefined;
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
