/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { IRequestOptions, IRequestContext, IRequestFunction, request } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IRequestService, IHTTPConfiguration } from 'vs/platform/request/node/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
export class RequestService implements IRequestService {

	_serviceBrand: any;

	private proxyUrl: string;
	private strictSSL: boolean;
	private authorization: string;
	private disposables: IDisposable[] = [];

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private logService: ILogService
	) {
		this.configure(configurationService.getValue<IHTTPConfiguration>());
		configurationService.onDidChangeConfiguration(() => this.configure(configurationService.getValue()), this, this.disposables);
	}

	private configure(config: IHTTPConfiguration) {
		this.proxyUrl = config.http && config.http.proxy;
		this.strictSSL = config.http && config.http.proxyStrictSSL;
		this.authorization = config.http && config.http.proxyAuthorization;
	}

	async request(options: IRequestOptions, requestFn: IRequestFunction = request): TPromise<IRequestContext> {
		this.logService.trace('RequestService#request', options.url);

		const { proxyUrl, strictSSL } = this;

		options.agent = options.agent || await getProxyAgent(options.url, { proxyUrl, strictSSL });
		options.strictSSL = strictSSL;

		if (this.authorization) {
			options.headers = assign(options.headers || {}, { 'Proxy-Authorization': this.authorization });
		}

		return requestFn(options);
	}
}
