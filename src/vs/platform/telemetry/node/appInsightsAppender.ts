/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as appInsights from 'applicationinsights';
import { isObject } from 'vs/base/common/types';
import { safeStringify, mixin } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';

let _initialized = false;

function ensureAIEngineIsInitialized(): void {
	if (_initialized === false) {
		// we need to pass some fake key, otherwise AI throws an exception
		appInsights.setup('2588e01f-f6c9-4cd6-a348-143741f8d702')
			.setAutoCollectConsole(false)
			.setAutoCollectExceptions(false)
			.setAutoCollectPerformance(false)
			.setAutoCollectRequests(false);

		_initialized = true;
	}
}

function getClient(aiKey: string): typeof appInsights.client {

	ensureAIEngineIsInitialized();

	const client = appInsights.getClient(aiKey);
	client.channel.setOfflineMode(true);
	client.context.tags[client.context.keys.deviceMachineName] = ''; //prevent App Insights from reporting machine name
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

	private _aiClient: typeof appInsights.client;

	constructor(
		private _eventPrefix: string,
		private _defaultData: { [key: string]: any },
		aiKeyOrClientFactory: string | (() => typeof appInsights.client) // allow factory function for testing
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
			var value = flat[prop];

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

		for (var item of Object.getOwnPropertyNames(obj)) {
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
		let {properties, measurements} = AppInsightsAppender._getData(data);
		this._aiClient.trackEvent(this._eventPrefix + '/' + eventName, properties, measurements);
	}

	dispose(): TPromise<any> {
		if (this._aiClient) {
			return new TPromise(resolve => {
				this._aiClient.sendPendingData(() => {
					// all data flushed
					this._aiClient = undefined;
					resolve(void 0);
				});
			});
		}
		return undefined;
	}
}