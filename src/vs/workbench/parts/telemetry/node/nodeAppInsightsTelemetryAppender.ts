/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import {safeStringify} from 'vs/base/common/objects';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

import winreg = require('winreg');
import os = require('os');
import appInsights = require('applicationinsights');

class StorageKeys {
	public static sqmUserId: string = 'telemetry.sqm.userId';
	public static sqmMachineId: string = 'telemetry.sqm.machineId';
	public static lastSessionDate: string = 'telemetry.lastSessionDate';
	public static firstSessionDate: string = 'telemetry.firstSessionDate';
}

export class NodeAppInsightsTelemetryAppender implements ITelemetryAppender {

	public static EVENT_NAME_PREFIX: string = 'monacoworkbench/';

	private static SQM_KEY: string = '\\Software\\Microsoft\\SQMClient';

	private storageService:IStorageService;
	private contextService: IWorkspaceContextService;

	private appInsights: typeof appInsights.client;
	private appInsightsVortex: typeof appInsights.client;

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
			this.appInsights = appInsights.setup(key)
			.setAutoCollectRequests(false)
			.setAutoCollectPerformance(false)
			.setAutoCollectExceptions(false)
			.setOfflineMode(true)
			.start()
			.client;

			this.setupAIClient(this.appInsights);
		}

		if(asimovKey) {
			this.appInsightsVortex = appInsights.getClient(asimovKey);
			this.appInsightsVortex.config.endpointUrl = 'https://vortex.data.microsoft.com/collect/v1';
			this.setupAIClient(this.appInsightsVortex);
		}

		this.loadAddtionaProperties();
	}

	private setupAIClient(client: typeof appInsights.client): void {
		//prevent App Insights from reporting machine name
		if (client && client.context &&
			client.context.keys && client.context.tags) {
			var machineNameKey = client.context.keys.deviceMachineName;
			client.context.tags[machineNameKey] = '';
		}
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

	private getData(data?: any): any {
		var properties: {[key: string]: string;} = {};
		var measurements: {[key: string]: number;} = {};

		var event_data = this.flaten(data);
		for(var prop in event_data) {
			// enforce property names less than 150 char, take the last 150 char
			var propName = prop && prop.length > 150 ? prop.substr( prop.length - 149) : prop;
			var property = event_data[prop];
			if (types.isNumber(property)) {
				measurements[propName] = property;

			} else if (types.isBoolean(property)) {
				measurements[propName] = property ? 1:0;
			} else if (types.isString(property)) {
				//enforce proeprty value to be less than 1024 char, take the first 1024 char
				var propValue = property && property.length > 1024 ? property.substring(0, 1023): property;
				properties[propName] = propValue;
			} else if (!types.isUndefined(property) && property !== null) {
				properties[propName] = property;
			}
		}

		properties = this.addCommonProperties(properties);
		measurements = this.addCommonMetrics(measurements);

		return {
			properties: properties,
			measurements: measurements
		};
	}

	private flaten(obj:any, order:number = 0, prefix? : string): any {
		var result:{[key:string]: any} = {};
		var properties = obj ? Object.getOwnPropertyNames(obj) : [];
		for (var i =0; i < properties.length; i++) {
			var item = properties[i];
			var index = prefix ? prefix + item : item;

			if (types.isArray(obj[item])) {
				try {
					result[index] = safeStringify(obj[item]);
				} catch (e) {
					// workaround for catching the edge case for #18383
					// safe stringfy should never throw circular object exception
					result[index] = '[Circular-Array]';
				}
			} else if (obj[item] instanceof Date) {
				result[index] = (<Date> obj[item]).toISOString();
			} else if (types.isObject(obj[item])) {
				if (order < 2) {
					var item_result = this.flaten(obj[item], order + 1, index + '.');
					for (var prop in item_result) {
						result[prop] = item_result[prop];
					}
				} else {
					try {
						result[index] = safeStringify(obj[item]);
					} catch (e) {
						// workaround for catching the edge case for #18383
						// safe stringfy should never throw circular object exception
						result[index] = '[Circular]';
					}
				}
			} else {
				result[index] = obj[item];
			}
		}
		return result;
	}

	public log(eventName: string, data?: any): void {
		var result = this.getData(data);

		if (this.appInsights) {
			if (eventName === 'UnhandledError' && data) {
				this.appInsights.trackException(data);
			}

			this.appInsights.trackEvent(NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+eventName, result.properties, result.measurements);
		}

		if (this.appInsightsVortex) {
			if (eventName === 'UnhandledError' && data) {
				this.appInsightsVortex.trackException(data);
			}
			this.appInsightsVortex.trackEvent(NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+eventName, result.properties, result.measurements);
		}
	}

	public dispose(): void {
		this.appInsights = null;
		this.appInsightsVortex = null;
	}

	protected addCommonProperties(properties: { [key: string]: string }): any {
		for (var prop in this.commonProperties) {
			properties['common.' + prop] = this.commonProperties[prop];
		}
		return properties;
	}

	protected addCommonMetrics = function (metrics: { [key: string]: number }): any {
		for (var prop in this.commonMetrics) {
			metrics['common.' + prop] = this.commonMetrics[prop];
		}
		return metrics;
	}
}