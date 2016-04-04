/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/* tslint:disable:semicolon */

import errors = require('vs/base/common/errors');
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {AIAdapter, IAIAdapter} from 'vs/base/node/aiAdapter';

import winreg = require('winreg');
import os = require('os');

class StorageKeys {
	public static sqmUserId: string = 'telemetry.sqm.userId';
	public static sqmMachineId: string = 'telemetry.sqm.machineId';
	public static lastSessionDate: string = 'telemetry.lastSessionDate';
	public static firstSessionDate: string = 'telemetry.firstSessionDate';
}

export class NodeAppInsightsTelemetryAppender implements ITelemetryAppender {

	public static EVENT_NAME_PREFIX: string = 'monacoworkbench';

	private static SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';

	private storageService:IStorageService;
	private contextService: IWorkspaceContextService;

	private appInsights: IAIAdapter;
	private appInsightsVortex: IAIAdapter;

	protected commonProperties: {[key:string] : string};
	protected commonMetrics: {[key: string]: number};

	constructor(
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		/* for test only */
		client: any
	) {
		this.commonProperties = {};
		this.commonMetrics = {};

		this.contextService = contextService;
		this.storageService = storageService;

		let config = this.contextService.getConfiguration().env.aiConfig;
		let key = config ? config.key: null;
		let asimovKey = config ? config.asimovKey: null;

		// for test
		if (client) {
			this.appInsights = client;

			if (asimovKey) {
				this.appInsightsVortex = client;
			}
			return;
		}

		if (key) {
			this.appInsights = new AIAdapter(key, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX);
		}

		if(asimovKey) {
			this.appInsightsVortex = new AIAdapter(asimovKey, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX);
		}

		this.loadAddtionaProperties();
	}

	private loadAddtionaProperties(): void {
		// add shell & render version
		if (process.versions) {
			this.commonProperties['version.shell'] = (<any>process).versions['electron'];
			this.commonProperties['version.renderer'] = (<any>process).versions['chrome'];
		}

		// add SQM data for windows machines
		if (process.platform === 'win32') {
			var sqmUserId = this.storageService.get(StorageKeys.sqmUserId);
			if (sqmUserId) {
				this.commonProperties['sqm.userid'] = sqmUserId;
			} else {
				this.getWinRegKeyData(NodeAppInsightsTelemetryAppender.SQM_KEY, 'UserId', winreg.HKCU, (error, result: string) => {
					if (!error && result) {
						this.commonProperties['sqm.userid'] = result;
						this.storageService.store(StorageKeys.sqmUserId, result);
					}
				});
			}

			var sqmMachineId = this.storageService.get(StorageKeys.sqmMachineId);
			if (sqmMachineId) {
				this.commonProperties['sqm.machineid'] = sqmMachineId;
			}
			else {
				this.getWinRegKeyData(NodeAppInsightsTelemetryAppender.SQM_KEY, 'MachineId', winreg.HKLM,(error, result) => {
					if (!error && result) {
						this.commonProperties['sqm.machineid'] = result;
						this.storageService.store(StorageKeys.sqmMachineId, result);
					}
				});
			}
		}

		var firstSessionDate = this.storageService.get(StorageKeys.firstSessionDate);
		if(!firstSessionDate) {
			firstSessionDate = (new Date()).toUTCString();
			this.storageService.store(StorageKeys.firstSessionDate, firstSessionDate);
		}
		this.commonProperties['firstSessionDate'] = firstSessionDate;

		//report last session date and isNewSession flag
		var lastSessionDate = this.storageService.get(StorageKeys.lastSessionDate);
		if(!lastSessionDate) {
			this.commonMetrics['isNewSession'] = 1;
		} else {
			this.commonMetrics['isNewSession'] = 0;
			this.commonProperties['lastSessionDate'] = lastSessionDate;
		}

		this.storageService.store(StorageKeys.lastSessionDate, (new Date()).toUTCString());

		if (os) {
			this.commonProperties['osVersion'] = os.release();
		}
	}

	private getWinRegKeyData(key: string, name: string, hive: string, callback: (error: Error, userId: string) => void): void {
		if (process.platform === 'win32') {
			try {
				var reg = new winreg({
					hive: hive,
					key: key
				});

				reg.get(name, (e, result) => {
					if (e || !result) {
						callback(e, null);
					} else {
						callback(null, result.value);
					}
				});
			} catch (err) {
				errors.onUnexpectedError(err);
				callback(err, null);
			}
		} else {
			callback(null, null);
		}
	}

	public log(eventName: string, data?: any): void {

		data = data || Object.create(null);
		data = this.addCommonMetrics(data);
		data = this.addCommonProperties(data);

		if (this.appInsights) {
			this.appInsights.log(eventName, data);
		}

		if (this.appInsightsVortex) {
			this.appInsightsVortex.log(eventName, data);
		}
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

	protected addCommonProperties(properties: any): any {
		for (var prop in this.commonProperties) {
			properties['common.' + prop] = this.commonProperties[prop];
		}
		return properties;
	}

	protected addCommonMetrics(metrics: any): any {
		for (var prop in this.commonMetrics) {
			metrics['common.' + prop] = this.commonMetrics[prop];
		}
		return metrics;
	}
}