/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { Url, parse as parseUrl } from 'url';
import { request, IRequestOptions } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';

export interface IXHROptions extends IRequestOptions {
	responseType?: string;
	followRedirects: number;
}

export interface IXHRResponse {
	responseText: string;
	status: number;
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
	options = assign(options, { agent });

	return request(options).then(result => new TPromise<IXHRResponse>((c, e, p) => {
		let res = result.res;
		let data: string[] = [];
		res.on('data', c => data.push(c));
		res.on('end', () => {
			if (options.followRedirects > 0 && (res.statusCode >= 300 && res.statusCode <= 303 || res.statusCode === 307)) {
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

			let response: IXHRResponse = {
				responseText: data.join(''),
				status: res.statusCode
			};

			if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 1223) {
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
