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
import {MainTelemetryService} from 'vs/platform/telemetry/browser/mainTelemetryService';
import {ITelemetryService, ITelemetryInfo, ITelemetryServiceConfig} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {Registry} from 'vs/platform/platform';


const TELEMETRY_SECTION_ID = 'telemetry';

class StorageKeys {
	public static MachineId: string = 'telemetry.machineId';
	public static InstanceId: string = 'telemetry.instanceId';
}

interface ITelemetryEvent {
	eventName: string;
	data?: any;
}

export class ElectronTelemetryService extends MainTelemetryService implements ITelemetryService {

	private static MAX_BUFFER_SIZE = 100;

	private _setupIds: TPromise<ITelemetryInfo>;
	private _buffer: ITelemetryEvent[];
	private _optInStatusLoaded: boolean;

	constructor(@IConfigurationService private configurationService: IConfigurationService, @IStorageService private storageService: IStorageService, config?: ITelemetryServiceConfig) {
		super(config);

		this._buffer = [];
		this._optInStatusLoaded = false;

		this.loadOptinSettings();
		this._setupIds = this.setupIds();
	}

	/**
	 * override the base getTelemetryInfo to make sure this information is not retrieved before it's ready
	 */
	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._setupIds;
	}
	/**
	 * override the base publicLog to prevent reporting any events before the optIn status is read from configuration
	 */
	public publicLog(eventName:string, data?: any): void {
		if (this._optInStatusLoaded) {
			super.publicLog(eventName, data);
		} else {
			// in case loading configuration is delayed, make sure the buffer does not grow beyond MAX_BUFFER_SIZE
			if (this._buffer.length > ElectronTelemetryService.MAX_BUFFER_SIZE) {
				this._buffer = [];
			}
			this._buffer.push({eventName: eventName, data: data});
		}
	}

	private flushBuffer(): void {
		let event: ITelemetryEvent = null;
		while(event = this._buffer.pop()) {
			super.publicLog(event.eventName, event.data);
		}
	}

	private loadOptinSettings(): void {
		this.configurationService.loadConfiguration(TELEMETRY_SECTION_ID).done(config => {
			this.config.userOptIn = config ? config.enableTelemetry : this.config.userOptIn;
			this._optInStatusLoaded = true;
			this.publicLog('optInStatus', {optIn: this.config.userOptIn});
			this.flushBuffer();
		});

		this.toUnbind.push(this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => {
			this.config.userOptIn = e.config && e.config[TELEMETRY_SECTION_ID] ? e.config[TELEMETRY_SECTION_ID].enableTelemetry : this.config.userOptIn;
		}));
	}

	private setupIds(): TPromise<ITelemetryInfo> {
		return TPromise.join([this.setupInstanceId(), this.setupMachineId()]).then(() => {
			return {
				machineId: this.machineId,
				instanceId: this.instanceId,
				sessionId: this.sessionId
			};
		});
	}

	private setupInstanceId(): TPromise<string> {
		let instanceId = this.storageService.get(StorageKeys.InstanceId);
		if (!instanceId) {
			instanceId = uuid.generateUuid();
			this.storageService.store(StorageKeys.InstanceId, instanceId);
		}
		this.instanceId = instanceId;
		return TPromise.as(this.instanceId);
	}

	private setupMachineId(): TPromise<string> {
		let machineId = this.storageService.get(StorageKeys.MachineId);
		if (machineId) {
			this.machineId = machineId;
			return TPromise.as(this.machineId);
		} else {
			return new TPromise((resolve, reject) => {
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

const configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
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