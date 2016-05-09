/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import getmac = require('getmac');
import crypto = require('crypto');
import winreg = require('winreg');
import os = require('os');
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import * as uuid from 'vs/base/common/uuid';
import {TelemetryService, ITelemetryServiceConfig} from 'vs/platform/telemetry/browser/telemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {Registry} from 'vs/platform/platform';

const TELEMETRY_SECTION_ID = 'telemetry';

namespace StorageKeys {
	export const MachineId = 'telemetry.machineId';
	export const InstanceId = 'telemetry.instanceId';
	export const sqmUserId: string = 'telemetry.sqm.userId';
	export const sqmMachineId: string = 'telemetry.sqm.machineId';
	export const lastSessionDate: string = 'telemetry.lastSessionDate';
	export const firstSessionDate: string = 'telemetry.firstSessionDate';
	export const SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';
}

export function getDefaultProperties(storageService: IStorageService): TPromise<{ [name: string]: string }> {
	let result: { [name: string]: any } = Object.create(null);

	// add shell & render version
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

	// promise based properties
	result['common.instanceId'] = getOrCreateInstanceId(storageService);
	result['common.machineId'] = getOrCreateMachineId(storageService);
	if (process.platform === 'win32') {
		result['common.sqm.userid'] = getSqmUserId(storageService);
		result['common.sqm.machineid'] = getSqmMachineId(storageService);
	}

	return TPromise.join(result);
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

export class ElectronTelemetryService extends TelemetryService implements ITelemetryService {

	constructor(
		configuration: ITelemetryServiceConfig,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IWorkspaceContextService contextService:IWorkspaceContextService
	) {
		super(configuration, contextService);

		this._updateUserOptIn();
		this._configurationService.onDidUpdateConfiguration(this._updateUserOptIn, this, this._disposables);
		this.publicLog('optInStatus', { optIn: this._configuration.userOptIn });
	}

	private _updateUserOptIn(): void {
		const config = this._configurationService.getConfiguration<any>(TELEMETRY_SECTION_ID);
		this._configuration.userOptIn = config ? config.enableTelemetry : this._configuration.userOptIn;
	}
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 20,
	'type': 'object',
	'title': nls.localize('telemetryConfigurationTitle', "Telemetry configuration"),
	'properties': {
		'telemetry.enableTelemetry': {
			'type': 'boolean',
			'description': nls.localize('telemetry.enableTelemetry', "Enable usage data and errors to be sent to Microsoft."),
			'default': true
		}
	}
});