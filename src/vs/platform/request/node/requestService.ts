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
import { IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';

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
		@IConfigurationService configurationService: IConfigurationService
	) {
		this.configure(configurationService.getConfiguration<IHTTPConfiguration>());
		configurationService.onDidUpdateConfiguration(this.onDidUpdateConfiguration, this, this.disposables);
	}

	private onDidUpdateConfiguration(e: IConfigurationServiceEvent) {
		this.configure(e.config);
	}

	private configure(config: IHTTPConfiguration) {
		this.proxyUrl = config.http && config.http.proxy;
		this.strictSSL = config.http && config.http.proxyStrictSSL;
		this.authorization = config.http && config.http.proxyAuthorization;
	}

	request(options: IRequestOptions, requestFn: IRequestFunction = request): TPromise<IRequestContext> {
		const { proxyUrl, strictSSL } = this;

		options.agent = options.agent || getProxyAgent(options.url, { proxyUrl, strictSSL });
		options.strictSSL = strictSSL;

		if (this.authorization) {
			options.headers = assign(options.headers || {}, { 'Proxy-Authorization': this.authorization });
		}

		return requestFn(options);
	}
}
