/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AppInsightsCore } from '@microsoft/1ds-core-js';
import type { IPayloadData, IXHROverride } from '@microsoft/1ds-post-js';
import * as https from 'https';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AbstractOneDataSystemAppender } from 'vs/platform/telemetry/common/1dsAppender';


export class OneDataSystemAppender extends AbstractOneDataSystemAppender {

	constructor(
		configurationService: IConfigurationService,
		eventPrefix: string,
		defaultData: { [key: string]: any } | null,
		iKeyOrClientFactory: string | (() => AppInsightsCore), // allow factory function for testing
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

		super(configurationService, eventPrefix, defaultData, iKeyOrClientFactory, customHttpXHROverride);
	}
}
