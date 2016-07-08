/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {xhr, IXHROptions} from 'vs/base/common/network';
import strings = require('vs/base/common/strings');
import Timer = require('vs/base/common/timer');
import Async = require('vs/base/common/async');
import http = require('vs/base/common/http');
import objects = require('vs/base/common/objects');
import {IRequestService} from 'vs/platform/request/common/request';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

/**
 * Simple IRequestService implementation to allow sharing of this service implementation
 * between different layers of the platform.
 */
export class BaseRequestService implements IRequestService {
	public _serviceBrand: any;
	private _serviceMap: { [service: string]: string; };
	private _origin: string;

	protected _telemetryService: ITelemetryService;

	constructor(contextService: IWorkspaceContextService, telemetryService: ITelemetryService = NullTelemetryService) {
		let workspaceUri: string = null;

		let workspace = contextService.getWorkspace();
		this._serviceMap = (<any>workspace) || Object.create(null);
		this._telemetryService = telemetryService;

		if (workspace) {
			workspaceUri = strings.rtrim(workspace.resource.toString(), '/') + '/';
		}

		this.computeOrigin(workspaceUri);
	}

	private computeOrigin(workspaceUri: string): void {
		if (workspaceUri) {

			// Find root server URL from configuration
			this._origin = workspaceUri;
			let urlPath = URI.parse(this._origin).path;
			if (urlPath && urlPath.length > 0) {
				this._origin = this._origin.substring(0, this._origin.length - urlPath.length + 1);
			}

			if (!strings.endsWith(this._origin, '/')) {
				this._origin += '/';
			}
		} else {
			this._origin = '/'; // Configuration not provided, fallback to default
		}
	}

	protected makeCrossOriginRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
		return null;
	}

	public makeRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
		let timer: Timer.ITimerEvent = Timer.nullEvent;

		let isXhrRequestCORS = false;

		let url = options.url;
		if (!url) {
			throw new Error('IRequestService.makeRequest: Url is required');
		}

		if ((strings.startsWith(url, 'http://') || strings.startsWith(url, 'https://')) && this._origin && !strings.startsWith(url, this._origin)) {
			let coPromise = this.makeCrossOriginRequest(options);
			if (coPromise) {
				return coPromise;
			}
			isXhrRequestCORS = true;
		}

		let xhrOptions = <IXHROptions>options;

		let xhrOptionsPromise = TPromise.as(undefined);
		if (!isXhrRequestCORS) {
			xhrOptions = this._telemetryService.getTelemetryInfo().then(info => {
				let additionalHeaders = {};
				additionalHeaders['X-TelemetrySession'] = info.sessionId;
				additionalHeaders['X-Requested-With'] = 'XMLHttpRequest';
				xhrOptions.headers = objects.mixin(xhrOptions.headers, additionalHeaders);
			});
		}

		if (options.timeout) {
			xhrOptions.customRequestInitializer = function(xhrRequest: XMLHttpRequest) {
				xhrRequest.timeout = options.timeout;
			};
		}

		return xhrOptionsPromise.then(() => {
			return Async.always(xhr(xhrOptions), ((xhr: XMLHttpRequest) => {
				if (timer.data) {
					timer.data.status = xhr.status;
				}
				timer.stop();
			}));
		});
	}
}
