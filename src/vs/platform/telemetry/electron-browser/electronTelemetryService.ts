/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import getmac = require('getmac');
import crypto = require('crypto');

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
}

export function getDefaultProperties(storageService: IStorageService, contextService: IWorkspaceContextService): TPromise<{ [name: string]: string }> {
	let result: { [name: string]: TPromise<string> } = Object.create(null);
	result['common.instanceId'] = getOrCreateInstanceId(storageService);
	result['common.machineId'] = getOrCreateMachineId(storageService);
	result['version'] = TPromise.as(contextService.getConfiguration().env.version);
	result['commitHash'] = TPromise.as(contextService.getConfiguration().env.commitHash);
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