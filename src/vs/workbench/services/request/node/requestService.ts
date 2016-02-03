/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise, Promise, xhr} from 'vs/base/common/winjs.base';
import http = require('vs/base/common/http');
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import strings = require('vs/base/common/strings');
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import timer = require('vs/base/common/timer');
import platform = require('vs/platform/platform');
import async = require('vs/base/common/async');
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import rawHttpService = require('vs/workbench/services/request/node/rawHttpService');
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

interface IRawHttpService {
	xhr(options: http.IXHROptions): TPromise<http.IXHRResponse>;
	configure(proxy: string, strictSSL: boolean): void;
}

interface IXHRFunction {
	(options: http.IXHROptions): TPromise<http.IXHRResponse>;
}

export class RequestService extends BaseRequestService {
	private callOnDispose: Function[];

	constructor(
		contextService: IWorkspaceContextService,
		private configurationService: IConfigurationService,
		telemetryService?: ITelemetryService
	) {
		super(contextService, telemetryService);
		this.callOnDispose = [];

		// proxy setting updating
		this.callOnDispose.push(configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => {
			this.rawHttpServicePromise.then((rawHttpService) => {
				rawHttpService.configure(e.config.http && e.config.http.proxy, e.config.http.proxyStrictSSL);
			});
		}));
	}

	private _rawHttpServicePromise: TPromise<IRawHttpService>;
	private get rawHttpServicePromise(): TPromise<IRawHttpService> {
		if (!this._rawHttpServicePromise) {
			this._rawHttpServicePromise = this.configurationService.loadConfiguration().then((configuration: any) => {
				rawHttpService.configure(configuration.http && configuration.http.proxy, configuration.http.proxyStrictSSL);
				return rawHttpService;
			});
		}

		return this._rawHttpServicePromise;
	}

	public dispose(): void {
		lifecycle.cAll(this.callOnDispose);
	}

	public makeRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
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

	/**
	 * Make a cross origin request using NodeJS.
	 * Note: This method is also called from workers.
	 */
	protected makeCrossOriginRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
		let timerVar: timer.ITimerEvent = timer.nullEvent;
		return this.rawHttpServicePromise.then((rawHttpService: IRawHttpService) => {
			return async.always(rawHttpService.xhr(options), ((xhr: http.IXHRResponse) => {
				if (timerVar.data) {
					timerVar.data.status = xhr.status;
				}
				timerVar.stop();
			}));
		});
	}
}

// Configuration
let confRegistry = <IConfigurationRegistry>platform.Registry.as(Extensions.Configuration);
confRegistry.registerConfiguration({
	'id': 'http',
	'order': 9,
	'title': nls.localize('httpConfigurationTitle', "HTTP configuration"),
	'type': 'object',
	'properties': {
		'http.proxy': {
			'type': 'string',
			'description': nls.localize('proxy', "The proxy setting to use. If not set will be taken from the http_proxy and https_proxy environment variables")
		},
		'http.proxyStrictSSL': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('strictSSL', "Whether the proxy server certificate should be verified against the list of supplied CAs.")
		}
	}
});