/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import getmac = require('getmac');
import crypto = require('crypto');

import {MainTelemetryService, TelemetryServiceConfig} from 'vs/platform/telemetry/browser/mainTelemetryService';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService} from 'vs/platform/storage/common/storage';
import errors = require('vs/base/common/errors');
import uuid = require('vs/base/common/uuid');

class StorageKeys {
	public static MachineId: string = 'telemetry.machineId';
	public static InstanceId: string = 'telemetry.instanceId';
}

export class ElectronTelemetryService extends MainTelemetryService implements ITelemetryService {

	private _setupIds: Promise<ITelemetryInfo>;

	constructor( @IStorageService private storageService: IStorageService, config?: TelemetryServiceConfig) {
		super(config);

		this._setupIds = this.setupIds();
	}

	/**
	 * override the base getTelemetryInfo to make sure this information is not retrieved before it's ready
	 */
	public getTelemetryInfo(): Promise<ITelemetryInfo> {
		return this._setupIds;
	}

	private setupIds(): Promise<ITelemetryInfo> {
		return Promise.all([this.setupInstanceId(), this.setupMachineId()]).then(() => {
			return {
				machineId: this.machineId,
				instanceId: this.instanceId,
				sessionId: this.sessionId
			};
		});
	}

	private setupInstanceId(): Promise<string> {
		let instanceId = this.storageService.get(StorageKeys.InstanceId);
		if (!instanceId) {
			instanceId = uuid.generateUuid();
			this.storageService.store(StorageKeys.InstanceId, instanceId);
		}
		this.instanceId = instanceId;
		return Promise.resolve(this.instanceId);
	}

	private setupMachineId(): Promise<string> {
		let machineId = this.storageService.get(StorageKeys.MachineId);
		if (machineId) {
			this.machineId = machineId;
			return Promise.resolve(this.machineId);
		} else {
			return new Promise((resolve, reject) => {
				try {
					// add a unique machine id as a hash of the macAddress
					getmac.getMac((error, macAddress) => {
						if (!error) {
							// crypt machine id
							machineId = crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex');
						} else {
							// generate a UUID
							machineId = uuid.generateUuid();
						}

						this.machineId = machineId;
						this.storageService.store(StorageKeys.MachineId, machineId);
						resolve(this.machineId);
					});
				} catch (err) {
					errors.onUnexpectedError(err);

					// generate a UUID
					machineId = uuid.generateUuid();
					this.machineId = machineId;
					this.storageService.store(StorageKeys.MachineId, machineId);
					resolve(this.machineId);
				}
			});

		}
	}
}