/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRequestOptions, IRequestContext, request } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IRequestService2, IHTTPConfiguration } from 'vs/platform/request/common/request';
import { IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';

/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
export class RequestService2 implements IRequestService2 {

	_serviceBrand: any;

	private proxyUrl: string;
	private strictSSL: boolean;
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
	}

	request(options: IRequestOptions): TPromise<IRequestContext> {
		if (!options.agent) {
			const { proxyUrl, strictSSL } = this;
			options.agent = getProxyAgent(options.url, { proxyUrl, strictSSL });
		}

		return request(options);
	}
}
