/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppInsightsCore, IExtendedConfiguration } from '@microsoft/1ds-core-js';
import type { IChannelConfiguration, IPayloadData, IXHROverride, PostChannel } from '@microsoft/1ds-post-js';
import * as https from 'https';
import { onUnexpectedError } from 'vs/base/common/errors';
import { mixin } from 'vs/base/common/objects';
import { ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';

async function getClient(instrumentationKey: string): Promise<AppInsightsCore> {
	const oneDs = await import('@microsoft/1ds-core-js');
	const postPlugin = await import('@microsoft/1ds-post-js');
	const appInsightsCore = new oneDs.AppInsightsCore();
	const collectorChannelPlugin: PostChannel = new postPlugin.PostChannel();
	// Configure the app insights core to send to collector++ and disable logging of debug info
	const coreConfig: IExtendedConfiguration = {
		instrumentationKey,
		endpointUrl: 'https://mobile.events.data.microsoft.com/OneCollector/1.0',
		loggingLevelTelemetry: 0,
		loggingLevelConsole: 0,
		channels: [[
			collectorChannelPlugin
		]]
	};

	// Setup the collector posting channel to utilize nodes HTTP request rather than webs
	if (coreConfig.extensionConfig) {
		const customHttpXHROverride: IXHROverride = {
			sendPOST: (payload: IPayloadData, oncomplete) => {
				const options = {
					method: 'POST',
					headers: {
						...payload.headers,
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(payload.data)
					}
				};
				try {
					const req = https.request(payload.urlString, options, res => {
						res.on('data', function (responseData) {
							oncomplete(res.statusCode ?? 200, res.headers as Record<string, any>, responseData.toString());
						});
						// On response with error send status of 0 and a blank response to oncomplete so we can retry events
						res.on('error', function (err) {
							oncomplete(0, {});
						});
					});
					req.write(payload.data);
					req.end();
				} catch {
					// If it errors out, send status of 0 and a blank response to oncomplete so we can retry events
					oncomplete(0, {});
				}
			}
		};
		// Configure the channel to use a XHR Request override since it's not available in node
		const channelConfig: IChannelConfiguration = {
			alwaysUseXhrOverride: true,
			httpXHROverride: customHttpXHROverride
		};
		coreConfig.extensionConfig[collectorChannelPlugin.identifier] = channelConfig;
	}

	appInsightsCore.initialize(coreConfig, []);

	appInsightsCore.addTelemetryInitializer((envelope) => {
		if (envelope.tags) {
			// Sets it to be internal only based on Windows UTC flagging
			envelope.tags['utc.flags'] = 0x0000811ECD;
		}
	});

	return appInsightsCore;
}


export class OneDataSystemAppender implements ITelemetryAppender {

	private _aiCore: AppInsightsCore | undefined;
	private _iKey: string | undefined;
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
			this._aiCore = iKeyOrClientFactory();
		} else {
			this._iKey = iKeyOrClientFactory;
		}
		this._asyncAiCore = null;
	}

	private _withAIClient(callback: (aiCore: AppInsightsCore) => void): void {
		if (!this._aiCore) {
			return;
		}

		if (this._aiCore) {
			callback(this._aiCore);
			return;
		}

		if (this._iKey && !this._asyncAiCore) {
			this._asyncAiCore = getClient(this._iKey);
			this._iKey = undefined;
		}

		this._asyncAiCore?.then(
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
		if (!this._aiCore) {
			return;
		}
		data = mixin(data, this._defaultData);
		data = validateTelemetryData(data);

		// Attempts to suppress https://github.com/microsoft/vscode/issues/140624
		try {
			this._withAIClient((aiClient) => aiClient.track({
				name: this._eventPrefix + '/' + eventName,
				data: { ...data.properties, ...data.measurements },

			}));
		} catch { }
	}

	flush(): Promise<any> {
		if (this._aiCore) {
			return new Promise(resolve => {
				this._withAIClient((aiClient) => {
					aiClient.unload(true, () => {
						this._aiCore = undefined;
						resolve(undefined);
					});
				});
			});
		}
		return Promise.resolve(undefined);
	}
}
