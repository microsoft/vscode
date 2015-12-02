/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import Timer = require('vs/base/common/timer');
import Async = require('vs/base/common/async');
import http = require('vs/base/common/http');
import winjs = require('vs/base/common/winjs.base');
import objects = require('vs/base/common/objects');
import {IRequestService} from 'vs/platform/request/common/request';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

/**
 * Simple IRequestService implementation to allow sharing of this service implementation
 * between different layers of the platform.
 */
export class BaseRequestService implements IRequestService {
	public serviceId = IRequestService;
	private _serviceMap:{[service:string]:string;};
	private _origin:string;

	/*protected*/ public _telemetryService:ITelemetryService;

	constructor(contextService: IWorkspaceContextService, telemetryService?: ITelemetryService) {
		var workspaceUri:string = null;

		var contextService = contextService;
		var workspace = contextService.getWorkspace();
		this._serviceMap = (<any>workspace) || Object.create(null);
		this._telemetryService = telemetryService;

		if (workspace) {
			workspaceUri = strings.rtrim(workspace.resource.toString(), '/') + '/';
		}

		this.computeOrigin(workspaceUri);
	}

	private computeOrigin(workspaceUri:string): void {
		if (workspaceUri) {

			// Find root server URL from configuration
			this._origin = workspaceUri;
			var urlPath = URI.parse(this._origin).path;
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

	protected makeCrossOriginRequest(options:http.IXHROptions): winjs.TPromise<http.IXHRResponse> {
		return null;
	}

	public makeRequest(options:http.IXHROptions):winjs.TPromise<http.IXHRResponse> {
		var timer:Timer.ITimerEvent = Timer.nullEvent;

		var isXhrRequestCORS = false;

		var url = options.url;
		if (!url) {
			throw new Error('IRequestService.makeRequest: Url is required');
		}

		if ((strings.startsWith(url, 'http://') || strings.startsWith(url, 'https://')) && this._origin && !strings.startsWith(url, this._origin)) {
			var coPromise = this.makeCrossOriginRequest(options);
			if (coPromise) {
				return coPromise;
			}
			isXhrRequestCORS = true;
		}

		var xhrOptions = <winjs.IXHROptions> options;

		if (!isXhrRequestCORS) {
			var additionalHeaders = {};
			if (this._telemetryService) {
				additionalHeaders['X-TelemetrySession'] = this._telemetryService.getSessionId();
			};
			additionalHeaders['X-Requested-With'] = 'XMLHttpRequest';
			xhrOptions.headers = objects.mixin(xhrOptions.headers, additionalHeaders);
		}

		if (options.timeout) {
			xhrOptions.customRequestInitializer = function(xhrRequest: XMLHttpRequest) {
				xhrRequest.timeout = options.timeout;
			};
		}


		return Async.always(winjs.xhr(xhrOptions),((xhr:XMLHttpRequest) => {
			if(timer.data) {
				timer.data.status = xhr.status;
			}
			timer.stop();
		}));
	}

	public makeChunkedRequest(options:http.IXHROptions):winjs.TPromise<{request:http.IXHRResponse; chunks:http.IDataChunk[];}> {
		var from = 0,
			c:winjs.ValueCallback, e:winjs.ErrorCallback, p:winjs.ProgressCallback,
			canceled = false;

		return new winjs.TPromise<{request:XMLHttpRequest; chunks:http.IDataChunk[];}>((_c, _e, _p) => {
			c = _c; e = _e; p = _p;
			this.makeRequest(options).done((request) => {
					var ret = {
						request: request,
						chunks: <http.IDataChunk[]>[]
					};
					from = http.parseChunkedData(request, ret.chunks, from);
					c(ret);
				},
				(err) => {
					e(err);
				},
				(request:XMLHttpRequest) => {
					// This might fail in IE10 for b i g request. Leave it enabled
					// for now to see if and when it fails
					// if(request.readyState === 3) {
					//	from = http.parseChunkedData(request, ret.chunks, from);
					// }
				}
			);
		}, () => {
			canceled = true;
		});
	}
}