/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IPayloadData, IXHROverride } from '@microsoft/1ds-post-js';
import { streamToBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRequestOptions } from 'vs/base/parts/request/common/request';
import { IRequestService } from 'vs/platform/request/common/request';
import { AbstractOneDataSystemAppender, IAppInsightsCore } from 'vs/platform/telemetry/common/1dsAppender';

/**
 * Completes a request to submit telemetry to the server utilizing the request service
 * @param options The options which will be used to make the request
 * @param requestService The request service
 * @returns An object containing the headers, statusCode, and responseData
 */
async function makeTelemetryRequest(options: IRequestOptions, requestService: IRequestService) {
	const response = await requestService.request(options, CancellationToken.None);
	const responseData = (await streamToBuffer(response.stream)).toString();
	const statusCode = response.res.statusCode ?? 200;
	const headers = response.res.headers as Record<string, any>;
	return {
		headers,
		statusCode,
		responseData
	};
}

/**
 * Complete a request to submit telemetry to the server utilizing the https module. Only used when the request service is not available
 * @param options The options which will be used to make the request
 * @param httpsModule The https node module
 * @returns An object containing the headers, statusCode, and responseData
 */
function makeLegacyTelemetryRequest(options: IRequestOptions, httpsModule: typeof import('https')) {
	const httpsOptions = {
		method: options.type,
		headers: options.headers
	};
	const req = httpsModule.request(options.url ?? '', httpsOptions, res => {
		res.on('data', function (responseData) {
			return {
				headers: res.headers as Record<string, any>,
				statusCode: res.statusCode ?? 200,
				responseData: responseData.toString()
			};
		});
		// On response with error send status of 0 and a blank response to oncomplete so we can retry events
		res.on('error', function (err) {
			throw err;
		});
	});
	req.write(options.data);
	req.end();
	return;
}


export class OneDataSystemAppender extends AbstractOneDataSystemAppender {

	constructor(
		requestService: IRequestService | undefined,
		isInternalTelemetry: boolean,
		eventPrefix: string,
		defaultData: { [key: string]: any } | null,
		iKeyOrClientFactory: string | (() => IAppInsightsCore), // allow factory function for testing
	) {
		let httpsModule: typeof import('https') | undefined;
		if (!requestService) {
			httpsModule = require('https');
		}
		// Override the way events get sent since node doesn't have XHTMLRequest
		const customHttpXHROverride: IXHROverride = {
			sendPOST: (payload: IPayloadData, oncomplete) => {

				const telemetryRequestData = typeof payload.data === 'string' ? payload.data : new TextDecoder().decode(payload.data);
				const requestOptions: IRequestOptions = {
					type: 'POST',
					headers: {
						...payload.headers,
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(payload.data).toString()
					},
					url: payload.urlString,
					data: telemetryRequestData
				};

				try {
					if (requestService) {
						makeTelemetryRequest(requestOptions, requestService).then(({ statusCode, headers, responseData }) => {
							oncomplete(statusCode, headers, responseData);
						});
					} else {
						if (!httpsModule) {
							throw new Error('https module is undefined');
						}
						makeLegacyTelemetryRequest(requestOptions, httpsModule);
					}
				} catch {
					// If it errors out, send status of 0 and a blank response to oncomplete so we can retry events
					oncomplete(0, {});
				}
			}
		};

		super(isInternalTelemetry, eventPrefix, defaultData, iKeyOrClientFactory, customHttpXHROverride);
	}
}
