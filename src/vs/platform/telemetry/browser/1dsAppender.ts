/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppInsightsCore, IExtendedConfiguration } from '@microsoft/1ds-core-js';
import type { PostChannel } from '@microsoft/1ds-post-js';
import { onUnexpectedError } from 'vs/base/common/errors';
import { mixin } from 'vs/base/common/objects';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';

const endpointUrl = 'https://mobile.events.data.microsoft.com/OneCollector/1.0';

async function getClient(instrumentationKey: string): Promise<AppInsightsCore> {
	const oneDs = await import('@microsoft/1ds-core-js');
	const postPlugin = await import('@microsoft/1ds-post-js');
	const appInsightsCore = new oneDs.AppInsightsCore();
	const collectorChannelPlugin: PostChannel = new postPlugin.PostChannel();
	// Configure the app insights core to send to collector++ and disable logging of debug info
	const coreConfig: IExtendedConfiguration = {
		instrumentationKey,
		endpointUrl,
		loggingLevelTelemetry: 0,
		loggingLevelConsole: 0,
		disableCookiesUsage: true,
		disableDbgExt: true,
		disableInstrumentationKeyValidation: true,
		channels: [[
			collectorChannelPlugin
		]]
	};

	appInsightsCore.initialize(coreConfig, []);

	appInsightsCore.addTelemetryInitializer((envelope) => {
		envelope['ext'] = envelope['ext'] ?? {};
		envelope['ext']['utc'] = envelope['ext']['utc'] ?? {};
		// Sets it to be internal only based on Windows UTC flagging
		envelope['ext']['utc']['flags'] = 0x0000811ECD;
	});

	return appInsightsCore;
}

// TODO @lramos15 maybe make more in line with src/vs/platform/telemetry/browser/appInsightsAppender.ts with caching support
export class OneDataSystemWebAppender implements ITelemetryAppender {

	private _aiCoreOrKey: AppInsightsCore | string | undefined;
	private _asyncAiCore: Promise<AppInsightsCore> | null;

	constructor(
		private _eventPrefix: string,
		private _defaultData: { [key: string]: any } | null,
		iKeyOrClientFactory: string | (() => AppInsightsCore), // allow factory function for testing
	) {
		if (!this._defaultData) {
			this._defaultData = Object.create(null);
		}

		if (typeof iKeyOrClientFactory === 'function') {
			this._aiCoreOrKey = iKeyOrClientFactory();
		} else {
			this._aiCoreOrKey = iKeyOrClientFactory;
		}
		this._asyncAiCore = null;

		// If we cannot fetch the endpoint it means it is down and we should not send any telemetry.
		// This is most likely due to ad blockers
		fetch(endpointUrl, { method: 'POST' }).catch(err => {
			this._aiCoreOrKey = undefined;
		});
	}

	private _withAIClient(callback: (aiCore: AppInsightsCore) => void): void {
		if (!this._aiCoreOrKey) {
			return;
		}

		if (typeof this._aiCoreOrKey !== 'string') {
			callback(this._aiCoreOrKey);
			return;
		}

		if (!this._asyncAiCore) {
			this._asyncAiCore = getClient(this._aiCoreOrKey);
		}

		this._asyncAiCore.then(
			(aiClient) => {
				callback(aiClient);
			},
			(err) => {
				onUnexpectedError(err);
				console.error(err);
			}
		);
	}

	log(eventName: string, data?: any): void {
		if (!this._aiCoreOrKey) {
			return;
		}
		data = mixin(data, this._defaultData);
		data = validateTelemetryData(data);

		try {
			this._withAIClient((aiClient) => aiClient.track({
				name: this._eventPrefix + '/' + eventName,
				data,

			}));
		} catch { }
	}

	flush(): Promise<any> {
		if (this._aiCoreOrKey) {
			return new Promise(resolve => {
				this._withAIClient((aiClient) => {
					aiClient.unload(true, () => {
						this._aiCoreOrKey = undefined;
						resolve(undefined);
					});
				});
			});
		}
		return Promise.resolve(undefined);
	}
}
