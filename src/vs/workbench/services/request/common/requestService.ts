/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise, xhr} from 'vs/base/common/winjs.base';
import {ITimerEvent, nullEvent} from 'vs/base/common/timer';
import async = require('vs/base/common/async');
import http = require('vs/base/common/http');
import strings = require('vs/base/common/strings');
import nls = require('vs/nls');
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, IThreadSynchronizableObject} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

interface IXHRFunction {
	(options:http.IXHROptions): TPromise<http.IXHRResponse>;
}

export class WorkerRequestService extends BaseRequestService implements IThreadSynchronizableObject<{}> {

	private _nodeJSXHRFunctionPromise: TPromise<IXHRFunction>;
	private _threadService: IThreadService;

	constructor(
		@IThreadService threadService: IThreadService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService?: ITelemetryService
	) {
		super(contextService, telemetryService);

		this._threadService = threadService;

		threadService.registerInstance(this);
	}

	/**
	 * IThreadSynchronizableObject Id. Must match id in NativeRequestService.
	 */
	public getId(): string {
		return 'NativeRequestService';
	}

	public makeRequest(options:http.IXHROptions):TPromise<http.IXHRResponse> {
		let url = options.url;
		if (!url) {
			throw new Error('IRequestService.makeRequest: Url is required');
		}

		// Support file:// in worker environment through XHR
		if (strings.startsWith(url, 'file://')) {
			return xhr(options).then(null, (xhr:XMLHttpRequest) => {
				if (xhr.status === 0 && xhr.responseText) {
					return xhr; // loading resources locally returns a status of 0 which in WinJS is an error so we need to handle it here
				}

				return <any>Promise.wrapError(new Error(nls.localize('localFileNotFound', "File not found")));
			});
		}

		return super.makeRequest(options);
	}

	protected makeCrossOriginRequest(options:http.IXHROptions): TPromise<http.IXHRResponse> {
		if (this._nodeJSXHRFunctionPromise) {
			// use nodejs to make the call

			let timer:ITimerEvent = nullEvent;
			return this._nodeJSXHRFunctionPromise.then((xhrFunction) => {
				return async.always(xhrFunction(options), ((xhr:XMLHttpRequest) => {
					if(timer.data) {
						timer.data.status = xhr.status;
					}
					timer.stop();
				}));
			});
		} else {
			// use the main thread to make the call
			return <TPromise<http.IXHRResponse>> this._threadService.MainThread(this, 'makeCrossOriginRequest', null, [options]);
		}
	}

}
