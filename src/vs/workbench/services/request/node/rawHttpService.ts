/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { IXHRResponse } from 'vs/base/common/http';
import { request, IRequestOptions } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { createGunzip } from 'zlib';
import { Stream } from 'stream';

export interface IXHROptions extends IRequestOptions {
	responseType?: string;
	followRedirects: number;
}

let proxyUrl: string = null;
let strictSSL: boolean = true;

export function configure(_proxyUrl: string, _strictSSL: boolean): void {
	proxyUrl = _proxyUrl;
	strictSSL = _strictSSL;
}

export function xhr(options: IXHROptions): TPromise<IXHRResponse> {
	const agent = getProxyAgent(options.url, { proxyUrl, strictSSL });
	options = assign({}, options);
	options = assign(options, { agent, strictSSL });

	return request(options).then(result => new TPromise<IXHRResponse>((c, e, p) => {
		const res = result.res;
		let stream: Stream = res;

		if (res.headers['content-encoding'] === 'gzip') {
			stream = stream.pipe(createGunzip());
		}

		const data: string[] = [];
		stream.on('data', c => data.push(c));
		stream.on('end', () => {
			const status = res.statusCode;

			if (options.followRedirects > 0 && (status >= 300 && status <= 303 || status === 307)) {
				let location = res.headers['location'];
				if (location) {
					let newOptions = {
						type: options.type, url: location, user: options.user, password: options.password, responseType: options.responseType, headers: options.headers,
						timeout: options.timeout, followRedirects: options.followRedirects - 1, data: options.data
					};
					xhr(newOptions).done(c, e, p);
					return;
				}
			}

			const response: IXHRResponse = {
				responseText: data.join(''),
				status,
				getResponseHeader: header => res.headers[header],
				readyState: 4
			};

			if ((status >= 200 && status < 300) || status === 1223) {
				c(response);
			} else {
				e(response);
			}
		});
	}, err => {
		let message: string;

		if (agent) {
			message = 'Unable to to connect to ' + options.url + ' through a proxy . Error: ' + err.message;
		} else {
			message = 'Unable to to connect to ' + options.url + '. Error: ' + err.message;
		}

		return TPromise.wrapError<IXHRResponse>({
			responseText: message,
			status: 404
		});
	}));
}
