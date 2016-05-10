/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isObject} from 'vs/base/common/types';
import {safeStringify, mixin} from 'vs/base/common/objects';
import {TPromise} from 'vs/base/common/winjs.base';
import * as appInsights from 'applicationinsights';

export interface IAIAdapter {
	log(eventName: string, data?: any): void;
	logException(exception: any): void;
	dispose(): void;
}

namespace AI {

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

	export function getClient(aiKey: string): typeof appInsights.client {

		ensureAIEngineIsInitialized();

		const client = appInsights.getClient(aiKey);
		client.channel.setOfflineMode(true);
		client.context.tags[client.context.keys.deviceMachineName] = ''; //prevent App Insights from reporting machine name
		if (aiKey.indexOf('AIF-') === 0) {
			client.config.endpointUrl = 'https://vortex.data.microsoft.com/collect/v1';
		}
		return client;
	}
}

interface Properties {
	[key: string]: string;
}

interface Measurements {
	[key: string]: number;
}

export class AIAdapter implements IAIAdapter {

	private _aiClient: typeof appInsights.client;

	constructor(
		private _eventPrefix: string,
		private _additionalDataToLog: () => TPromise<{ [key: string]: any }>,
		clientFactoryOrAiKey: (() => typeof appInsights.client) | string // allow factory function for testing
	) {
		if (!this._additionalDataToLog) {
			this._additionalDataToLog = () => TPromise.as(undefined);
		}
		if (typeof clientFactoryOrAiKey === 'string') {
			this._aiClient = AI.getClient(clientFactoryOrAiKey);
		} else if (typeof clientFactoryOrAiKey === 'function') {
			this._aiClient = clientFactoryOrAiKey();
		}
	}

	private static _getData(data?: any): { properties: Properties, measurements: Measurements } {

		const properties: Properties = Object.create(null);
		const measurements: Measurements = Object.create(null);

		const flat = Object.create(null);
		AIAdapter._flaten(data, flat);

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

	private static _flaten(obj: any, result: {[key: string]: any }, order: number = 0, prefix?: string): void {
		if (!obj) {
			return;
		}

		for(var item of Object.getOwnPropertyNames(obj)){
			const value = obj[item];
			const index = prefix ? prefix + item : item;

			if (Array.isArray(value)) {
				result[index] = safeStringify(value);

			} else if (value instanceof Date) {
				// TODO unsure why this is here and not in _getData
				result[index] = value.toISOString();

			} else if (isObject(value)) {
				if (order < 2) {
					AIAdapter._flaten(value, result, order + 1, index + '.');
				} else {
					result[index] = safeStringify(value);
				}
			} else {
				result[index] = value;
			}
		}
	}

	public log(eventName: string, data?: any): void {
		if (!this._aiClient) {
			return;
		}
		this._additionalDataToLog().then(additionalData => {
			return mixin(data, additionalData);
		}, err => {
			console.error(err); // ignore?
			return data;
		}).done(data => {
			let {properties, measurements} = AIAdapter._getData(data);
			this._aiClient.trackEvent(this._eventPrefix + '/' + eventName, properties, measurements);
		});
	}

	public logException(exception: any): void {
		if (this._aiClient) {
			this._aiClient.trackException(exception);
		}
	}

	public dispose(): void {
		if (this._aiClient) {
			this._aiClient.sendPendingData(() => {
				// all data flushed
				this._aiClient = undefined;
			});
		}
	}
}