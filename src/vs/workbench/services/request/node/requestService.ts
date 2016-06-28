/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { xhr } from 'vs/base/common/network';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import strings = require('vs/base/common/strings');
import nls = require('vs/nls');
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import platform = require('vs/platform/platform');
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { BaseRequestService } from 'vs/platform/request/common/baseRequestService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { assign } from 'vs/base/common/objects';
import { IXHROptions, IXHRResponse } from 'vs/base/common/http';
import { request } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { createGunzip } from 'zlib';
import { Stream } from 'stream';

interface IHTTPConfiguration {
	http?: {
		proxy?: string;
		proxyStrictSSL?: boolean;
	};
}

export class RequestService extends BaseRequestService {

	private disposables: IDisposable[];
	private proxyUrl: string = null;
	private strictSSL: boolean = true;

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService?: ITelemetryService
	) {
		super(contextService, telemetryService);
		this.disposables = [];

		const config = configurationService.getConfiguration<IHTTPConfiguration>();
		this.configure(config);

		const disposable = configurationService.onDidUpdateConfiguration(e => this.configure(e.config));
		this.disposables.push(disposable);
	}

	private configure(config: IHTTPConfiguration) {
		this.proxyUrl = config.http && config.http.proxy;
		this.strictSSL = config.http && config.http.proxyStrictSSL;
	}

	makeRequest(options: IXHROptions): TPromise<IXHRResponse> {
		let url = options.url;
		if (!url) {
			throw new Error('IRequestService.makeRequest: Url is required.');
		}

		// Support file:// in native environment through XHR
		if (strings.startsWith(url, 'file://')) {
			return xhr(options).then(null, (xhr: XMLHttpRequest) => {
				if (xhr.status === 0 && xhr.responseText) {
					return xhr; // loading resources locally returns a status of 0 which in WinJS is an error so we need to handle it here
				}

				return <any>Promise.wrapError({ status: 404, responseText: nls.localize('localFileNotFound', "File not found.")});
			});
		}

		return super.makeRequest(options);
	}

	protected makeCrossOriginRequest(options: IXHROptions): TPromise<IXHRResponse> {
		const { proxyUrl, strictSSL } = this;
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

// Configuration
let confRegistry = <IConfigurationRegistry>platform.Registry.as(Extensions.Configuration);
confRegistry.registerConfiguration({
	id: 'http',
	order: 15,
	title: nls.localize('httpConfigurationTitle', "HTTP"),
	type: 'object',
	properties: {
		'http.proxy': {
			type: 'string',
			pattern: '^https?://[^:]+(:\\d+)?$|^$',
			description: nls.localize('proxy', "The proxy setting to use. If not set will be taken from the http_proxy and https_proxy environment variables")
		},
		'http.proxyStrictSSL': {
			type: 'boolean',
			default: true,
			description: nls.localize('strictSSL', "Whether the proxy server certificate should be verified against the list of supplied CAs.")
		}
	}
});