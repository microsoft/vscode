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
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {Registry} from 'vs/platform/platform';

const TELEMETRY_SECTION_ID = 'telemetry';

namespace StorageKeys {
	export const MachineId = 'telemetry.machineId';
	export const InstanceId = 'telemetry.instanceId';
}

export class ElectronTelemetryService extends TelemetryService implements ITelemetryService {

	private _telemetryInfoPromise: TPromise<ITelemetryInfo>;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService,
		@IStorageService private _storageService: IStorageService,
		configuration?: ITelemetryServiceConfig
	) {
		super(configuration);

		this._telemetryInfoPromise = this._setupTelemetryInfo();
		this._updateUserOptIn();
		this._configurationService.onDidUpdateConfiguration(this._updateUserOptIn, this, this._disposables);
		this.publicLog('optInStatus', {optIn: this._configuration.userOptIn});
	}

	private _updateUserOptIn():void {
		const config = this._configurationService.getConfiguration<any>(TELEMETRY_SECTION_ID);
		this._configuration.userOptIn = config ? config.enableTelemetry : this._configuration.userOptIn;
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._telemetryInfoPromise;
	}

	private _setupTelemetryInfo(): TPromise<ITelemetryInfo> {

		let instanceId: string, machineId: string;

		return new TPromise<this>(resolve => {
			// (1) instance identifier (from storage or fresh)
			instanceId = this._storageService.get(StorageKeys.InstanceId) || uuid.generateUuid();
			this._storageService.store(StorageKeys.InstanceId, instanceId);

			// (2) machine identifier (from stroage or fresh)
			machineId = this._storageService.get(StorageKeys.MachineId);
			if (machineId) {
				return resolve(this);
			}

			// add a unique machine id as a hash of the macAddress
			try {
				getmac.getMac((error, macAddress) => {
					if (!error) {
						// crypt machine id
						machineId = crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex');
					} else {
						machineId = uuid.generateUuid(); // fallback, generate a UUID
					}
					this._telemetryInfo.machineId = machineId;
					this._storageService.store(StorageKeys.MachineId, machineId);
					resolve(this);
				});
			} catch (err) {
				errors.onUnexpectedError(err);
				machineId = uuid.generateUuid(); // fallback, generate a UUID
				this._storageService.store(StorageKeys.MachineId, machineId);
				resolve(this);
			}

		}).then(() => {
			this._telemetryInfo.instanceId = instanceId;
			this._telemetryInfo.machineId = machineId;
			return this._telemetryInfo;
		});
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