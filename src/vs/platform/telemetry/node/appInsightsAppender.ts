/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as appInsights from 'applicationinsights';
import { isObject } from 'vs/base/common/types';
import { safeStringify, mixin } from 'vs/base/common/objects';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { ILogService } from 'vs/platform/log/common/log';

function getClient(aiKey: string): appInsights.TelemetryClient {

	let client: appInsights.TelemetryClient;
	if (appInsights.defaultClient) {
		client = new appInsights.TelemetryClient(aiKey);
		client.channel.setUseDiskRetryCaching(true);
	} else {
		appInsights.setup(aiKey)
			.setAutoCollectRequests(false)
			.setAutoCollectPerformance(false)
			.setAutoCollectExceptions(false)
			.setAutoCollectDependencies(false)
			.setAutoDependencyCorrelation(false)
			.setAutoCollectConsole(false)
			.setInternalLogging(false, false)
			.setUseDiskRetryCaching(true)
			.start();
		client = appInsights.defaultClient;
	}

	if (aiKey.indexOf('AIF-') === 0) {
		client.config.endpointUrl = 'https://vortex.data.microsoft.com/collect/v1';
	}
	return client;
}

interface Properties {
	[key: string]: string;
}

interface Measurements {
	[key: string]: number;
}

export class AppInsightsAppender implements ITelemetryAppender {

	private _aiClient?: appInsights.TelemetryClient;

	constructor(
		private _eventPrefix: string,
		private _defaultData: { [key: string]: any } | null,
		aiKeyOrClientFactory: string | (() => appInsights.ITelemetryClient), // allow factory function for testing
		@ILogService private _logService?: ILogService
	) {
		if (!this._defaultData) {
			this._defaultData = Object.create(null);
		}

		if (typeof aiKeyOrClientFactory === 'string') {
			this._aiClient = getClient(aiKeyOrClientFactory);
		} else if (typeof aiKeyOrClientFactory === 'function') {
			this._aiClient = aiKeyOrClientFactory();
		}
	}

	private static _getData(data?: any): { properties: Properties, measurements: Measurements } {

		const properties: Properties = Object.create(null);
		const measurements: Measurements = Object.create(null);

		const flat = Object.create(null);
		AppInsightsAppender._flaten(data, flat);

		for (let prop in flat) {
			// enforce property names less than 150 char, take the last 150 char
			prop = prop.length > 150 ? prop.substr(prop.length - 149) : prop;
			const value = flat[prop];

			if (typeof value === 'number') {
				measurements[prop] = value;

			} else if (typeof value === 'boolean') {
				measurements[prop] = value ? 1 : 0;

			} else if (typeof value === 'string') {
				//enforce property value to be less than 1024 char, take the first 1024 char
				properties[prop] = value.substring(0, 1023);

			} else if (typeof value !== 'undefined' && value !== null) {
				properties[prop] = value;
			}
		}

		return {
			properties,
			measurements
		};
	}

	private static _flaten(obj: any, result: { [key: string]: any }, order: number = 0, prefix?: string): void {
		if (!obj) {
			return;
		}

		for (let item of Object.getOwnPropertyNames(obj)) {
			const value = obj[item];
			const index = prefix ? prefix + item : item;

			if (Array.isArray(value)) {
				result[index] = safeStringify(value);

			} else if (value instanceof Date) {
				// TODO unsure why this is here and not in _getData
				result[index] = value.toISOString();

			} else if (isObject(value)) {
				if (order < 2) {
					AppInsightsAppender._flaten(value, result, order + 1, index + '.');
				} else {
					result[index] = safeStringify(value);
				}
			} else {
				result[index] = value;
			}
		}
	}

	log(eventName: string, data?: any): void {
		if (!this._aiClient) {
			return;
		}
		data = mixin(data, this._defaultData);
		data = AppInsightsAppender._getData(data);

		if (this._logService) {
			this._logService.trace(`telemetry/${eventName}`, data);
		}
		this._aiClient.trackEvent({
			name: this._eventPrefix + '/' + eventName,
			properties: data.properties,
			measurements: data.measurements
		});
	}

	dispose(): Promise<any> | undefined {
		if (this._aiClient) {
			return new Promise(resolve => {
				this._aiClient!.flush({
					callback: () => {
						// all data flushed
						this._aiClient = undefined;
						resolve(undefined);
					}
				});
			});
		}
		return undefined;
	}
}
