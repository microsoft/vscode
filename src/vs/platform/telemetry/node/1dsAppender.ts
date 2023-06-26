/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IPayloadData, IXHROverride } from '@microsoft/1ds-post-js';
import * as https from 'https';
import { AbstractOneDataSystemAppender, IAppInsightsCore } from 'vs/platform/telemetry/common/1dsAppender';


export class OneDataSystemAppender extends AbstractOneDataSystemAppender {

	constructor(
		isInternalTelemetry: boolean,
		eventPrefix: string,
		defaultData: { [key: string]: any } | null,
		iKeyOrClientFactory: string | (() => IAppInsightsCore), // allow factory function for testing
	) {
		// Override the way events get sent since node doesn't have XHTMLRequest
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
							const responseString = responseData.toString();
							const response: { acc?: number; rej?: number } = JSON.parse(responseString);
							if (response.rej) {
								console.error('OneDataSystemAppender: Some events were rejected', payload.data);
							}
							oncomplete(res.statusCode ?? 200, res.headers as Record<string, any>, responseString);
						});
						// On response with error send status of 0 and a blank response to oncomplete so we can retry events
						res.on('error', function (err) {
							console.error('OneDataSystemAppender: Endpoint responded with an error', err);
							oncomplete(0, {});
						});
					});
					req.write(payload.data);
					req.end();
				} catch (err) {
					console.error('OneDataSystemAppender: Failed to send event', err);
					// If it errors out, send status of 0 and a blank response to oncomplete so we can retry events
					oncomplete(0, {});
				}
			}
		};

		super(isInternalTelemetry, eventPrefix, defaultData, iKeyOrClientFactory, customHttpXHROverride);
	}
}
